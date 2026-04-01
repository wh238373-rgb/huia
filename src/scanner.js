import { fetchCommonSymbols, MarketDataService } from "./services/market-data.js";
import { MarketCapService } from "./services/market-cap-service.js";
import { buildOpportunities } from "./services/spread-engine.js";
import { pctDiff } from "./utils.js";
import { sleep } from "./utils.js";

function toDisplayOpportunity(opportunity, activeSignal = null) {
  const trackedExchange = activeSignal?.trackedExchange || opportunity.exchange;
  const frozenFairPrice = activeSignal?.frozenFairPrice || opportunity.fairPrice;
  const currentPrice = opportunity.currentPrice;
  const currentDeviation = pctDiff(currentPrice, frozenFairPrice);

  return {
    ...opportunity,
    trackedExchange,
    currentPrice,
    frozenFairPrice,
    currentDeviation,
    marketCapUsd: activeSignal?.marketCapUsd ?? opportunity.marketCapUsd ?? null
  };
}

function buildRenderKey(displayOpportunity) {
  const currentExchange = displayOpportunity.trackedExchange;
  const currentPrice = displayOpportunity.currentPrice;

  return [
    currentExchange,
    currentPrice.toFixed(8),
    displayOpportunity.frozenFairPrice.toFixed(8),
    displayOpportunity.currentDeviation.toFixed(2)
  ].join("|");
}

function formatCandidateLine(item) {
  return `${item.exchange} ${item.symbol} current=${item.currentPrice.toFixed(6)} fair=${item.fairPrice.toFixed(6)} dev=${item.deviationPercent.toFixed(2)}%`;
}

function splitByExchange(opportunities) {
  const mexc = [];
  const gate = [];

  for (const item of opportunities) {
    if (item.exchange === "MEXC") {
      mexc.push(item);
      continue;
    }

    if (item.exchange === "GATE") {
      gate.push(item);
    }
  }

  return { mexc, gate };
}

export class MarketScanner {
  constructor({
    quoteCurrency,
    thresholdPercent,
    pollIntervalMs,
    notifier,
    topSignals,
    maxActiveSignals,
    maxActiveSignalsPerExchange,
    minSignalUpdateMs,
    min24hQuoteVolumeUsd,
    requestTimeoutMs,
    requestRetries
  }) {
    this.quoteCurrency = quoteCurrency;
    this.thresholdPercent = thresholdPercent;
    this.pollIntervalMs = pollIntervalMs;
    this.notifier = notifier;
    this.topSignals = topSignals;
    this.maxActiveSignals = maxActiveSignals;
    this.maxActiveSignalsPerExchange = maxActiveSignalsPerExchange;
    this.minSignalUpdateMs = minSignalUpdateMs;
    this.min24hQuoteVolumeUsd = min24hQuoteVolumeUsd;
    this.commonSymbols = [];
    this.activeSignals = new Map();
    this.marketCapService = new MarketCapService();
    this.marketDataService = new MarketDataService({
      requestTimeoutMs,
      requestRetries
    });
  }

  async start() {
    while (true) {
      try {
        if (this.commonSymbols.length === 0) {
          this.commonSymbols = await fetchCommonSymbols(this.quoteCurrency);
          console.log(
            `Loaded ${this.commonSymbols.length} ${this.quoteCurrency} futures pairs from MEXC/GATE universe`
          );
        }

        await this.scanOnce();
      } catch (error) {
        console.error(`Scanner error: ${error.message}`);
      }

      await sleep(this.pollIntervalMs);
    }
  }

