# Copilot SDK Client Implementation

> Our strategy for integrating the GitHub Copilot SDK for Claude-powered documentation generation

## Overview

This document outlines how the Slack Documentation Agent uses the GitHub Copilot SDK to generate professional documentation. It aligns with the [official Copilot SDK Getting Started Guide](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md).

## Key References

- **Official Docs**: [github/copilot-sdk](https://github.com/github/copilot-sdk)
- **Getting Started**: [Getting Started Guide](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
- **Node.js SDK**: [Node.js README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- **MCP Integration**: [MCP Documentation](https://github.com/github/copilot-sdk/blob/main/docs/mcp/overview.md)

## Architecture

### High-Level Flow

```
Slack File Upload
       ↓
   [events.ts]
       ↓
   Download file
       ↓
   [parser.py] Parse to JSON chunks
       ↓
   [claude-client.ts] ← YOU ARE HERE
       ↓
   CopilotClient session
       ↓
Define tools:
   - vcs/branch (create GitLab/GitHub branch)
   - vcs/file (commit documentation)
   - vcs/mr (create merge request)
       ↓
   Send prompt + chunks to Copilot
       ↓
   Stream response in real-time
       ↓
   Tools automatically executed
       ↓
   Result: MR created + Slack notified
```

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

Create a `claude-client.ts` that wraps the Copilot SDK:

```typescript
import { CopilotClient } from "@github/copilot-sdk";

export class ClaudeClient {
  private client: CopilotClient;

  constructor() {
    this.client = new CopilotClient({
      // cliUrl: "localhost:4321" // optional: connect to external CLI server
      // Uses local CLI by default (auto-managed)
    });
  }

  async generate(prompt: string): Promise<string> {
    const session = await this.client.createSession({
      model: "gpt-4.1",
      streaming: true, // Enable streaming for real-time updates
    });

    let fullContent = "";

    // Stream response
    session.on("assistant.message_delta", (event) => {
      fullContent += event.data.deltaContent;
      // Could emit to Slack thread here for real-time updates
    });

    // Wait for completion
    await new Promise((resolve) => {
      session.on("session.idle", resolve);
    });

    await this.client.stop();
    return fullContent;
  }
}
```

### 3. Custom Tools with MCP Integration

Define tools that Copilot can invoke to create MRs:

```typescript
import { defineTool } from "@github/copilot-sdk";

// Tool 1: Create branch
const createBranchTool = defineTool("vcs/branch", {
  description: "Create a new documentation branch in GitLab or GitHub",
  parameters: {
    type: "object",
    properties: {
      branchName: {
        type: "string",
        description: "Name for the documentation branch (e.g., 'docs/api-v2')",
      },
      sourceRef: {
        type: "string",
        description: "Source branch (default: 'main')",
      },
    },
    required: ["branchName"],
  },
  handler: async (args: { branchName: string; sourceRef?: string }) => {
    // Delegate to MCP client
    const mrManager = new MRManager();
    return await mrManager.createBranch(args.branchName, args.sourceRef || "main");
  },
});

// Tool 2: Commit documentation file
const commitFileTool = defineTool("vcs/file", {
  description: "Commit a documentation file to the branch",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path in repo (e.g., 'docs/api-reference.md')",
      },
      content: {
        type: "string",
        description: "File content (markdown)",
      },
      branchName: {
        type: "string",
        description: "Branch to commit to",
      },
      message: {
        type: "string",
        description: "Commit message",
      },
    },
    required: ["filePath", "content", "branchName", "message"],
  },
  handler: async (args) => {
    const mrManager = new MRManager();
    return await mrManager.commitFile(
      args.branchName,
      args.filePath,
      args.content,
      args.message
    );
  },
});

// Tool 3: Create merge request
const createMRTool = defineTool("vcs/mr", {
  description: "Create a merge request with the documentation",
  parameters: {
    type: "object",
    properties: {
      branchName: {
        type: "string",
        description: "Branch with documentation changes",
      },
      title: {
        type: "string",
        description: "MR title (e.g., 'docs: Add API reference')",
      },
      description: {
        type: "string",
        description: "MR description with context",
      },
      targetBranch: {
        type: "string",
        description: "Target branch (default: 'main')",
      },
    },
    required: ["branchName", "title", "description"],
  },
  handler: async (args) => {
    const mrManager = new MRManager();
    return await mrManager.createMR(
      args.branchName,
      args.title,
      args.description,
      args.targetBranch || "main"
    );
  },
});
```

### 4. Prompt Engineering with Copilot

Craft a prompt that tells Copilot to use the tools:

```typescript
async function generateDocumentationWithTools(
  chunks: DocumentChunk[],
  projectName: string
): Promise<{ documentation: string; mrUrl: string }> {
  const client = new CopilotClient();
  const session = await client.createSession({
    model: "gpt-4.1",
    streaming: true,
    tools: [createBranchTool, commitFileTool, createMRTool],
  });

  const documentationContent = chunks.map((c) => c.content).join("\n\n---\n\n");

  const prompt = `
You are a technical documentation expert. Your task is to generate professional documentation and open a merge request.

**Project**: ${projectName}

**Source Material**:
${documentationContent}

**Important**: You MUST use the provided tools to:
1. Create a branch named "docs/auto-generated-" + timestamp
2. Commit the generated documentation to docs/generated.md
3. Create a merge request with title "docs: Auto-generated API documentation"

Steps:
1. Generate professional documentation (API refs, architecture, setup guides)
2. Call vcs/branch to create the branch
3. Call vcs/file to commit your documentation
4. Call vcs/mr to create the merge request
5. Return the MR URL

Be thorough but concise. Focus on clarity and completeness.
`;

  let generatedDocs = "";
  let mrUrl: string | null = null;

  // Stream and collect response
  session.on("assistant.message_delta", (event) => {
    generatedDocs += event.data.deltaContent;
    // Emit to Slack thread:
    // await slackClient.sendThreadReply(channelId, threadTs, `✨ ${event.data.deltaContent}`);
  });

  // Wait for all tools to complete
  await new Promise((resolve) => {
    session.on("session.idle", resolve);
  });

  await client.stop();

  return {
    documentation: generatedDocs,
    mrUrl: mrUrl || "https://github.com", // Extract from tool results
  };
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
const slackUpdater = new SlackStatusUpdater(client, channelId, threadTs);

session.on("assistant.message_delta", async (event) => {
  // Collect chunks
  fullContent += event.data.deltaContent;

  // Update Slack every 500 chars
  if (fullContent.length % 500 === 0) {
    await slackUpdater.updateStatus(
      "Generation",
      "✨",
      `${fullContent.length} chars generated...`
    );
  }
});

session.on("session.idle", async () => {
  await slackUpdater.success(mrUrl, `Documentation complete`);
});
```

## Event Types

The SDK emits these events:

| Event | Description |
|-------|---|
| `assistant.message_delta` | Chunk of response text received |
| `session.idle` | All processing complete, awaiting input |
| `tool_call` | Tool invocation requested |
| `tool_result` | Tool execution result |

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

## MCP Integration

The Copilot SDK supports MCP (Model Context Protocol) servers, which is how we handle GitLab/GitHub integration:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  mcpServers: {
    // Connect to GitHub MCP server
    github: {
      type: "http",
      url: "https://api.githubcopilot.com/mcp/",
    },
    // Or local GitLab MCP server
    gitlab: {
      type: "stdio",
      command: "node",
      args: ["./mcp-servers/gitlab-mcp.js"],
    },
  },
});
```

See [MCP Documentation](https://github.com/github/copilot-sdk/blob/main/docs/mcp/overview.md) for details.

## Development Workflow

### Local Testing

```bash
# Start with logging
DEBUG=copilot:* npm run dev

# Test generation
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{"projectName": "MyApp", "chunks": [...]}'
```

### Debugging

If tools aren't being called:
1. Verify tools are defined with proper JSON schemas
2. Check prompt explicitly instructs tool use
3. Monitor event stream for `tool_call` events
4. Review Copilot CLI logs: `copilot logs --follow`

## Performance Considerations

- **Token Count**: Large documents → more tokens → higher cost
- **Streaming**: Enables user feedback while processing
- **Tool Calls**: Each tool invocation adds latency
- **Model Choice**: Use `gpt-4.1` for complex documentation

## Next Steps

1. ✅ Understand Copilot SDK architecture (this doc)
2. ⏳ **Implement `claude-client.ts`** with session management
3. ⏳ **Define VCS tools** for MR creation
4. ⏳ **Wire to Slack pipeline** with streaming updates
5. ⏳ **Test end-to-end** with real files

See [Implementation Plan](../docs/plans/2026-03-06-slack-documentation-agent.md) for Task 4 details.

## Resources

- [Copilot SDK Repo](https://github.com/github/copilot-sdk)
- [Getting Started](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
- [Node.js API Reference](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- [MCP Overview](https://github.com/github/copilot-sdk/blob/main/docs/mcp/overview.md)
- [Authentication Guide](https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md)
