import assert from "node:assert";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import type { App } from "@slack/bolt";

describe("Slack Event Handlers", () => {
  let mockApp: {
    event: ReturnType<typeof mock.fn>;
    message: ReturnType<typeof mock.fn>;
  };
  let mockSlackClient: {
    getFileInfo: ReturnType<typeof mock.fn>;
    downloadFile: ReturnType<typeof mock.fn>;
  };
  let mockProcessor: {
    processDocument: ReturnType<typeof mock.fn>;
    cleanup: ReturnType<typeof mock.fn>;
  };
  let mockChatClient: {
    chat: {
      postMessage: ReturnType<typeof mock.fn>;
      update: ReturnType<typeof mock.fn>;
    };
    token: string;
  };

  beforeEach(() => {
    mockApp = {
      event: mock.fn(),
      message: mock.fn(),
    };

    mockSlackClient = {
      getFileInfo: mock.fn(async (fileId: string) => ({
        file: {
          id: fileId,
          name: "test-document.pdf",
          url_private_download: "https://files.slack.com/test.pdf",
          filetype: "pdf",
        },
      })),
      downloadFile: mock.fn(async () => Buffer.from("PDF content")),
    };

    mockProcessor = {
      processDocument: mock.fn(async () => ({
        markdown: "# Generated Documentation\n\nContent here.",
        mergeRequest: {
          id: 123,
          iid: 1,
          url: "https://gitlab.com/project/-/merge_requests/1",
          title: "docs: Add documentation for test-document.pdf",
        },
      })),
      cleanup: mock.fn(async () => {}),
    };

    mockChatClient = {
      chat: {
        postMessage: mock.fn(async (args: any) => ({
          ok: true,
          ts: "1234567890.123456",
          channel: args.channel,
          message: { text: args.text },
        })),
        update: mock.fn(async (args: any) => ({
          ok: true,
          ts: args.ts,
          channel: args.channel,
          message: { text: args.text },
        })),
      },
      token: "xoxb-test-token",
    };
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe.skip("registerEventHandlers", () => {
    it("should register file_shared event handler", () => {
      const { registerEventHandlers } = require("../../src/slack/events");
      registerEventHandlers(mockApp as unknown as App, mockSlackClient as any);

      assert.strictEqual(mockApp.event.mock.calls.length, 1);
      assert.strictEqual(mockApp.event.mock.calls[0].arguments[0], "file_shared");
    });

    it("should register message handler for commands", () => {
      const { registerEventHandlers } = require("../../src/slack/events");
      registerEventHandlers(mockApp as unknown as App, mockSlackClient as any);

      assert.strictEqual(mockApp.message.mock.calls.length, 1);
      assert.ok(mockApp.message.mock.calls[0].arguments[0] instanceof RegExp);
    });
  });

  describe.skip("file_shared event handler", () => {
    let fileSharedHandler: any;

    beforeEach(async () => {
      // Mock fs and path modules
      const mockFs = {
        promises: {
          mkdtemp: mock.fn(async () => "/tmp/slack-doc-test"),
          writeFile: mock.fn(async () => {}),
          unlink: mock.fn(async () => {}),
          rmdir: mock.fn(async () => {}),
        },
      };

      // Mock DocumentationProcessor
      const MockProcessor = function () {
        return mockProcessor;
      };

      // Intercept require calls
      const Module = require("module");
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === "fs") return mockFs;
        if (id === "../pipeline/processor") {
          return { DocumentationProcessor: MockProcessor };
        }
        return originalRequire.apply(this, [id]);
      };

      const { registerEventHandlers } = originalRequire.apply(null, ["../../src/slack/events"]);
      registerEventHandlers(mockApp as unknown as App, mockSlackClient as any);

      // Extract the file_shared handler
      const eventCall = mockApp.event.mock.calls[0];
      fileSharedHandler = eventCall.arguments[1];

      // Restore require
      Module.prototype.require = originalRequire;
    });

    it("should process PDF file successfully", async () => {
      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify file info was fetched
      assert.strictEqual(mockSlackClient.getFileInfo.mock.calls.length, 1);
      assert.strictEqual(mockSlackClient.getFileInfo.mock.calls[0].arguments[0], "F123456");

      // Verify file was downloaded
      assert.strictEqual(mockSlackClient.downloadFile.mock.calls.length, 1);

      // Verify initial message was posted
      assert.strictEqual(mockChatClient.chat.postMessage.mock.calls.length, 1);
      const postCall = mockChatClient.chat.postMessage.mock.calls[0].arguments[0] as any;
      assert.strictEqual(postCall.channel, "C123456");
      assert.ok(postCall.text.includes("Processing"));

      // Verify processor was called
      assert.strictEqual(mockProcessor.processDocument.mock.calls.length, 1);

      // Verify final success message
      const updateCalls = mockChatClient.chat.update.mock.calls;
      const finalUpdate = updateCalls[updateCalls.length - 1].arguments[0];
      assert.ok((finalUpdate as any).text.includes("Documentation generated"));
      assert.ok((finalUpdate as any).text.includes("merge_requests"));
    });

    it("should reject unsupported file types", async () => {
      mockSlackClient.getFileInfo.mock.mockImplementation(async () => ({
        file: {
          id: "F123456",
          name: "test-file.xlsx",
          url_private_download: "https://files.slack.com/test.xlsx",
        },
      }));

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify rejection message was posted
      assert.strictEqual(mockChatClient.chat.postMessage.mock.calls.length, 1);
      const postCall = mockChatClient.chat.postMessage.mock.calls[0].arguments[0] as any;
      assert.ok(postCall.text.includes("Unsupported file type"));

      // Verify processor was NOT called
      assert.strictEqual(mockProcessor.processDocument.mock.calls.length, 0);
    });

    it("should handle DOCX files", async () => {
      mockSlackClient.getFileInfo.mock.mockImplementation(async () => ({
        file: {
          id: "F123456",
          name: "document.docx",
          url_private_download: "https://files.slack.com/test.docx",
        },
      }));

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify processor was called with docx type
      assert.strictEqual(mockProcessor.processDocument.mock.calls.length, 1);
      const processCall = mockProcessor.processDocument.mock.calls[0].arguments as any[];
      assert.strictEqual(processCall[1]?.fileType, "docx");
    });

    it("should handle TXT files", async () => {
      mockSlackClient.getFileInfo.mock.mockImplementation(async () => ({
        file: {
          id: "F123456",
          name: "readme.txt",
          url_private_download: "https://files.slack.com/readme.txt",
        },
      }));

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify processor was called with txt type
      assert.strictEqual(mockProcessor.processDocument.mock.calls.length, 1);
      const processCall = mockProcessor.processDocument.mock.calls[0].arguments as any[];
      assert.strictEqual(processCall[1]?.fileType, "txt");
    });

    it("should update message with progress during generation", async () => {
      // Mock processor to call onProgress
      mockProcessor.processDocument.mock.mockImplementation(async (_path: any, _metadata: any, options?: any) => {
        if (options?.onProgress) {
          options.onProgress("Generating");
        }
        return {
          markdown: "# Doc",
          mergeRequest: { url: "https://mr.url" },
        };
      });

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify multiple updates were made
      assert.ok(mockChatClient.chat.update.mock.calls.length >= 2);
    });

    it("should handle processing errors", async () => {
      mockProcessor.processDocument.mock.mockImplementation(async () => ({
        markdown: "",
        error: "Generation failed",
      }));

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify error message was posted
      assert.ok(mockChatClient.chat.update.mock.calls.length > 0);
      const updateCall = mockChatClient.chat.update.mock.calls[mockChatClient.chat.update.mock.calls.length - 1];
      const finalUpdate = (updateCall.arguments as any[])[0] as any;
      assert.ok(finalUpdate.text.includes("Error processing"));
      assert.ok(finalUpdate.text.includes("Generation failed"));
    });

    it("should handle missing file information", async () => {
      mockSlackClient.getFileInfo.mock.mockImplementation(async () => ({}));

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify error was posted
      assert.ok(
        mockChatClient.chat.postMessage.mock.calls.length >= 1 ||
          mockChatClient.chat.update.mock.calls.length >= 1
      );
    });

    it("should handle result without MR", async () => {
      mockProcessor.processDocument.mock.mockImplementation(async () => ({
        markdown: "# Generated Doc",
        mergeRequest: undefined,
      }));

      const event = {
        type: "file_shared",
        file_id: "F123456",
        channel_id: "C123456",
        user_id: "U123456",
      };

      await fileSharedHandler({
        event,
        client: mockChatClient,
      });

      // Verify success message without MR link
      assert.ok(mockChatClient.chat.update.mock.calls.length > 0);
      const updateCall = mockChatClient.chat.update.mock.calls[mockChatClient.chat.update.mock.calls.length - 1];
      const finalUpdate = (updateCall.arguments as any[])[0] as any;
      assert.ok(finalUpdate.text.includes("Documentation generated"));
      assert.ok(finalUpdate.text.includes("MR creation was skipped"));
    });
  });

  describe.skip("message handler for commands", () => {
    let messageHandler: (args: any) => Promise<void>;

    beforeEach(() => {
      const { registerEventHandlers } = require("../../src/slack/events");
      registerEventHandlers(mockApp as unknown as App, mockSlackClient as any);

      const messageCall = mockApp.message.mock.calls[0];
      messageHandler = (messageCall.arguments as any[])[1] as any;
    });

    it("should respond to status command", async () => {
      const mockSay = mock.fn(async (text: string) => ({ ok: true, ts: "123" }));

      await messageHandler({
        message: {
          type: "message",
          text: "@documentation status",
        },
        say: mockSay,
      });

      assert.strictEqual(mockSay.mock.calls.length, 1);
      assert.ok(mockSay.mock.calls[0].arguments[0].includes("Status"));
    });

    it("should respond to help command", async () => {
      const mockSay = mock.fn(async (text: string) => ({ ok: true, ts: "123" }));

      await messageHandler({
        message: {
          type: "message",
          text: "@documentation help",
        },
        say: mockSay,
      });

      assert.strictEqual(mockSay.mock.calls.length, 1);
      assert.ok(mockSay.mock.calls[0].arguments[0].includes("Commands"));
    });

    it("should ignore messages without text", async () => {
      const mockSay = mock.fn(async (text: string) => ({ ok: true, ts: "123" }));

      await messageHandler({
        message: {
          type: "message",
        },
        say: mockSay,
      });

      assert.strictEqual(mockSay.mock.calls.length, 0);
    });
  });
});
