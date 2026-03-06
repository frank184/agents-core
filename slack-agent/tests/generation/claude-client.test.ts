import assert from "node:assert";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import { EventEmitter } from "events";

describe("ClaudeClient", () => {
  let mockCopilotClient: {
    createSession: ReturnType<typeof mock.fn>;
    stop: ReturnType<typeof mock.fn>;
  };
  let mockSession: EventEmitter & {
    sendAndWait: ReturnType<typeof mock.fn>;
  };

  beforeEach(() => {
    mockSession = new EventEmitter() as EventEmitter & {
      sendAndWait: ReturnType<typeof mock.fn>;
    };
    mockSession.sendAndWait = mock.fn(async () => ({
      data: {
        content: "Generated response from Claude",
      },
    }));

    mockCopilotClient = {
      createSession: mock.fn(async () => mockSession),
      stop: mock.fn(async () => {}),
    };

    // Mock the @github/copilot-sdk module
    const Module = require("module");
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function(id: string) {
      if (id === "@github/copilot-sdk") {
        return {
          CopilotClient: function() {
            return mockCopilotClient;
          },
          approveAll: () => {},
        };
      }
      return originalRequire.apply(this, [id]);
    };
  });

  afterEach(() => {
    mock.restoreAll();
    const Module = require("module");
    // Reset module cache to avoid pollution
    delete require.cache[require.resolve("../../src/generation/claude-client")];
  });

  describe("generate", () => {
    it("should generate non-streaming response", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const result = await client.generate({
        prompt: "Write a test prompt",
        streaming: false,
      });

      // Verify session was created
      assert.strictEqual(mockCopilotClient.createSession.mock.calls.length, 1);
      const sessionConfig = mockCopilotClient.createSession.mock.calls[0].arguments[0] as any;
      assert.strictEqual(sessionConfig.streaming, false);

      // Verify prompt was sent
      assert.strictEqual(mockSession.sendAndWait.mock.calls.length, 1);
      assert.strictEqual((mockSession.sendAndWait.mock.calls[0].arguments[0] as any).prompt, "Write a test prompt");

      // Verify result
      assert.strictEqual(result.content, "Generated response from Claude");

      // Verify client was stopped
      assert.strictEqual(mockCopilotClient.stop.mock.calls.length, 1);
    });

    it("should handle empty response", async () => {
      mockSession.sendAndWait.mock.mockImplementation(async () => null);

      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const result = await client.generate({
        prompt: "Test prompt",
      });

      assert.strictEqual(result.content, "");
    });

    it("should handle generation errors", async () => {
      mockSession.sendAndWait.mock.mockImplementation(async () => {
        throw new Error("API error");
      });

      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      await assert.rejects(
        client.generate({ prompt: "Test" }),
        (error: Error) => {
          assert.ok(error.message.includes("Claude generation error"));
          assert.ok(error.message.includes("API error"));
          return true;
        }
      );

      // Verify client was still stopped on error
      assert.strictEqual(mockCopilotClient.stop.mock.calls.length, 1);
    });
  });

  describe("generateStream", () => {
    it("should generate streaming response with chunks", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const chunks: string[] = [];
      const onChunk = mock.fn((chunk: string) => {
        chunks.push(chunk);
      });
      const onComplete = mock.fn(() => {});

      // Start generation
      const resultPromise = client.generateStream(
        {
          prompt: "Stream test prompt",
          streaming: true,
        },
        onChunk,
        onComplete
      );

      // Simulate streaming events
      setTimeout(() => {
        mockSession.emit("assistant.message_delta", {
          data: { deltaContent: "Hello " },
        });
        mockSession.emit("assistant.message_delta", {
          data: { deltaContent: "World!" },
        });
        mockSession.emit("session.idle");
      }, 10);

      const result = await resultPromise;

      // Verify chunks were received
      assert.deepStrictEqual(chunks, ["Hello ", "World!"]);
      assert.strictEqual(onChunk.mock.calls.length, 2);

      // Verify completion callback
      assert.strictEqual(onComplete.mock.calls.length, 1);

      // Verify full content
      assert.strictEqual(result.content, "Hello World!");

      // Verify client was stopped
      assert.strictEqual(mockCopilotClient.stop.mock.calls.length, 1);
    });

    it("should handle streaming errors", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const onChunk = mock.fn(() => {});

      const resultPromise = client.generateStream(
        { prompt: "Test" },
        onChunk
      );

      // Simulate error
      setTimeout(() => {
        mockSession.emit("session.error", new Error("Stream error"));
      }, 10);

      await assert.rejects(resultPromise);

      // Verify client was stopped on error
      assert.strictEqual(mockCopilotClient.stop.mock.calls.length, 1);
    });
  });

  describe("generateWithSystem", () => {
    it("should generate with custom system message (non-streaming)", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const result = await client.generateWithSystem(
        "You are a helpful assistant",
        "Answer this question",
        false
      );

      // Verify session was created with system message
      assert.strictEqual(mockCopilotClient.createSession.mock.calls.length, 1);
      const sessionConfig = mockCopilotClient.createSession.mock.calls[0].arguments[0] as any;
      assert.strictEqual((sessionConfig as any)?.systemMessage?.content, "You are a helpful assistant");
      assert.strictEqual((sessionConfig as any)?.streaming, false);

      // Verify prompt was sent
      assert.strictEqual(mockSession.sendAndWait.mock.calls.length, 1);
      assert.strictEqual((mockSession.sendAndWait.mock.calls[0].arguments[0] as any)?.prompt, "Answer this question");

      // Verify result
      assert.strictEqual(result.content, "Generated response from Claude");
    });

    it("should generate with system message (streaming)", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const chunks: string[] = [];
      const onChunk = mock.fn((chunk: string) => {
        chunks.push(chunk);
      });

      const resultPromise = client.generateWithSystem(
        "You are a documentation expert",
        "Generate docs",
        true,
        onChunk
      );

      // Simulate streaming
      setTimeout(() => {
        mockSession.emit("assistant.message_delta", {
          data: { deltaContent: "Doc content" },
        });
        // Don't emit session.idle to let sendAndWait handle it
      }, 10);

      // Mock sendAndWait to return after short delay
      mockSession.sendAndWait.mock.mockImplementation(async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: { content: "Doc content" } });
          }, 20);
        });
      });

      const result = await resultPromise;

      // Verify chunks were received
      assert.strictEqual(chunks.length, 1);
      assert.strictEqual(chunks[0], "Doc content");

      // Verify session config
      const sessionConfig = mockCopilotClient.createSession.mock.calls[0].arguments[0] as any;
      assert.strictEqual(sessionConfig.streaming, true);
    });
  });

  describe("createConversationSession", () => {
    it("should create a conversation session", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      const session = await client.createConversationSession();

      assert.ok(session);
      assert.strictEqual(mockCopilotClient.createSession.mock.calls.length, 1);

      const sessionConfig = mockCopilotClient.createSession.mock.calls[0].arguments[0] as any;
      assert.strictEqual(sessionConfig.streaming, true);
    });
  });

  describe("stopClient", () => {
    it("should stop the client", async () => {
      const { ClaudeClient } = require("../../src/generation/claude-client");
      const client = new ClaudeClient();

      await client.stopClient();

      assert.strictEqual(mockCopilotClient.stop.mock.calls.length, 1);
    });
  });

  describe("model configuration", () => {
    it("should use configured model from config", () => {
      // Mock config with custom model
      const Module = require("module");
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function(id: string) {
        if (id === "../config") {
          return {
            config: {
              copilot: {
                model: "claude-opus-custom",
              },
            },
          };
        }
        if (id === "@github/copilot-sdk") {
          return {
            CopilotClient: function() {
              return mockCopilotClient;
            },
            approveAll: () => {},
          };
        }
        return originalRequire.apply(this, [id]);
      };

      delete require.cache[require.resolve("../../src/generation/claude-client")];
      const { ClaudeClient } = require("../../src/generation/claude-client");

      const client = new ClaudeClient();

      // The model is stored privately, but we can verify it's used when creating sessions
      const generatePromise = client.generate({ prompt: "test" });

      // Restore
      Module.prototype.require = originalRequire;

      return generatePromise.then(() => {
        const sessionConfig = mockCopilotClient.createSession.mock.calls[0].arguments[0] as any;
        assert.strictEqual((sessionConfig as any)?.model, "claude-opus-custom");
      });
    });
  });
});
