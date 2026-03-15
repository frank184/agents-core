import { App } from "@slack/bolt";
import { SlackClient } from "./client";
import { DocumentationProcessor } from "../pipeline/processor";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export function registerEventHandlers(app: App, slackClient: SlackClient): void {
  const processor = new DocumentationProcessor();

  // File shared event
  app.event("file_shared", async ({ event, client }) => {
    let initialMessageTs: string | undefined;

    try {
      if (event.type !== "file_shared") {
        return;
      }

      // Get file information
      const fileInfo = await slackClient.getFileInfo(event.file_id);
      const fileData = fileInfo as Record<string, unknown>;
      const file = fileData.file as Record<string, string | number> | undefined;

      if (!file) {
        throw new Error("File information not available");
      }

      const fileName = (file.name as string) || "unknown file";
      const fileUrl = file.url_private_download as string;
      const fileType = fileName.split(".").pop()?.toLowerCase() || "";

      // Validate file type
      if (!["pdf", "docx", "txt"].includes(fileType)) {
        await client.chat.postMessage({
          channel: event.channel_id,
          text: `⚠️ Unsupported file type: ${fileType}. Please upload PDF, DOCX, or TXT files.`,
        });
        return;
      }

      // Post initial processing message
      const initialMsg = await client.chat.postMessage({
        channel: event.channel_id,
        text: `📄 Processing \`${fileName}\`...\n⏳ Parsing document...`,
      });
      initialMessageTs = initialMsg.ts as string;

      // Download file to temporary location
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-doc-"));
      const tmpFilePath = path.join(tmpDir, fileName);

      const fileBuffer = await slackClient.downloadFile(fileUrl, client.token as string);
      await fs.writeFile(tmpFilePath, fileBuffer);

      // Update message with progress
      await client.chat.update({
        channel: event.channel_id,
        ts: initialMessageTs,
        text: `📄 Processing \`${fileName}\`...\n✅ Document parsed\n🤖 Generating markdown with Copilot SDK...`,
      });

      // Process document with streaming updates
      let lastUpdate = Date.now();
      const result = await processor.processDocument(
        tmpFilePath,
        {
          fileName,
          fileType: fileType as "pdf" | "docx" | "txt",
          channelId: event.channel_id,
          userId: event.user_id,
        },
        {
          createMR: true,
          streaming: true,
          onProgress: (chunk) => {
            // Update every 2 seconds during generation
            const now = Date.now();
            if (now - lastUpdate > 2000) {
              void client.chat.update({
                channel: event.channel_id,
                ts: initialMessageTs!,
                text: `📄 Processing \`${fileName}\`...\n✅ Document parsed\n🤖 Generating markdown... (${chunk.length} chars so far)`,
              });
              lastUpdate = now;
            }
          },
        }
      );

      // Cleanup temp file
      await fs.unlink(tmpFilePath).catch(() => {
        /* ignore */
      });
      await fs.rmdir(tmpDir).catch(() => {
        /* ignore */
      });

      // Handle result
      if (result.error) {
        await client.chat.update({
          channel: event.channel_id,
          ts: initialMessageTs,
          text: `❌ Error processing \`${fileName}\`: ${result.error}`,
        });
        return;
      }

      // Post success message with MR link
      if (result.mergeRequest) {
        await client.chat.update({
          channel: event.channel_id,
          ts: initialMessageTs,
          text: `✅ Documentation generated for \`${fileName}\`!\n\n📝 Markdown: ${result.markdown.length} characters\n🔗 MR: ${result.mergeRequest.url}\n\n*Merge Request:* ${result.mergeRequest.title}`,
        });
      } else {
        await client.chat.update({
          channel: event.channel_id,
          ts: initialMessageTs,
          text: `✅ Documentation generated for \`${fileName}\`!\n\n📝 Markdown: ${result.markdown.length} characters\n\n_Note: MR creation was skipped._`,
        });
      }
    } catch (error) {
      console.error("Error handling file_shared event:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (event.type === "file_shared") {
        if (initialMessageTs) {
          await client.chat.update({
            channel: event.channel_id,
            ts: initialMessageTs,
            text: `❌ Error processing file: ${errorMessage}`,
          });
        } else {
          await client.chat.postMessage({
            channel: event.channel_id,
            text: `❌ Error processing file: ${errorMessage}`,
          });
        }
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

  // Cleanup on shutdown
  process.on("SIGTERM", () => {
    void processor.cleanup();
  });
}