  async scanOnce() {
    const marketResult = await this.marketDataService.fetchMarketSnapshot(
      this.commonSymbols,
      this.min24hQuoteVolumeUsd
    );
    const marketSnapshot = marketResult.items;
    const opportunities = buildOpportunities(marketSnapshot, this.thresholdPercent);
    const { mexc: mexcOpportunities, gate: gateOpportunities } = splitByExchange(opportunities);
    const mexcTriggered = mexcOpportunities
      .filter((item) => item.isTriggered)
      .slice(0, this.maxActiveSignalsPerExchange);
    const gateTriggered = gateOpportunities
      .filter((item) => item.isTriggered)
      .slice(0, this.maxActiveSignalsPerExchange);
    const triggered = [...mexcTriggered, ...gateTriggered]
      .sort((a, b) => b.absDeviationPercent - a.absDeviationPercent)
      .slice(0, this.maxActiveSignalsPerExchange * 2);
    const currentKeys = new Set(triggered.map((item) => `${item.exchange}:${item.symbol}`));

    const strongest = opportunities[0] || null;
    const strongestMexc = mexcOpportunities[0] || null;
    const strongestGate = gateOpportunities[0] || null;
    console.log(
      `[scan] symbols=${marketSnapshot.length} mexc=${marketResult.meta.mexcCount}${marketResult.meta.mexcUsedCache ? "(cache)" : ""} gate=${marketResult.meta.gateCount}${marketResult.meta.gateUsedCache ? "(cache)" : ""} candidates=${opportunities.length} triggered_total=${triggered.length} triggered_mexc=${mexcTriggered.length} triggered_gate=${gateTriggered.length}${
        strongestMexc ? ` | mexc_top=${formatCandidateLine(strongestMexc)}` : ""
      }${
        strongestGate ? ` | gate_top=${formatCandidateLine(strongestGate)}` : ""
      }${
        !strongestMexc && !strongestGate && strongest ? ` | top=${formatCandidateLine(strongest)}` : ""
      }`
    );

    await this.notifier?.onBoard?.(
      [
        ...mexcOpportunities.slice(0, this.topSignals),
        ...gateOpportunities.slice(0, this.topSignals)
      ].sort((a, b) => b.absDeviationPercent - a.absDeviationPercent),
      this.thresholdPercent,
      marketSnapshot.length
    );

    for (const opportunity of triggered) {
      const signalKey = `${opportunity.exchange}:${opportunity.symbol}`;
      const existing = this.activeSignals.get(signalKey);

      if (!existing) {
        const marketCapUsd = await this.marketCapService.getMarketCapBySymbol(
          opportunity.symbol.replace(/USDT$/, "")
        );
        const displayOpportunity = toDisplayOpportunity({
          ...opportunity,
          marketCapUsd
        });

        this.activeSignals.set(signalKey, {
          symbol: opportunity.symbol,
          exchange: opportunity.exchange,
          openedAt: opportunity.updatedAt,
          lastSpreadPercent: opportunity.absDeviationPercent,
          trackedExchange: displayOpportunity.trackedExchange,
          frozenFairPrice: displayOpportunity.frozenFairPrice,
          marketCapUsd,
          lastPayload: displayOpportunity,
          lastRenderKey: buildRenderKey(displayOpportunity),
          lastUpdatedAt: Date.now()
        });
        await this.notifier?.onSignalOpen?.(displayOpportunity, this.thresholdPercent);
        continue;
      }

      const displayOpportunity = toDisplayOpportunity(opportunity, existing);
      const nextRenderKey = buildRenderKey(displayOpportunity);
      const now = Date.now();

      existing.lastSpreadPercent = opportunity.absDeviationPercent;
      existing.lastPayload = displayOpportunity;
      const shouldUpdate = existing.lastRenderKey !== nextRenderKey;
      const enoughTimePassed =
        !existing.lastUpdatedAt || now - existing.lastUpdatedAt >= this.minSignalUpdateMs;

      if (shouldUpdate && enoughTimePassed) {
        existing.lastRenderKey = nextRenderKey;
        existing.lastUpdatedAt = now;
        await this.notifier?.onSignalUpdate?.(displayOpportunity, existing);
      }
    }

    for (const [signalKey, activeSignal] of this.activeSignals.entries()) {
      if (currentKeys.has(signalKey)) {
        continue;
      }

      this.activeSignals.delete(signalKey);
      await this.notifier?.onSignalClose?.({
        ...activeSignal,
        closedAt: new Date().toISOString()
      });
    }
  }
}
