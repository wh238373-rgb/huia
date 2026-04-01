import {
  formatClock,
  formatDurationSeconds,
  formatFullPrice,
  formatSignedPercent,
  formatUsdCompact,
  formatUsdInteger,
  toFixedSmart
} from "./utils.js";
import { buildExchangePairUrl, getExchangeMeta } from "./exchange-meta.js";

function exchangeIcon(exchange) {
  if (exchange === "MEXC") {
    return "🟦";
  }

  if (exchange === "GATE") {
    return "🟧";
  }

  return "⬜";
}

function assetName(symbol) {
  return symbol.replace(/USDT$/, "");
}

export function buildSignalReplyMarkup(payload) {
  const token = assetName(payload.symbol);

  return {
    inline_keyboard: [
      [
        {
          text: `🟦 MEXC: ${token}`,
          url: buildExchangePairUrl("MEXC", payload.symbol)
        }
      ],
      [
        {
          text: `🟧 GATE: ${token}`,
          url: buildExchangePairUrl("GATE", payload.symbol)
        }
      ]
    ]
  };
}

export function formatChannelMessage(opportunity) {
  const currentExchange = opportunity.trackedExchange || opportunity.exchange;
  const currentPrice = opportunity.currentPrice;
  const fairPrice = opportunity.frozenFairPrice ?? opportunity.fairPrice;
  const currentDeviation = opportunity.currentDeviation ?? opportunity.deviationPercent;
  const exchangeMeta = getExchangeMeta(currentExchange);
  const percentText = `${Math.abs(currentDeviation).toFixed(2)}%`;
  const maxLeverage = opportunity.maxLeverage
    ? `${String(opportunity.maxLeverage).replace(/x$/i, "")}x`
    : exchangeMeta.maxLeverage;
  const maxPositionUsd = opportunity.maxPositionUsd ?? exchangeMeta.maxPositionUsd;

  return [
    `${exchangeIcon(currentExchange)} ${currentExchange} ${percentText} ${opportunity.symbol}`,
    `Ⓜ️ MC: ${formatUsdCompact(opportunity.marketCapUsd)} | ${assetName(opportunity.symbol)}`,
    "",
    `🟢 Ціна: ${formatFullPrice(currentPrice)}`,
    `⚖️ Справедлива: ${formatFullPrice(fairPrice)}`,
    "=========================",
    `💪 Макс. плече: ${maxLeverage}`,
    `💰 Макс. позиція: ${formatUsdInteger(maxPositionUsd)}`,
    "---------------------------------",
    `⏰ Виявлено о : ${formatClock(new Date(opportunity.updatedAt))}`
  ].join("\n");
}

export function formatSignalClosedMessage(signal) {
  const finalPrice = signal.lastPayload?.currentPrice;
  const finalDeviation =
    signal.lastPayload?.currentDeviation ?? signal.lastSpreadPercent;
  const exchange = signal.exchange || signal.lastPayload?.exchange || signal.trackedExchange || "MEXC";
  const symbol = signal.symbol || signal.lastPayload?.symbol || "";
  const token = assetName(symbol);
  const marketCapUsd = signal.marketCapUsd ?? signal.lastPayload?.marketCapUsd;
  const exchangeMeta = getExchangeMeta(exchange);
  const maxLeverage = signal.lastPayload?.maxLeverage
    ? `${String(signal.lastPayload.maxLeverage).replace(/x$/i, "")}x`
    : exchangeMeta.maxLeverage;
  const maxPositionUsd = signal.lastPayload?.maxPositionUsd ?? exchangeMeta.maxPositionUsd;

  return [
    `${exchangeIcon(exchange)} ${exchange} ${token}`,
    `Ⓜ️ MC: ${formatUsdCompact(marketCapUsd)} | ${token}`,
    "",
    `💪 Макс. плече: ${maxLeverage}`,
    `💰 Макс. позиція: ${formatUsdInteger(maxPositionUsd)}`,
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "✅ Ціни зійшлись!",
    `💰 Фінальна ціна: ${formatFullPrice(finalPrice)}`,
    `📊 Зміна у відсотках: ${formatSignedPercent(finalDeviation)}`,
    `⏱ Зійшлось через: ${formatDurationSeconds(signal.openedAt, signal.closedAt)}`
  ].join("\n");
}

export function formatBoardSummary(opportunities, thresholdPercent, totalPairs) {
  const lines = [
    `=== LIVE MEXC / GATE ===`,
    `Pairs scanned: ${totalPairs}`,
    `Fair price trigger: ${thresholdPercent}%`,
    ""
  ];

  for (const item of opportunities) {
    const currentExchange = item.exchange;
    const currentPrice = item.currentPrice;
    lines.push(
      `${item.symbol} | ${currentExchange} ${toFixedSmart(currentPrice)} | fair ${toFixedSmart(item.fairPrice)}${item.isTriggered ? " | ALERT" : ""}`
    );
  }

  return lines.join("\n");
}
