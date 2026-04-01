import { pctDiff } from "./utils.js";

export function calculateSnapshot(feedStates, thresholdPercent) {
  const states = feedStates.filter((item) => Number.isFinite(item?.price));

  if (states.length < 2) {
    return {
      ready: false,
      prices: feedStates,
      fairPrice: null,
      opportunities: []
    };
  }

  const fairPrice =
    states.reduce((sum, item) => sum + item.price, 0) / states.length;

  const opportunities = states
    .map((state) => {
      const deviationPercent = pctDiff(state.price, fairPrice);

      return {
        exchange: state.exchange,
        symbol: state.symbol,
        price: state.price,
        fairPrice,
        deviationPercent,
        updatedAt: state.updatedAt,
        isTriggered: Math.abs(deviationPercent) >= thresholdPercent
      };
    })
    .sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent));

  return {
    ready: true,
    prices: feedStates,
    fairPrice,
    opportunities
  };
}
