# Copilot SDK Client Implementation

> Our strategy for integrating the GitHub Copilot SDK for Claude-powered markdown generation

## Overview

This document outlines how the Slack Documentation Agent uses the GitHub Copilot SDK to transform parsed documents into professional markdown documentation. This is a **transformation workflow**, not an agentic workflow - the agent does not make autonomous decisions or create VCS commits.

**Skills Integration**: The Copilot SDK has access to skills (`.agents/skills/`) that provide domain knowledge for markdown conversion, documentation best practices, and structured output formatting. These skills augment Claude's ability to produce high-quality technical documentation.

## Key References

- **Official Docs**: [github/copilot-sdk](https://github.com/github/copilot-sdk)
- **Getting Started**: [Getting Started Guide](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
- **Node.js SDK**: [Node.js README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)

## Architecture

### Simplified Flow

```
Slack File Upload (PDF/DOCX)
       ↓
   [events.ts] Receive file_shared event
       ↓
   Download file to local storage
       ↓
   [parser.py] Extract text → JSON chunks
       ↓
   [claude-client.ts] ← YOU ARE HERE
       ↓
   CopilotClient.generate(prompt)
       ↓
   Stream markdown response
       ↓
   Save to .md file
       ↓
   Upload file back to Slack thread
       ↓
   Human reviews → creates MR manually
```

**No Tools. No MCP. No Autonomous Actions.**

## Implementation Details

### 1. Installation

The SDK is already in `package.json`. To use it, install:

```bash
npm install
```

Key dependencies:
- `@github/copilot-sdk` - Main SDK
- `tsx` - TypeScript runtime (for development)

### 2. Client Initialization

Create a `claude-client.ts` that wraps the Copilot SDK for simple text generation:

```typescript
import { CopilotClient } from "@github/copilot-sdk";
import { config } from '../config';

export class ClaudeClient {
  private client: CopilotClient;

  constructor() {
    this.client = new CopilotClient({
      // Uses local Copilot CLI by default (auto-managed)
    });
  }

  async generate(prompt: string, maxTokens: number = 4096): Promise<string> {
    const session = await this.client.createSession({
      model: config.copilot.model || "gpt-4.1",
      streaming: true,
    });

    let fullContent = "";

    // Stream response chunks
    session.on("assistant.message_delta", (event) => {
      fullContent += event.data.deltaContent;
    });

    // Send prompt
    session.sendMessage({
      role: "user",
      content: prompt,
    });

    // Wait for completion
    await new Promise((resolve) => {
      session.on("session.idle", resolve);
    });

    await this.client.stop();
    return fullContent;
  }

  async generateWithProgress(
    prompt: string,
    onProgress: (chunk: string) => void
  ): Promise<string> {
    const session = await this.client.createSession({
      model: config.copilot.model || "gpt-4.1",
      streaming: true,
    });

    let fullContent = "";

    session.on("assistant.message_delta", (event) => {
      const chunk = event.data.deltaContent;
      fullContent += chunk;
      onProgress(chunk); // Emit to Slack thread
    });

    session.sendMessage({ role: "user", content: prompt });

    await new Promise((resolve) => {
      session.on("session.idle", resolve);
    });

    await this.client.stop();
    return fullContent;
  }
}
```

### 3. Prompt Engineering for Documentation

Craft prompts that produce high-quality markdown. The Copilot SDK has access to skills that provide documentation expertise:

```typescript
export function createDocumentationPrompt(
  chunks: string[],
  projectName: string
): string {
  const content = chunks.join("\n\n---\n\n");

  return `
You are a technical documentation expert with access to skills for markdown formatting and 
documentation best practices. Transform the following document into professional markdown documentation.

**Project**: ${projectName}

**Source Material**:
${content}

**Instructions**:
1. Create a comprehensive README.md-style document
2. Include these sections:
   - ## Overview (2-3 sentences)
   - ## Key Features (bullet list)
   - ## Getting Started
   - ## Architecture (if applicable)
   - ## API Reference (if applicable)
   - ## Contributing
3. Use proper markdown formatting
4. Be concise but thorough
5. Add code examples where relevant

**Output**: Only the markdown documentation. No explanations or meta-commentary.
`;
}
```

## Authentication

### Copilot CLI Authentication

The SDK uses the Copilot CLI for authentication. Ensure it's installed and authenticated:

```bash
# Install CLI (if not already)
npm install -g @github/copilot-cli

# Authenticate
copilot auth login

# Verify
copilot --version
```

### Environment Setup

In `.env`, ensure you have:

```bash
COPILOT_API_KEY=your-key-if-using-bring-your-own-key
```

Or rely on CLI authentication (recommended).

## Streaming & Real-Time Updates

The SDK provides real-time streaming. Use it to update Slack as generation happens:

```typescript
import { SlackClient } from '../slack/client';

const claudeClient = new ClaudeClient();
const slackClient = new SlackClient();

// Generate with real-time Slack updates
const markdown = await claudeClient.generateWithProgress(
  prompt,
  async (chunk) => {
    // Post incremental updates to Slack thread
    // (Throttle to avoid rate limits)
    if (chunk.length > 100) {
      await slackClient.sendThreadReply(
        channelId,
        threadTs,
        `✨ Generating... (${chunk.length} chars so far)`
      );
    }
  }
);

// Final upload
await slackClient.uploadFile(
  channelId,
  threadTs,
  `${projectName}.md`,
  `✅ Documentation complete!`
);
```

## Event Types

The SDK emits these events:

| Event | Description |
|-------|---|
| `assistant.message_delta` | Chunk of markdown text received |
| `session.idle` | Generation complete, session idle |

**We do NOT use:**
- `tool_call` events (no tools defined)
- `tool_result` events (no tool execution)

## Error Handling

```typescript
try {
  const session = await client.createSession({ model: "gpt-4.1" });
  // ...
} catch (error) {
  if (error.code === "auth_required") {
    console.error("Authentication failed. Run: copilot auth login");
  } else if (error.code === "rate_limited") {
    console.error("Rate limited. Retry after:", error.retryAfter);
  }
  throw error;
}
```

## Development Workflow

### Local Testing

```bash
# Start bot in dev mode
npm run dev

# Upload a PDF to Slack channel
# Watch terminal for generation logs
# Check Slack thread for markdown output
```

### Debugging

If generation fails:
1. Check Copilot CLI authentication: `copilot auth status`
2. Verify model access in `.env`: `COPILOT_MODEL=gpt-4.1`
3. Enable debug logs: `DEBUG=copilot:* npm run dev`
4. Check rate limits and quotas

## Performance Considerations

- **Token Count**: Large documents → more tokens → higher cost
  - Optimize by chunking and generating section-by-section
- **Streaming**: Enables user feedback while processing
  - Update Slack thread every 500 characters
- **Model Choice**: Use `gpt-4.1` for complex documentation, `claude-sonnet` for speed

## Next Steps

1. ✅ Understand simple generation workflow (this doc)
2. ⏳ **Implement `claude-client.ts`** with streaming
3. ⏳ **Create prompt templates** for different doc types
4. ⏳ **Wire to Slack pipeline** with real-time updates
5. ⏳ **Test end-to-end** with real PDF/DOCX files

See [Implementation Plan](../docs/plans/2026-03-06-slack-documentation-agent.md) for Task 4 details.

## Resources

- [Copilot SDK Repo](https://github.com/github/copilot-sdk)
- [Getting Started](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
- [Node.js API Reference](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- [Authentication Guide](https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md)
