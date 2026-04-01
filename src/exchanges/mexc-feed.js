import { BaseFeed } from "./base-feed.js";
import { nowIso } from "../utils.js";

export class MexcFeed extends BaseFeed {
  constructor(symbol) {
    super("MEXC");
    this.symbol = symbol;
    this.socket = null;
    this.reconnectTimer = null;
  }

  connect() {
    this.socket = new WebSocket("wss://wbs-api.mexc.com/ws");

    this.socket.addEventListener("open", () => {
      this.emit({
        symbol: this.symbol,
        connected: true
      });

      this.socket.send(
        JSON.stringify({
          method: "SUBSCRIPTION",
          params: [`spot@public.bookTicker.v3.api@${this.symbol}`]
        })
      );
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const price = Number(payload?.d?.a || payload?.d?.b);

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
