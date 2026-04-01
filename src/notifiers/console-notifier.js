import { formatBoardSummary, formatChannelMessage, formatSignalClosedMessage } from "../formatter.js";

export class ConsoleNotifier {
  async onSignalOpen(opportunity) {
    console.log("\n[OPEN]\n" + formatChannelMessage(opportunity) + "\n");
  }

  async onSignalUpdate(opportunity) {
    console.log("\n[UPDATE]\n" + formatChannelMessage(opportunity) + "\n");
  }

  async onSignalClose(activeSignal) {
    console.log("\n[CLOSE]\n" + formatSignalClosedMessage(activeSignal) + "\n");
  }

  async onBoard(opportunities, thresholdPercent, totalPairs) {
    console.log(formatBoardSummary(opportunities, thresholdPercent, totalPairs));
  }
}
