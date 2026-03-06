import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DocumentationGenerator } from "../src/generation/generator";
import { PROMPTS, SYSTEM_MESSAGES } from "../src/generation/prompts";

describe("DocumentationGenerator", () => {
  let generator: DocumentationGenerator;

  beforeEach(() => {
    generator = new DocumentationGenerator();
  });

  afterEach(async () => {
    await generator.cleanup();
  });

  describe("prompt templates", () => {
    it("should create appropriate system message for documentation", () => {
      assert.ok(
        SYSTEM_MESSAGES.documentationExpert.includes(
          "technical documentation expert",
        ),
      );
      assert.ok(
        SYSTEM_MESSAGES.documentationExpert.includes("markdown"),
      );
    });

    it("should create documentation summarization prompt", () => {
      const content = "Sample API documentation content";
      const prompt = PROMPTS.documentSummarization(content, "TestProject");

      assert.ok(prompt.includes("TestProject"));
      assert.ok(prompt.includes(content));
      assert.ok(prompt.includes("Overview"));
      assert.ok(prompt.includes("Features"));
      assert.ok(prompt.includes("Getting Started"));
    });

    it("should create enhancement prompt", () => {
      const prompt = PROMPTS.documentEnhancement("Setup", "Run npm install");

      assert.ok(prompt.includes("Setup"));
      assert.ok(prompt.includes("professional"));
      assert.ok(prompt.includes("Clarifying"));
    });

    it("should create code documentation prompt", () => {
      const code = "function test() {}";
      const prompt = PROMPTS.codeDocumentation(code, "typescript");

      assert.ok(prompt.includes("typescript"));
      assert.ok(prompt.includes("function test"));
      assert.ok(prompt.includes("Parameters"));
      assert.ok(prompt.includes("Return values"));
    });

    it("should create release notes prompt", () => {
      const changes = ["Added new feature", "Fixed bug"];
      const prompt = PROMPTS.releaseNotes("1.0.0", changes);

      assert.ok(prompt.includes("1.0.0"));
      assert.ok(prompt.includes("Added new feature"));
      assert.ok(prompt.includes("Release notes"));
    });

    it("should create API documentation prompt", () => {
      const endpoints = ["GET /api/users", "POST /api/users"];
      const prompt = PROMPTS.apiDocumentation(
        endpoints,
        "https://api.example.com",
      );

      assert.ok(prompt.includes("api.example.com"));
      assert.ok(prompt.includes("GET /api/users"));
      assert.ok(prompt.includes("Authentication"));
    });

    it("should create architecture documentation prompt", () => {
      const components = ["Database", "API Server", "Cache"];
      const prompt = PROMPTS.architectureDocumentation(
        "Microservices system",
        components,
      );

      assert.ok(prompt.includes("Database"));
      assert.ok(prompt.includes("API Server"));
      assert.ok(prompt.includes("Data Flow"));
    });

    it("should create file-based documentation prompt", () => {
      const prompt = PROMPTS.parseAndDocument(
        "guide.pdf",
        "Content from PDF",
        "PDF",
      );

      assert.ok(prompt.includes("guide.pdf"));
      assert.ok(prompt.includes("PDF"));
      assert.ok(prompt.includes("Content from PDF"));
    });
  });

  describe("system messages", () => {
    it("should have documentation expert system message", () => {
      assert.ok(SYSTEM_MESSAGES.documentationExpert);
      assert.ok(SYSTEM_MESSAGES.documentationExpert.length > 0);
    });

    it("should have code documentalist system message", () => {
      assert.ok(SYSTEM_MESSAGES.codeDocumentalist);
      assert.ok(SYSTEM_MESSAGES.codeDocumentalist.includes("code"));
    });

    it("should have release notes writer system message", () => {
      assert.ok(SYSTEM_MESSAGES.releaseNotesWriter);
      assert.ok(SYSTEM_MESSAGES.releaseNotesWriter.includes("release notes"));
    });
  });

  describe("generation options", () => {
    it("should support streaming option", () => {
      const onProgressCallback = () => {};
      const onCompleteCallback = () => {};
      const options = {
        streaming: true,
        onProgress: onProgressCallback,
        onComplete: onCompleteCallback,
      };

      assert.strictEqual(options.streaming, true);
      assert.strictEqual(typeof options.onProgress, "function");
      assert.strictEqual(typeof options.onComplete, "function");
    });
  });
});
