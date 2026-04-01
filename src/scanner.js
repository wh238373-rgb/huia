import { fetchCommonSymbols, fetchMarketSnapshot } from "./services/market-data.js";
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

export class MarketScanner {
  constructor({
    quoteCurrency,
    thresholdPercent,
    pollIntervalMs,
    notifier,
    topSignals,
    maxActiveSignals,
    minSignalUpdateMs,
    min24hQuoteVolumeUsd
  }) {
    this.quoteCurrency = quoteCurrency;
    this.thresholdPercent = thresholdPercent;
    this.pollIntervalMs = pollIntervalMs;
    this.notifier = notifier;
    this.topSignals = topSignals;
    this.maxActiveSignals = maxActiveSignals;
    this.minSignalUpdateMs = minSignalUpdateMs;
    this.min24hQuoteVolumeUsd = min24hQuoteVolumeUsd;
    this.commonSymbols = [];
    this.activeSignals = new Map();
    this.marketCapService = new MarketCapService();
  }

  async start() {
    while (true) {
      try {
        if (this.commonSymbols.length === 0) {
          this.commonSymbols = await fetchCommonSymbols(this.quoteCurrency);
          console.log(
            `Loaded ${this.commonSymbols.length} common ${this.quoteCurrency} pairs between MEXC and Gate`
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
    const marketSnapshot = await fetchMarketSnapshot(
      this.commonSymbols,
      this.min24hQuoteVolumeUsd
    );
    const opportunities = buildOpportunities(marketSnapshot, this.thresholdPercent);
    const triggered = opportunities
      .filter((item) => item.isTriggered)
      .slice(0, this.maxActiveSignals);
    const currentKeys = new Set(triggered.map((item) => `${item.exchange}:${item.symbol}`));

    const strongest = opportunities[0] || null;
    console.log(
      `[scan] exchanges=${marketSnapshot.length} candidates=${opportunities.length} triggered=${triggered.length}${
        strongest ? ` | top=${formatCandidateLine(strongest)}` : ""
      }`
    );

    await this.notifier?.onBoard?.(
      opportunities.slice(0, this.topSignals),
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
