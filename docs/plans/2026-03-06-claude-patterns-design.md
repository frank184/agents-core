# Claude Integration Patterns

> Design document for Copilot SDK integration, prompt engineering, and streaming patterns

## Overview

The agent uses the **enterprise Copilot SDK** to access Claude for documentation generation. This document covers:
- SDK configuration and error handling
- Prompt engineering for consistent, high-quality output
- Streaming responses for large document generation
- Token management and cost optimization

## Copilot SDK Integration

### Authentication

```typescript
// via Copilot SDK (enterprise license)
const claude = new CopilotClaudeClient({
  apiKey: process.env.COPILOT_API_KEY,
  model: 'claude-opus',  // or 'claude-sonnet' for cost optimization
  region: 'us-east-1',   // enterprise deployment region
});

// The Copilot SDK handles:
// - Token count management
// - Rate limiting + retry logic
// - Usage tracking for billing
// - Enterprise SSO integration (if configured)
```

### Error Handling

```typescript
class ClaudeGenerationError extends Error {
  constructor(
    public code: string,  // 'rate_limited', 'context_length_exceeded', etc.
    public message: string,
    public retryable: boolean,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

type GenerationResult = 
  | { success: true; content: string; tokensUsed: number }
  | { success: false; error: ClaudeGenerationError };

async function generateWithRetry(
  prompt: string,
  maxRetries = 3,
): Promise<GenerationResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await claude.messages.create({
        model: 'claude-opus',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return {
        success: true,
        content: response.content[0].type === 'text' ? response.content[0].text : '',
        tokensUsed: response.usage.output_tokens,
      };
    } catch (error) {
      if (error.code === 'rate_limited' && attempt < maxRetries) {
        const delay = error.retryAfterMs || 5000 * Math.pow(2, attempt - 1);
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return {
        success: false,
        error: new ClaudeGenerationError(
          error.code || 'unknown_error',
          error.message,
          attempt < maxRetries,
          5000 * Math.pow(2, attempt)
        ),
      };
    }
  }

  return {
    success: false,
    error: new ClaudeGenerationError(
      'max_retries_exceeded',
      'Failed after 3 attempts',
      false,
    ),
  };
}
```

## Prompt Engineering Framework

### Core Principle

**System + Few-Shot + Dynamic Context = High Quality**

```typescript
interface GenerationRequest {
  documentationType: 'api' | 'guide' | 'architecture' | 'tutorial' | 'changelog';
  sourceContext: string;  // Parsed document chunks
  projectName: string;
  projectContext?: string;  // "This is a Node.js REST API"
  tone?: 'technical' | 'narrative' | 'minimal';
  targetAudience?: 'developers' | 'stakeholders' | 'users';
}

const SYSTEM_PROMPTS = {
  documentation: `You are a technical documentation expert. Your role is to:
1. Create clear, accurate, professional documentation
2. Use appropriate technical terminology
3. Include practical examples where helpful
4. Organize content logically with clear headings
5. Follow markdown formatting conventions
6. Ensure all claims are backed by provided source material

Guidelines:
- Do NOT invent features or behavior not mentioned in source
- DO cite specific sections when relevant
- DO use consistent formatting and structure
- DO provide working examples for code-heavy content
- Avoid marketing language; be factual and precise`,

  apiReference: `You are an API documentation specialist. Generate clear, comprehensive API documentation:
1. Overview of endpoints and resources
2. Request/response formats with examples
3. Authentication and error handling
4. Code examples in popular languages
5. Rate limits and best practices

Format as OpenAPI-compatible markdown. Include curl examples for all endpoints.`,

  guide: `You are a technical writer creating guides. Structure as:
