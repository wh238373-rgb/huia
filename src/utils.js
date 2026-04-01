export function toFixedSmart(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (value >= 1000) {
    return value.toFixed(2);
  }

  if (value >= 1) {
    return value.toFixed(4);
  }

  return value.toFixed(digits);
}

export function formatFullPrice(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (value >= 1000) {
    return value.toFixed(2);
  }

  if (value >= 1) {
    return value.toFixed(6);
  }

  if (value >= 0.01) {
    return value.toFixed(8);
  }

  return value.toFixed(10);
}

export function formatUsdCompact(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "???";
  }

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B$`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M$`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K$`;
  }

  return `${value.toFixed(0)}$`;
}

export function formatUsdInteger(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value)} $`;
}

export function formatDurationSeconds(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "—";
  }

  const totalSeconds = Math.round((end - start) / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds} сек`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} хв ${seconds} сек`;
}

export function pctDiff(value, reference) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) {
    return 0;
  }

  return ((value - reference) / reference) * 100;
}

export function formatSignedPercent(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout after ${timeoutMs}ms for ${url}`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
