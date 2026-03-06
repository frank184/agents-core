import { CopilotClient, type PartialMessage } from "@github/copilot-sdk";
import { config } from "../config";

export interface GenerationRequest {
  prompt: string;
  maxTokens?: number;
  streaming?: boolean;
}

export interface GenerationResponse {
  content: string;
  model: string;
  finishReason?: string;
}

export class ClaudeClient {
  private client: CopilotClient;
  private model: string;

  constructor() {
    this.model = config.copilot.model || "gpt-4.1";

    // Initialize Copilot SDK client
    // Automatically manages CLI lifecycle unless cliUrl is specified
    this.client = new CopilotClient({
      // Optional: specify CLI URL for external server
      // cliUrl: "localhost:4321"
    });
  }

  /**
   * Generate text response without streaming
   */
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const session = await this.client.createSession({
        model: this.model,
        streaming: false,
      });

      const response = (await session.sendAndWait({
        prompt: request.prompt,
      })) as PartialMessage | undefined;

      await this.client.stop();

      const content = response?.content || "";

      return {
        content,
        model: this.model,
        finishReason: response?.finishReason,
      };
    } catch (error) {
      await this.client.stop();
      if (error instanceof Error) {
        throw new Error(`Claude generation error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate text response with streaming
   */
  async generateStream(
    request: GenerationRequest,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
  ): Promise<GenerationResponse> {
    try {
      const session = await this.client.createSession({
        model: this.model,
        streaming: true,
      });

      let fullContent = "";
      let finishReason = "stop";

      // Subscribe to message delta events for streaming chunks
      session.on("assistant.message_delta", (event) => {
        const chunk = event.data.deltaContent;
        fullContent += chunk;
        onChunk(chunk);
      });

      // Handle session completion
      await new Promise<void>((resolve, reject) => {
        session.on("session.idle", () => {
          onComplete?.();
          resolve();
        });

        session.on("error", (error) => {
          reject(error);
        });
      });

      await this.client.stop();

      return {
        content: fullContent,
        model: this.model,
        finishReason,
      };
    } catch (error) {
      await this.client.stop();
      if (error instanceof Error) {
        throw new Error(`Claude streaming error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate with custom system message
   */
  async generateWithSystem(
    systemMessage: string,
    userPrompt: string,
    streaming: boolean = false,
    onChunk?: (chunk: string) => void,
  ): Promise<GenerationResponse> {
    try {
      const session = await this.client.createSession({
        model: this.model,
        streaming,
        systemMessage: {
          content: systemMessage,
        },
      });

      let fullContent = "";

      if (streaming && onChunk) {
        session.on("assistant.message_delta", (event) => {
          const chunk = event.data.deltaContent;
          fullContent += chunk;
          onChunk(chunk);
        });
      }

      const response = (await session.sendAndWait({
        prompt: userPrompt,
      })) as PartialMessage | undefined;

      if (!streaming) {
        fullContent = response?.content || "";
      }

      await this.client.stop();

      return {
        content: fullContent,
        model: this.model,
        finishReason: response?.data?.finishReason,
      };
    } catch (error) {
      await this.client.stop();
      if (error instanceof Error) {
        throw new Error(`Claude generation error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Multi-turn conversation support
   */
  async createConversationSession() {
    return await this.client.createSession({
      model: this.model,
      streaming: true,
    });
  }

  async stopClient() {
    await this.client.stop();
  }
}
