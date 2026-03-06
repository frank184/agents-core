import { ClaudeClient, GenerationResponse } from "./claude-client";
import { PROMPTS, SYSTEM_MESSAGES } from "./prompts";

export interface DocumentationConfig {
  projectName: string;
  context?: string;
  style?: "technical" | "narrative" | "api";
}

export interface GenerationOptions {
  streaming?: boolean;
  onProgress?: (chunk: string) => void;
  onComplete?: () => void;
}

/**
 * High-level documentation generation orchestrator
 * Manages Claude client lifecycle and provides domain-specific generation methods
 */
export class DocumentationGenerator {
  private claudeClient: ClaudeClient;

  constructor() {
    this.claudeClient = new ClaudeClient();
  }

  /**
   * Generate documentation from parsed document content
   */
  async generateFromContent(
    content: string,
    config: DocumentationConfig,
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.documentSummarization(
      content,
      config.projectName
    );

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.documentationExpert,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Generate from document file (PDF/DOCX)
   */
  async generateFromFile(
    fileName: string,
    extractedContent: string,
    fileType: string,
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.parseAndDocument(
      fileName,
      extractedContent,
      fileType
    );

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.documentationExpert,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Enhance existing documentation
   */
  async enhanceDocumentation(
    title: string,
    content: string,
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.documentEnhancement(title, content);

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.documentationExpert,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Generate code documentation
   */
  async generateCodeDocumentation(
    code: string,
    language: string,
    context?: string,
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.codeDocumentation(code, language, context);

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.codeDocumentalist,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Generate release notes
   */
  async generateReleaseNotes(
    version: string,
    changes: string[],
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.releaseNotes(version, changes);

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.releaseNotesWriter,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Generate API documentation
   */
  async generateApiDocumentation(
    endpoints: string[],
    baseUrl: string,
    context?: string,
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.apiDocumentation(endpoints, baseUrl, context);

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.documentationExpert,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Generate architecture documentation
   */
  async generateArchitectureDocumentation(
    description: string,
    components: string[],
    options?: GenerationOptions
  ): Promise<string> {
    const prompt = PROMPTS.architectureDocumentation(description, components);

    const response = await this.claudeClient.generateWithSystem(
      SYSTEM_MESSAGES.documentationExpert,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Generic generation with custom prompt
   */
  async generate(
    prompt: string,
    systemMessage?: string,
    options?: GenerationOptions
  ): Promise<string> {
    const response = await this.claudeClient.generateWithSystem(
      systemMessage || SYSTEM_MESSAGES.documentationExpert,
      prompt,
      options?.streaming || false,
      options?.onProgress
    );

    options?.onComplete?.();
    return response.content;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.claudeClient.stopClient();
  }
}
