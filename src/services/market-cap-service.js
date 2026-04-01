import { fetchJson } from "../utils.js";

function normalizeSymbol(symbol) {
  return String(symbol || "").toLowerCase();
}

function pickBestCoin(items, symbol) {
  const normalized = normalizeSymbol(symbol);

  return items
    .filter((item) => normalizeSymbol(item.symbol) === normalized)
    .sort((a, b) => {
      const rankA = Number.isFinite(a.market_cap_rank) ? a.market_cap_rank : Number.MAX_SAFE_INTEGER;
      const rankB = Number.isFinite(b.market_cap_rank) ? b.market_cap_rank : Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    })[0] || null;
}

export class MarketCapService {
  constructor() {
    this.cache = new Map();
  }

  async getMarketCapBySymbol(symbol) {
    const key = normalizeSymbol(symbol);

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const url =
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${encodeURIComponent(key)}` +
        `&include_tokens=all&order=market_cap_desc&per_page=25&page=1&sparkline=false&locale=en`;
      const data = await fetchJson(url);
      const match = Array.isArray(data) ? pickBestCoin(data, symbol) : null;
      const marketCap = Number(match?.market_cap);
      const result = Number.isFinite(marketCap) ? marketCap : null;

      this.cache.set(key, result);
      return result;
    } catch {
      this.cache.set(key, null);
      return null;
    }
  }
}
