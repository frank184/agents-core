import assert from "node:assert";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import { EventEmitter } from "events";
import type { DocumentationProcessor, DocumentMetadata } from "../../src/pipeline/processor";

describe.skip("DocumentationProcessor", () => {
  let processor: DocumentationProcessor;
  let mockSpawn: ReturnType<typeof mock.fn>;
  let mockGenerator: {
    generateFromFile: ReturnType<typeof mock.fn>;
  };
  let mockGitLabClient: {
    createDocumentationMR: ReturnType<typeof mock.fn>;
  };

  beforeEach(() => {
    // Mock child_process.spawn
    mockSpawn = mock.fn();

    // Mock generator
    mockGenerator = {
      generateFromFile: mock.fn(async () => "# Generated Markdown\n\nContent here"),
    };

    // Mock GitLab client
    mockGitLabClient = {
      createDocumentationMR: mock.fn(async () => ({
        id: 123,
        iid: 1,
        web_url: "https://gitlab.com/test/project/-/merge_requests/1",
        title: "docs: Test MR",
        state: "opened",
      })),
    };

    // Create processor with mocked dependencies
    const ProcessorClass = require("../../src/pipeline/processor").DocumentationProcessor;
    processor = new ProcessorClass();

    // Replace internal dependencies
    (processor as any).generator = mockGenerator;
    (processor as any).gitlabClient = mockGitLabClient;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe("parseDocument", () => {
    it("should parse document successfully", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mock.mockImplementation(() => mockProcess);

      // Mock spawn in child_process module
      const childProcess = require("child_process");
      childProcess.spawn = mockSpawn;

      // Trigger parse
      const parsePromise = (processor as any).parseDocument("/tmp/test.pdf", "pdf");

      // Simulate successful output
      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from(JSON.stringify({ text: "Parsed content" })));
        mockProcess.emit("close", 0);
      }, 10);

      const result = await parsePromise;
      assert.strictEqual(result, "Parsed content");
    });

    it("should handle parser errors", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mock.mockImplementation(() => mockProcess);

      const childProcess = require("child_process");
      childProcess.spawn = mockSpawn;

      const parsePromise = (processor as any).parseDocument("/tmp/test.pdf", "pdf");

      setTimeout(() => {
        mockProcess.stderr.emit("data", Buffer.from("Parser error"));
        mockProcess.emit("close", 1);
      }, 10);

      await assert.rejects(
        parsePromise,
        (error: Error) => {
          assert.ok(error.message.includes("Parser failed"));
          return true;
        }
      );
    });

    it("should handle invalid JSON output", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mock.mockImplementation(() => mockProcess);

      const childProcess = require("child_process");
      childProcess.spawn = mockSpawn;

      const parsePromise = (processor as any).parseDocument("/tmp/test.pdf", "pdf");

      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from("Invalid JSON"));
        mockProcess.emit("close", 0);
      }, 10);

      await assert.rejects(
        parsePromise,
        (error: Error) => {
          assert.ok(error.message.includes("Failed to parse output"));
          return true;
        }
      );
    });
  });

  describe("generateBranchName", () => {
    it("should generate valid branch name with timestamp", () => {
      const branchName = (processor as any).generateBranchName("My Document.pdf");

      assert.ok(branchName.startsWith("docs/my-document-"));
      assert.match(branchName, /docs\/my-document-\d{4}-\d{2}-\d{2}/);
    });

    it("should sanitize special characters", () => {
      const branchName = (processor as any).generateBranchName("Test@File#2024.pdf");

      assert.ok(branchName.startsWith("docs/test-file-2024-"));
      assert.ok(!branchName.includes("@"));
      assert.ok(!branchName.includes("#"));
    });

    it("should remove file extension", () => {
      const branchName = (processor as any).generateBranchName("document.docx");

      assert.ok(!branchName.includes(".docx"));
      assert.match(branchName, /docs\/document-\d{4}-\d{2}-\d{2}/);
    });

    it("should limit length to 40 characters plus prefix", () => {
      const longName = "a".repeat(100) + ".pdf";
      const branchName = (processor as any).generateBranchName(longName);

      const baseName = branchName.split("-").slice(0, -3).join("-");
      assert.ok(baseName.length <= 45); // "docs/" + 40 chars
    });
  });

  describe("generateDocPath", () => {
    it("should generate valid documentation path", () => {
      const docPath = (processor as any).generateDocPath("My Document.pdf");

      assert.strictEqual(docPath, "docs/generated/my-document.md");
    });

    it("should sanitize special characters", () => {
      const docPath = (processor as any).generateDocPath("Test@File#2024.pdf");

      assert.strictEqual(docPath, "docs/generated/test-file-2024.md");
    });

    it("should preserve underscores", () => {
      const docPath = (processor as any).generateDocPath("test_document.pdf");

      assert.strictEqual(docPath, "docs/generated/test_document.md");
    });
  });

  describe("processDocument", () => {
    const mockMetadata: DocumentMetadata = {
      fileName: "test-doc.pdf",
      fileType: "pdf",
      channelId: "C123456",
      userId: "U123456",
    };

    beforeEach(() => {
      // Mock parseDocument to avoid spawn complexity
      (processor as any).parseDocument = mock.fn(async () => "Extracted text content");
    });

    it("should process document end-to-end with MR creation", async () => {
      const result = await processor.processDocument("/tmp/test.pdf", mockMetadata, {
        createMR: true,
        streaming: false,
      });

      // Verify parse was called
      assert.strictEqual((processor as any).parseDocument.mock.calls.length, 1);
      assert.strictEqual((processor as any).parseDocument.mock.calls[0].arguments[0], "/tmp/test.pdf");
      assert.strictEqual((processor as any).parseDocument.mock.calls[0].arguments[1], "pdf");

      // Verify generator was called
      assert.strictEqual(mockGenerator.generateFromFile.mock.calls.length, 1);
      assert.strictEqual(mockGenerator.generateFromFile.mock.calls[0].arguments[0], "test-doc.pdf");
      assert.strictEqual(mockGenerator.generateFromFile.mock.calls[0].arguments[1], "Extracted text content");

      // Verify GitLab MR was created
      assert.strictEqual(mockGitLabClient.createDocumentationMR.mock.calls.length, 1);
      const mrOptions = mockGitLabClient.createDocumentationMR.mock.calls[0].arguments[0] as any;
      assert.ok(mrOptions.title.includes("test-doc.pdf"));
      assert.ok(mrOptions.branchName.startsWith("docs/test-doc-"));

      // Verify result
      assert.strictEqual(result.markdown, "# Generated Markdown\n\nContent here");
      assert.ok(result.mergeRequest);
      assert.strictEqual((result.mergeRequest as any).web_url, "https://gitlab.com/test/project/-/merge_requests/1");
      assert.ok(!result.error);
    });

    it("should process document without creating MR", async () => {
      const result = await processor.processDocument("/tmp/test.pdf", mockMetadata, {
        createMR: false,
      });

      // Verify MR was not created
      assert.strictEqual(mockGitLabClient.createDocumentationMR.mock.calls.length, 0);

      // Verify result has markdown but no MR
      assert.strictEqual(result.markdown, "# Generated Markdown\n\nContent here");
      assert.ok(!result.mergeRequest);
      assert.ok(!result.error);
    });

    it("should call onProgress during streaming", async () => {
      const progressChunks: string[] = [];
      const onProgress = mock.fn((chunk: string) => {
        progressChunks.push(chunk);
      });

      mockGenerator.generateFromFile.mock.mockImplementation(
        async (_fileName: string, _text: string, _type: string, options: any) => {
          if (options?.onProgress) {
            options.onProgress("Chunk 1");
            options.onProgress("Chunk 2");
          }
          return "# Generated Markdown";
        }
      );

      await processor.processDocument("/tmp/test.pdf", mockMetadata, {
        streaming: true,
        onProgress,
      });

      // Verify progress was called
      assert.strictEqual(onProgress.mock.calls.length, 2);
      assert.deepStrictEqual(progressChunks, ["Chunk 1", "Chunk 2"]);
    });

    it("should handle empty extracted text", async () => {
      (processor as any).parseDocument = mock.fn(async () => "");

      const result = await processor.processDocument("/tmp/test.pdf", mockMetadata);

      assert.ok(result.error);
      assert.ok(result.error.includes("No content extracted"));
    });

    it("should handle generation errors", async () => {
      mockGenerator.generateFromFile.mock.mockImplementation(async () => {
        throw new Error("Generation failed");
      });

      const result = await processor.processDocument("/tmp/test.pdf", mockMetadata);

      assert.ok(result.error);
      assert.ok(result.error.includes("Generation failed"));
    });

    it("should handle MR creation errors", async () => {
      mockGitLabClient.createDocumentationMR.mock.mockImplementation(async () => {
        throw new Error("GitLab API error");
      });

      const result = await processor.processDocument("/tmp/test.pdf", mockMetadata, {
        createMR: true,
      });

      assert.ok(result.error);
      assert.ok(result.error.includes("GitLab API error"));
    });
  });

  describe("cleanup", () => {
    it("should cleanup generator", async () => {
      const mockGeneratorWithStop = { ...mockGenerator, stopClient: mock.fn(async () => {}) };
      (processor as any).generator = mockGeneratorWithStop;

      await processor.cleanup();

      assert.strictEqual((mockGeneratorWithStop.stopClient as any).mock.calls.length, 1);
    });
  });
});
