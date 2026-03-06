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
      expect(SYSTEM_MESSAGES.documentationExpert).toContain(
        "technical documentation expert"
      );
      expect(SYSTEM_MESSAGES.documentationExpert).toContain("markdown");
    });

    it("should create documentation summarization prompt", () => {
      const content = "Sample API documentation content";
      const prompt = PROMPTS.documentSummarization(content, "TestProject");

      expect(prompt).toContain("TestProject");
      expect(prompt).toContain(content);
      expect(prompt).toContain("Overview");
      expect(prompt).toContain("Features");
      expect(prompt).toContain("Getting Started");
    });

    it("should create enhancement prompt", () => {
      const prompt = PROMPTS.documentEnhancement("Setup", "Run npm install");

      expect(prompt).toContain("Setup");
      expect(prompt).toContain("professional");
      expect(prompt).toContain("Clarifying");
    });

    it("should create code documentation prompt", () => {
      const code = "function test() {}";
      const prompt = PROMPTS.codeDocumentation(code, "typescript");

      expect(prompt).toContain("typescript");
      expect(prompt).toContain("function test");
      expect(prompt).toContain("Parameters");
      expect(prompt).toContain("Return values");
    });

    it("should create release notes prompt", () => {
      const changes = ["Added new feature", "Fixed bug"];
      const prompt = PROMPTS.releaseNotes("1.0.0", changes);

      expect(prompt).toContain("1.0.0");
      expect(prompt).toContain("Added new feature");
      expect(prompt).toContain("Release notes");
    });

    it("should create API documentation prompt", () => {
      const endpoints = ["GET /api/users", "POST /api/users"];
      const prompt = PROMPTS.apiDocumentation(
        endpoints,
        "https://api.example.com"
      );

      expect(prompt).toContain("api.example.com");
      expect(prompt).toContain("GET /api/users");
      expect(prompt).toContain("Authentication");
    });

    it("should create architecture documentation prompt", () => {
      const components = ["Database", "API Server", "Cache"];
      const prompt = PROMPTS.architectureDocumentation(
        "Microservices system",
        components
      );

      expect(prompt).toContain("Database");
      expect(prompt).toContain("API Server");
      expect(prompt).toContain("Data Flow");
    });

    it("should create file-based documentation prompt", () => {
      const prompt = PROMPTS.parseAndDocument(
        "guide.pdf",
        "Content from PDF",
        "PDF"
      );

      expect(prompt).toContain("guide.pdf");
      expect(prompt).toContain("PDF");
      expect(prompt).toContain("Content from PDF");
    });
  });

  describe("system messages", () => {
    it("should have documentation expert system message", () => {
      expect(SYSTEM_MESSAGES.documentationExpert).toBeDefined();
      expect(SYSTEM_MESSAGES.documentationExpert.length).toBeGreaterThan(0);
    });

    it("should have code documentalist system message", () => {
      expect(SYSTEM_MESSAGES.codeDocumentalist).toBeDefined();
      expect(SYSTEM_MESSAGES.codeDocumentalist).toContain("code");
    });

    it("should have release notes writer system message", () => {
      expect(SYSTEM_MESSAGES.releaseNotesWriter).toBeDefined();
      expect(SYSTEM_MESSAGES.releaseNotesWriter).toContain("release notes");
    });
  });

  describe("generation options", () => {
    it("should support streaming option", () => {
      const options = {
        streaming: true,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
      };

      expect(options.streaming).toBe(true);
      expect(typeof options.onProgress).toBe("function");
      expect(typeof options.onComplete).toBe("function");
    });
  });
});
