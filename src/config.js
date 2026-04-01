import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  thresholdPercent: numberFromEnv("THRESHOLD_PERCENT", 5),
  pollIntervalMs: numberFromEnv("POLL_INTERVAL_MS", 4000),
  quoteCurrency: (process.env.QUOTE_CURRENCY || "USDT").toUpperCase(),
  topSignals: numberFromEnv("TOP_SIGNALS", 5),
  maxActiveSignals: numberFromEnv("MAX_ACTIVE_SIGNALS", 3),
  maxActiveSignalsPerExchange: numberFromEnv(
    "MAX_ACTIVE_SIGNALS_PER_EXCHANGE",
    numberFromEnv("MAX_ACTIVE_SIGNALS", 3)
  ),
  minSignalUpdateMs: numberFromEnv("MIN_SIGNAL_UPDATE_MS", 15000),
  min24hQuoteVolumeUsd: numberFromEnv("MIN_24H_QUOTE_VOLUME_USD", 1000000),
  requestTimeoutMs: numberFromEnv("REQUEST_TIMEOUT_MS", 45000),
  requestRetries: numberFromEnv("REQUEST_RETRIES", 2),
  dryRun: String(process.env.DRY_RUN || "true").toLowerCase() === "true",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  telegramThreadId: process.env.TELEGRAM_THREAD_ID || ""
};
