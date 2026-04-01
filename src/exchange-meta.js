export function getExchangeMeta(exchange) {
  if (exchange === "MEXC") {
    return {
      maxLeverage: "50x",
      maxPositionUsd: null
    };
  }

  if (exchange === "GATE") {
    return {
      maxLeverage: "10x",
      maxPositionUsd: null
    };
  }

  return {
    maxLeverage: "—",
    maxPositionUsd: null
  };
}

export function buildExchangePairUrl(exchange, symbol) {
  if (exchange === "MEXC") {
    const mexcSymbol = symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}_USDT` : symbol;
    return `https://www.mexc.com/futures/${mexcSymbol}`;
  }

  if (exchange === "GATE") {
    const gateSymbol = symbol.endsWith("USDT")
      ? `${symbol.slice(0, -4)}_USDT`
      : symbol;
    return `https://www.gate.com/futures/USDT/${gateSymbol}`;
  }

  return "";
}
