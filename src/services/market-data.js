import { fetchJson, nowIso, retry } from "../utils.js";

const MEXC_FUTURES_DETAIL_URL = "https://contract.mexc.com/api/v1/contract/detail";
const MEXC_FUTURES_TICKER_URL = "https://contract.mexc.com/api/v1/contract/ticker";
const GATE_FUTURES_CONTRACTS_URL = "https://fx-api.gateio.ws/api/v4/futures/usdt/contracts";

function normalizeGateId(id) {
  return id.replace("_", "");
}

function normalizeMexcId(id) {
  return id.replace("_", "");
}

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function gateQuoteVolumeUsd(contract) {
  const direct =
    numberOrNull(contract.volume_24h_quote) ??
    numberOrNull(contract.volume_24h_usdt) ??
    numberOrNull(contract.turnover_24h) ??
    numberOrNull(contract.volume_24h_settle);

  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const baseVolume =
    numberOrNull(contract.volume_24h_base) ??
    numberOrNull(contract.volume_24h) ??
    numberOrNull(contract.volume_base);
  const price = numberOrNull(contract.mark_price) ?? numberOrNull(contract.last_price);

  if (Number.isFinite(baseVolume) && Number.isFinite(price)) {
    return baseVolume * price;
  }

  return 0;
}

function mexcQuoteVolumeUsd(contract) {
  return (
    numberOrNull(contract.amount24) ??
    numberOrNull(contract.turnoverVolume) ??
    numberOrNull(contract.volume24) ??
    0
  );
}

export async function fetchCommonSymbols(quoteCurrency) {
  const [mexcContractsResponse, gateContractsResponse] = await Promise.all([
    retry(() => fetchJson(MEXC_FUTURES_DETAIL_URL, { timeoutMs: 45000 }), {
      retries: 2,
      delayMs: 1500
    }),
    retry(() => fetchJson(GATE_FUTURES_CONTRACTS_URL, { timeoutMs: 45000 }), {
      retries: 2,
      delayMs: 1500
    })
  ]);

  const mexcContracts = asArray(mexcContractsResponse);
  const gateContracts = asArray(gateContractsResponse);

  const mexcSymbols = new Map(
    mexcContracts
      .filter((item) => {
        const symbol = String(item.symbol || "");
        return symbol.endsWith(`_${quoteCurrency}`) && String(item.state || item.status || "0") !== "1";
      })
      .map((item) => [normalizeMexcId(item.symbol), item])
  );

  const gateSymbols = new Map(
    gateContracts
      .filter((item) => String(item.name || "").endsWith(`_${quoteCurrency}`))
      .map((item) => [normalizeGateId(item.name), item])
  );

  const allSymbols = new Map();

  for (const [symbol, mexcContract] of mexcSymbols) {
    allSymbols.set(symbol, {
      symbol,
      mexcContract,
      gateContract: gateSymbols.get(symbol) || null
    });
  }

  for (const [symbol, gateContract] of gateSymbols) {
    const existing = allSymbols.get(symbol);

    if (existing) {
      existing.gateContract = gateContract;
      continue;
    }

    allSymbols.set(symbol, {
      symbol,
      mexcContract: null,
      gateContract
    });
  }

  return Array.from(allSymbols.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export class MarketDataService {
  constructor({ requestTimeoutMs = 45000, requestRetries = 2 } = {}) {
    this.requestTimeoutMs = requestTimeoutMs;
    this.requestRetries = requestRetries;
    this.lastMexcTickers = [];
    this.lastGateContracts = [];
  }

  async fetchLatest() {
    const [mexcResult, gateResult] = await Promise.allSettled([
      retry(
        () => fetchJson(MEXC_FUTURES_TICKER_URL, { timeoutMs: this.requestTimeoutMs }),
        { retries: this.requestRetries, delayMs: 1500 }
      ),
      retry(
        () => fetchJson(GATE_FUTURES_CONTRACTS_URL, { timeoutMs: this.requestTimeoutMs }),
        { retries: this.requestRetries, delayMs: 1500 }
      )
    ]);

    let mexcUsedCache = false;
    let gateUsedCache = false;

    if (mexcResult.status === "fulfilled") {
      this.lastMexcTickers = asArray(mexcResult.value);
    } else if (this.lastMexcTickers.length > 0) {
      mexcUsedCache = true;
    } else {
      throw mexcResult.reason;
    }

    if (gateResult.status === "fulfilled") {
      this.lastGateContracts = asArray(gateResult.value);
    } else if (this.lastGateContracts.length > 0) {
      gateUsedCache = true;
    } else {
      throw gateResult.reason;
    }

    return {
      mexcTickers: this.lastMexcTickers,
      gateContracts: this.lastGateContracts,
      mexcUsedCache,
      gateUsedCache
    };
  }

  async fetchMarketSnapshot(commonSymbols, min24hQuoteVolumeUsd) {
    const {
      mexcTickers,
      gateContracts,
      mexcUsedCache,
      gateUsedCache
    } = await this.fetchLatest();
    const mexcMap = new Map();

    for (const ticker of mexcTickers) {
      const symbol = normalizeMexcId(String(ticker.symbol || ""));
      const currentPrice = numberOrNull(ticker.lastPrice);
      const fairPrice = numberOrNull(ticker.fairPrice) ?? numberOrNull(ticker.holdFairPrice);
      const quoteVolume = mexcQuoteVolumeUsd(ticker);

      if (
        !symbol ||
        !Number.isFinite(currentPrice) ||
        !Number.isFinite(fairPrice) ||
        fairPrice <= 0 ||
        quoteVolume < min24hQuoteVolumeUsd
      ) {
        continue;
      }

      mexcMap.set(symbol, {
        exchange: "MEXC",
        symbol,
        currentPrice,
        fairPrice,
        quoteVolume,
        maxLeverage: String(ticker.maxLeverage ?? ""),
        maxPositionUsd: numberOrNull(ticker.maxVol) ?? null
      });
    }

    const gateMap = new Map();

    for (const contract of gateContracts) {
      const gateId = String(contract.name || "");
      const symbol = normalizeGateId(gateId);
      const currentPrice = numberOrNull(contract.last_price);
      const fairPrice = numberOrNull(contract.mark_price);
      const quoteVolume = gateQuoteVolumeUsd(contract);

      if (
        !gateId ||
        !Number.isFinite(currentPrice) ||
        !Number.isFinite(fairPrice) ||
        fairPrice <= 0 ||
        quoteVolume < min24hQuoteVolumeUsd
      ) {
        continue;
      }

      gateMap.set(symbol, {
        exchange: "GATE",
        symbol,
        contractName: gateId,
        currentPrice,
        fairPrice,
        quoteVolume,
        maxLeverage: String(contract.leverage_max || ""),
        maxPositionUsd:
          numberOrNull(contract.order_size_max) && numberOrNull(contract.quanto_multiplier)
            ? Number(contract.order_size_max) *
              Number(contract.quanto_multiplier) *
              currentPrice
            : null
      });
    }

    const updatedAt = nowIso();

    const items = commonSymbols
      .map(({ symbol }) => {
        const mexc = mexcMap.get(symbol);
        const gate = gateMap.get(symbol);
        return {
          symbol,
          mexc: mexc || null,
          gate: gate || null,
          updatedAt
        };
      })
      .filter((item) => item.mexc || item.gate);

    return {
      items,
      meta: {
        mexcCount: mexcMap.size,
        gateCount: gateMap.size,
        mexcUsedCache,
        gateUsedCache
      }
    };
  }
}
