# Copilot SDK Integration Implementation

This document explains how the Slack Documentation Agent uses the GitHub Copilot SDK following the [official getting-started guide](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md).

## Overview

The agent uses the Copilot SDK to generate high-quality markdown documentation from parsed content. The implementation follows the official guide's patterns for initialization, streaming, and session management.

## Architecture

```
┌─────────────────────────────────────────┐
│  DocumentationGenerator                 │
│  (High-level orchestration)             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  ClaudeClient                           │
│  Wraps CopilotClient from official SDK  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  CopilotClient (official SDK)           │
│  ├─ Auto-manages CLI lifecycle          │
│  ├─ Handles authentication              │
│  ├─ Manages sessions                    │
│  └─ Provides streaming support          │
└─────────────────────────────────────────┘
```

## Prerequisites

1. **GitHub Copilot CLI installed and authenticated**
   ```bash
   # Install
   npm install -g @github/copilot-cli

   # Authenticate
   copilot auth login

   # Verify
   copilot --version
   ```

2. **Node.js 18+** (already required)

3. **Copilot SDK** (added to package.json)
   ```bash
   npm install @github/copilot-sdk
   ```

## Key Components

### 1. ClaudeClient (`src/generation/claude-client.ts`)

Wraps the Copilot SDK with custom methods for documentation generation:

```typescript
import { CopilotClient } from "@github/copilot-sdk";

export class ClaudeClient {
  private client: CopilotClient;

  constructor() {
    // Initialize - automatically manages CLI lifecycle
    this.client = new CopilotClient();
  }

  // Generate without streaming
  async generate(request): Promise<GenerationResponse>

  // Generate with streaming chunks
  async generateStream(request, onChunk): Promise<GenerationResponse>

  // Generate with custom system message
  async generateWithSystem(systemMessage, userPrompt, streaming, onChunk)
}
```

### 2. Prompts (`src/generation/prompts.ts`)

Contains:
- **System Messages**: Define Claude's behavior and expertise
- **Prompt Templates**: Task-specific prompts for documentation types

System messages give context:
```typescript
const SYSTEM_MESSAGES = {
  documentationExpert: "You are a technical documentation expert...",
  codeDocumentalist: "You are an expert code documentation specialist...",
  releaseNotesWriter: "You are a professional release notes writer...",
};
```

### 3. DocumentationGenerator (`src/generation/generator.ts`)

High-level API for documentation tasks:

```typescript
export class DocumentationGenerator {
  async generateFromContent(content, config, options)
  async generateFromFile(fileName, extractedContent, fileType, options)
  async generateCodeDocumentation(code, language, context, options)
  async generateReleaseNotes(version, changes, options)
  async generateApiDocumentation(endpoints, baseUrl, context, options)
  async generateArchitectureDocumentation(description, components, options)
}
```

## SDK Pattern: Creating Sessions

Following the official guide, sessions are created with configuration:

```typescript
// From official guide - Step 2
const session = await client.createSession({
  model: "gpt-4.1",
  streaming: false,  // or true for streaming
});

const response = await session.sendAndWait({
  prompt: "Your prompt here",
});
```

## Streaming Pattern

Following the official guide - Step 3:

```typescript
session.on("assistant.message_delta", (event) => {
  // Real-time chunks as they arrive
  process.stdout.write(event.data.deltaContent);
});

session.on("session.idle", () => {
  // Generation complete
  console.log("Done!");
});

await session.sendAndWait({ prompt: "Tell me a short joke" });
```

## Integration with Slack

When a file is uploaded to Slack:

```typescript
// 1. Parse document
const chunks = await parseDocument(fileUrl);

// 2. Generate markdown with streaming
const generator = new DocumentationGenerator();
let markdown = "";

const result = await generator.generateFromContent(
  chunks.join("\n\n"),
  { projectName: "API Guide" },
  {
    streaming: true,
    onProgress: (chunk) => {
      // Update Slack thread in real-time
      slackClient.sendThreadReply(channelId, threadTs, chunk);
      markdown += chunk;
    },
    onComplete: () => {
      // Save and create MR
      saveMarkdown(markdown);
      createMR(markdown);
    },
  }
);
```

## Usage Examples

### Generate Documentation from File

```typescript
const generator = new DocumentationGenerator();

const markdown = await generator.generateFromFile(
  "API-Guide.pdf",
  extractedText,
  "PDF",
  {
    streaming: true,
    onProgress: (chunk) => console.log(chunk),
  }
);
```

### Generate Code Documentation

```typescript
const codeDocs = await generator.generateCodeDocumentation(
  "function calculateTotal(items) { ... }",
  "javascript",
  "Shopping cart utility",
  { streaming: true }
);
```

### Generate Release Notes

```typescript
const releaseNotes = await generator.generateReleaseNotes(
  "2.0.0",
  ["Added new dashboard", "Fixed login bug", "Improved performance"]
);
```

## Authentication & CLI

The Copilot SDK automatically:

1. **Detects** the Copilot CLI
2. **Starts** it if needed
3. **Uses** your existing authentication from `copilot auth login`
4. **Stops** it when done (with `client.stop()`)

No additional authentication needed beyond CLI login!

## Configuration Options

Override CLI URL if running separately:

```typescript
const client = new CopilotClient({
  cliUrl: "localhost:4321"  // Connect to external CLI server
});
```

## Advanced: Custom System Messages

Guide Claude's behavior with system messages:

```typescript
const response = await claudeClient.generateWithSystem(
  "You are a security expert. Focus on potential vulnerabilities.",
  "Review this code for security issues",
  true,  // streaming
  (chunk) => console.log(chunk)
);
```

## Error Handling

```typescript
try {
  const markdown = await generator.generateFromContent(
    content,
    config,
    options
  );
} catch (error) {
  if (error.message.includes("auth")) {
    console.error("Run: copilot auth login");
  } else if (error.message.includes("model")) {
    console.error("Model not available. Check Copilot CLI.");
  }
  throw error;
}
```

## Cleanup

Always stop the client when done:

```typescript
await generator.cleanup();  // Calls claudeClient.stopClient()
```

## Next Steps

1. **Install dependencies**
   ```bash
   npm install --ignore-scripts  # Installs @github/copilot-sdk
   ```

2. **Ensure Copilot CLI is authenticated**
   ```bash
   copilot auth status
   ```

3. **Test generation**
   ```bash
   npm run build
   npm test
   ```

4. **Wire to Slack pipeline** (Task 5)
   - Connect DocumentationProcessor to DocumentationGenerator
   - Stream chunks to Slack thread
   - Create MR with generated markdown

## Resources

- [Official Getting Started Guide](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
- [Node.js SDK Reference](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- [Authentication Guide](https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md)
- [MCP Integration](https://github.com/github/copilot-sdk/blob/main/docs/mcp/overview.md)
