import { config } from "./config.js";
import { ConsoleNotifier } from "./notifiers/console-notifier.js";
import { TelegramNotifier } from "./notifiers/telegram-notifier.js";
import { MarketScanner } from "./scanner.js";

function createNotifier() {
  if (
    !config.dryRun &&
    config.telegramBotToken &&
    config.telegramChatId
  ) {
    return new TelegramNotifier({
      botToken: config.telegramBotToken,
      chatId: config.telegramChatId,
      threadId: config.telegramThreadId
    });
  }

  return new ConsoleNotifier();
}

const notifier = createNotifier();
const scanner = new MarketScanner({
  quoteCurrency: config.quoteCurrency,
  thresholdPercent: config.thresholdPercent,
  pollIntervalMs: config.pollIntervalMs,
  notifier,
  topSignals: config.topSignals,
  maxActiveSignals: config.maxActiveSignals,
  minSignalUpdateMs: config.minSignalUpdateMs,
  min24hQuoteVolumeUsd: config.min24hQuoteVolumeUsd,
  requestTimeoutMs: config.requestTimeoutMs,
  requestRetries: config.requestRetries
});

console.log(
  `Starting MEXC/GATE scanner for all ${config.quoteCurrency} pairs with ${config.thresholdPercent}% trigger`
);

await scanner.start();
