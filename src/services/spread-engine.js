import { pctDiff } from "../utils.js";

function buildExchangeOpportunity(symbol, exchangeData, updatedAt, thresholdPercent) {
  const deviationPercent = pctDiff(exchangeData.currentPrice, exchangeData.fairPrice);

  return {
    symbol,
    exchange: exchangeData.exchange,
    updatedAt,
    currentPrice: exchangeData.currentPrice,
    fairPrice: exchangeData.fairPrice,
    deviationPercent,
    absDeviationPercent: Math.abs(deviationPercent),
    thresholdPercent,
    maxLeverage: exchangeData.maxLeverage,
    maxPositionUsd: exchangeData.maxPositionUsd,
    quoteVolume: exchangeData.quoteVolume,
    isTriggered: Math.abs(deviationPercent) >= thresholdPercent
  };
}

export function buildOpportunities(contracts, thresholdPercent) {
  return contracts
    .flatMap((contract) => [
      buildExchangeOpportunity(contract.symbol, contract.mexc, contract.updatedAt, thresholdPercent),
      buildExchangeOpportunity(contract.symbol, contract.gate, contract.updatedAt, thresholdPercent)
    ])
    .sort((a, b) => b.absDeviationPercent - a.absDeviationPercent);
}
