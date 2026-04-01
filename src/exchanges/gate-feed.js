import { BaseFeed } from "./base-feed.js";
import { nowIso } from "../utils.js";

function toGateSymbol(symbol) {
  const quote = symbol.endsWith("USDT") ? "USDT" : symbol.slice(-4);
  const base = symbol.slice(0, -quote.length);
  return `${base}_${quote}`;
}

export class GateFeed extends BaseFeed {
  constructor(symbol) {
    super("GATE");
    this.symbol = symbol;
    this.gateSymbol = toGateSymbol(symbol);
    this.socket = null;
    this.reconnectTimer = null;
    this.requestId = 1;
  }

  connect() {
    this.socket = new WebSocket("wss://ws.gate.io/v3/");

    this.socket.addEventListener("open", () => {
      this.emit({
        symbol: this.symbol,
        connected: true
      });

      this.socket.send(
        JSON.stringify({
          id: this.requestId++,
          method: "ticker.subscribe",
          params: [this.gateSymbol]
        })
      );
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.method !== "ticker.update" || !Array.isArray(payload.params)) {
          return;
        }

        const [, ticker] = payload.params;
        const price = Number(ticker?.last);

        if (!Number.isFinite(price)) {
          return;
        }

        this.emit({
          symbol: this.symbol,
          price,
          updatedAt: nowIso(),
          connected: true
        });
      } catch {
        return;
      }
    });

    this.socket.addEventListener("close", () => {
      this.emit({ connected: false });
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this.emit({ connected: false });
      this.socket?.close();
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 2000);
  }
}