1. Introduction (what will be learned)
2. Prerequisites (what's needed)
3. Step-by-step instructions (clear, actionable)
4. Troubleshooting section
5. Next steps / resources

Use imperative mood. Test each instruction for clarity.`,

  changelog: `You are a release notes specialist. Generate structured changelog:
1. Version and date
2. New Features (with descriptions)
3. Bug Fixes (link to issues if available)
4. Breaking Changes (clearly highlighted)
5. Migration Guide (if applicable)
6. Known Issues

Prioritize by importance. Use consistent formatting.`,
};
```

### Dynamic Prompt Construction

```typescript
function buildPrompt(request: GenerationRequest): string {
  const systemPrompt = SYSTEM_PROMPTS[request.documentationType];

  const contextPrompt = `
SOURCE MATERIAL:
===============
${request.sourceContext}

PROJECT INFO:
- Name: ${request.projectName}
${request.projectContext ? `- Context: ${request.projectContext}` : ''}

TARGET AUDIENCE: ${request.targetAudience || 'developers'}
TONE: ${request.tone || 'technical'}
`;

  const instructionPrompt = `
Generate comprehensive ${request.documentationType} documentation based on the source material above.

Requirements:
1. Use only information from the source material
2. Format as valid Markdown
3. Include practical examples where appropriate
4. Organize logically with clear section headings
5. Be concise but complete

Output: Markdown document, ready for inclusion in repository
`;

  return `${systemPrompt}\n\n${contextPrompt}\n\n${instructionPrompt}`;
}
```

### Few-Shot Examples (Optional, for complex formats)

```typescript
const FEW_SHOT_EXAMPLES = {
  apiReference: `
Example API Documentation Section:

# Authentication

All API requests require authentication via Bearer token in the Authorization header.

\`\`\`bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.example.com/users
\`\`\`

## Token Management

Tokens expire after 24 hours. Refresh using the /auth/refresh endpoint.

\`\`\`typescript
const response = await fetch('https://api.example.com/auth/refresh', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${old_token}\`
  }
});
const { token } = await response.json();
\`\`\`
  `,

  changelog: `
Example Changelog Entry:

## Version 2.1.0 - 2026-03-06

### New Features
- **Batch Operations API** - Process multiple items in single request (#234)
- **Webhook Retries** - Automatic retry with exponential backoff
- **Custom Error Codes** - Standardized error responses across all endpoints

### Bug Fixes
- Fixed race condition in concurrent file uploads (#567)
- Corrected typo in authentication docs

### Breaking Changes
- **Removed**: Deprecated \`/api/v1/users\` endpoint. Use \`/api/v2/users\` instead.

### Migration Guide

Old code:
\`\`\`typescript
const users = await client.users.list();  // v1
\`\`\`

New code:
\`\`\`typescript
const users = await client.v2.users.list();
\`\`\`
  `,
};
```

## Streaming for Large Documents

For documents exceeding 8000 tokens generated, use streaming to:
- Show progress in Slack ("✨ Generating: 45% complete...")
- Process output incrementally
- Reduce memory usage

```typescript
async function generateWithStreaming(
  request: GenerationRequest,
  onChunk: (chunk: string) => Promise<void>,
): Promise<string> {
  const prompt = buildPrompt(request);
  let fullContent = '';
  let messageToken = '';

  try {
    const stream = await claude.messages.stream({
      model: 'claude-opus',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const chunk = event.delta.text;
        fullContent += chunk;

        // Call callback (e.g., update Slack, write to file)
        await onChunk(chunk);

        // Periodic updates (every 500 chars)
        if (fullContent.length % 500 === 0) {
          console.log(`Generated ${fullContent.length} chars...`);
        }
      }
    }

    return fullContent;

  } catch (error) {
    throw new ClaudeGenerationError(
      'streaming_error',
      `Stream error: ${error.message}`,
      false,
    );
  }
}
```

### Slack Real-Time Updates with Streaming

```typescript
async function generateAndUpdateSlack(
  request: GenerationRequest,
  slackClient: any,
  channelId: string,
  threadTs: string,
): Promise<string> {
  let currentMessage = '';
  let lastUpdateTime = Date.now();
  let lastUpdateLines = 0;
  let statusMessageTs = '';

  // Initial status message
  const status = await slackClient.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: '✨ Generating documentation...',
  });
  statusMessageTs = status.ts;

  const content = await generateWithStreaming(request, async (chunk) => {
    currentMessage += chunk;

    // Update Slack every 2 seconds or 200 chars
    const now = Date.now();
    if (now - lastUpdateTime > 2000 || currentMessage.length - lastUpdateLines > 200) {
      const preview = currentMessage.slice(0, 200) + (currentMessage.length > 200 ? '...' : '');

      await slackClient.chat.update({
        channel: channelId,
        ts: statusMessageTs,
        text: `✨ Generating documentation...\n\`\`\`\n${preview}\n\`\`\``,
      });

      lastUpdateTime = now;
      lastUpdateLines = currentMessage.length;
    }
  });

  return content;
}
```

## Token and Cost Optimization

### Token Estimation

```typescript
function estimatePromptTokens(text: string): number {
  // Claude averages ~3-4 tokens per word for English
  // Conservative estimate
  const words = text.split(/\\s+/).length;
  return Math.ceil(words * 1.3);
}

