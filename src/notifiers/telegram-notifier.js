import {
  buildSignalReplyMarkup,
  formatChannelMessage,
  formatSignalClosedMessage
} from "../formatter.js";
import { sleep } from "../utils.js";

export class TelegramNotifier {
  constructor({ botToken, chatId, threadId = "" }) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    this.chatId = chatId;
    this.threadId = threadId;
    this.messageIds = new Map();
    this.queue = Promise.resolve();
  }

  messageKey(payload) {
    return `${payload.exchange || payload.trackedExchange}:${payload.symbol}`;
  }

  async onSignalOpen(opportunity) {
    return this.enqueue(async () => {
      const payload = {
        chat_id: this.chatId,
        text: formatChannelMessage(opportunity),
        reply_markup: buildSignalReplyMarkup(opportunity),
        disable_web_page_preview: true
      };

      if (this.threadId) {
        payload.message_thread_id = Number(this.threadId);
      }

      const response = await this.call("sendMessage", payload);
      const messageId = response?.result?.message_id;

      if (messageId) {
        this.messageIds.set(this.messageKey(opportunity), messageId);
      }
    });
  }

  async onSignalUpdate(opportunity) {
    return this.enqueue(async () => {
      const messageId = this.messageIds.get(this.messageKey(opportunity));

      if (!messageId) {
        await this.onSignalOpen(opportunity);
        return;
      }

      await this.call("editMessageText", {
        chat_id: this.chatId,
        message_id: messageId,
        text: formatChannelMessage(opportunity),
        reply_markup: buildSignalReplyMarkup(opportunity),
        disable_web_page_preview: true
      });
    });
  }

  async onSignalClose(activeSignal) {
    return this.enqueue(async () => {
      const messageId = this.messageIds.get(this.messageKey(activeSignal));

      if (!messageId) {
        return;
      }

      await this.call("editMessageText", {
        chat_id: this.chatId,
        message_id: messageId,
        text: formatSignalClosedMessage(activeSignal),
        reply_markup: buildSignalReplyMarkup(activeSignal),
        disable_web_page_preview: true
      });

      this.messageIds.delete(this.messageKey(activeSignal));
    });
  }

  enqueue(task) {
    const nextTask = this.queue.then(async () => {
      await sleep(1200);
      return task();
    });

    this.queue = nextTask.catch(() => undefined);
    return nextTask;
  }

  async call(method, payload) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.status === 429) {
      const retryAfterSeconds = Number(data?.parameters?.retry_after || 3);
      await sleep((retryAfterSeconds + 1) * 1000);
      return this.call(method, payload);
    }

    if (!response.ok) {
      throw new Error(`Telegram API HTTP ${response.status} on ${method}`);
    }

    if (!data.ok) {
      throw new Error(`Telegram API error on ${method}: ${data.description}`);
    }

    return data;
  }
}
