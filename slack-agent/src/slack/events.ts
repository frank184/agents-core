import { App } from "@slack/bolt";
import { SlackClient } from "./client";

export function registerEventHandlers(app: App, slackClient: SlackClient): void {
  // File shared event
  app.event("file_shared", async ({ event, client }) => {
    try {
      if (event.type !== "file_shared") {
        return;
      }
      const fileInfo = await slackClient.getFileInfo(event.file_id);

      // Post message in channel (file_shared events don't have a thread_ts)
      const fileData = fileInfo as Record<string, unknown>;
      const file = fileData.file as Record<string, string> | undefined;
      const fileName = file?.name || "unknown file";

      await client.chat.postMessage({
        channel: event.channel_id,
        text: `📄 Processing ${fileName}...`,
      });

      // TODO: Trigger document processing pipeline
    } catch (error) {
      console.error("Error handling file_shared event:", error);
      if (event.type === "file_shared") {
        await client.chat.postMessage({
          channel: event.channel_id,
          text: "❌ Error processing file. Check logs.",
        });
      }
    }
  });

  // Message event for commands
  app.message(/^@documentation/, async ({ message, say }) => {
    if (!("text" in message) || typeof message.text !== "string") {
      return;
    }
    const messageText: string = message.text;

    if (messageText.includes("status")) {
      await say("📊 Documentation Agent Status: Ready");
    } else if (messageText.includes("help")) {
      await say(
        "Commands:\n" +
          "• Upload PDFs/DOCX to auto-parse\n" +
          "• @documentation status - Check agent health\n" +
          "• @documentation recent - Show recent MRs"
      );
    }
  });
}