function estimateResponseTokens(documentationType: string): number {
  // Based on typical output sizes
  const estimates = {
    'api': 2500,
    'guide': 3000,
    'architecture': 2000,
    'tutorial': 3500,
    'changelog': 1500,
  };

  return estimates[documentationType] || 2500;
}

function estimateCost(
  modelUsed: 'claude-opus' | 'claude-sonnet',
  inputTokens: number,
  outputTokens: number,
): number {
  // Pricing example (verify with current enterprise rates)
  const rates = {
    'claude-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
    'claude-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 },
  };

  const rate = rates[modelUsed];
  return (inputTokens * rate.input) + (outputTokens * rate.output);
}
```

### Model Selection Strategy

```typescript
type ModelChoice = 'claude-opus' | 'claude-sonnet';

function selectModel(request: GenerationRequest): ModelChoice {
  // Tradeoff: Quality vs Speed/Cost

  const complexTypes = ['api', 'architecture'];
  if (complexTypes.includes(request.documentationType)) {
    return 'claude-opus';  // $0.075/1K output tokens - best quality
  }

  const simpleTypes = ['changelog'];
  if (simpleTypes.includes(request.documentationType)) {
    return 'claude-sonnet';  // $0.015/1K output tokens - fast, sufficient
  }

  // Default: Sonnet (good balance)
  return 'claude-sonnet';
}
```

## Post-Processing & Validation

After Claude generation, run quality checks:

```typescript
async function validateGeneratedDoc(
  content: string,
  documentationType: string,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues = [];

  // 1. Markdown syntax validation
  if (!isValidMarkdown(content)) {
    issues.push('Markdown syntax errors detected');
  }

  // 2. Structure validation
  if (documentationType === 'api' && !content.includes('# ')) {
    issues.push('Missing top-level heading');
  }

  // 3. Length validation
  if (content.length < 200) {
    issues.push('Generated content too short (<200 chars)');
  }

  // 4. Code block validation
  const codeBlocks = content.match(/```(\\w+)\\n/g) || [];
  const unsupportedLangs = codeBlocks
    .map(block => block.match(/```(\\w+)/)?.[1])
    .filter(lang => !SUPPORTED_LANGUAGES.includes(lang));

  if (unsupportedLangs.length > 0) {
    issues.push(`Unsupported code languages: ${unsupportedLangs.join(', ')}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
```

## Configuration & Monitoring

```typescript
interface ClaudeConfig {
  modelDefault: 'claude-opus' | 'claude-sonnet';
  maxTokensOutput: number;  // 4096 for claude-opus
  temperatureDefault: number;  // 0.5 for consistency
  timeoutMs: number;  // 30000
  retryAttempts: number;  // 3
  enableMetrics: boolean;
  costTracker?: {
    dailyBudget: number;
    warningThreshold: number;  // Alert at 80%
  };
}

// Metrics to track:
// - Avg generation time by type
// - Token usage by model
// - Error rates
// - Cost per document type
```

## Future Enhancements

1. **Multi-Model Orchestration** - Use Claude 3.5 when available; fallback to Sonnet
2. **Fine-Tuning** - Custom training on your documentation style
3. **Context Compression** - Use Claude's prompt caching for repeated contexts
4. **A/B Testing** - Compare prompts for quality and cost
5. **Custom Instructions** - Allow users to specify documentation preferences per project
