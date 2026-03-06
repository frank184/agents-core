# Slack Webhook Lifecycle Design

> Design document for Slack event flow, status updates, and webhook patterns

## Overview

The agent communicates with Slack through a **minimal webhook pattern**:
- Receives `file_shared` events (via Socket Mode)
- Posts simple status updates to thread
- No complex slash commands or interactive components
- Focus: async job status, MR links, errors

## Event Flow Diagram

```
[1] User uploads file to #docs-uploads
    ↓
Slack sends file_shared event
    ↓
[2] Bot acknowledges: "📄 Processing..."
    ↓
[3] Parse document (Python subprocess)
    ↓
Bot updates: "✨ Generating documentation..."
    ↓
[4] Claude generation (Copilot SDK)
    ↓
Bot updates: "📤 Creating merge request..."
    ↓
[5] MCP creates MR in GitLab/GitHub
    ↓
[6] Bot posts final: "✅ MR: https://gitlab.com/..."
    ↓
User clicks link to review
```

## Event Handler Lifecycle

### Slack Event: file_shared

```typescript
/**
 * Triggered when any file is shared in a channel the bot watches
 * 
 * Event structure:
 * {
 *   type: 'file_shared',
 *   file_id: 'F1234567890',
 *   user_id: 'U1234567890',
 *   channel_id: 'C1234567890',
 *   ts: '1234567890.123456'  <- thread timestamp
 * }
 */

app.event('file_shared', async ({ event, say, client }) => {
  const threadTs = event.ts;  // Used for all replies
  
  try {
    // Step 1: Fetch file info
    const fileInfo = await client.files.info({ file: event.file_id });
    const file = fileInfo.file as any;
    
    // Step 2: Validate (quick, synchronous)
    if (!isSupportedFile(file)) {
      await say({
        thread_ts: threadTs,
        text: `⚠️ Only PDF and DOCX files supported. Got: ${file.name}`,
      });
      return;
    }
    
    // Step 3: Acknowledge to user (blocking reply)
    await say({
      thread_ts: threadTs,
      text: `📄 Processing ${file.name}...`,
    });
    
    // Step 4: Trigger async pipeline (non-blocking)
    // Fire and forget - updates happen via sendThreadReply
    processFile(
      event.file_id,
      file.name,
      file.url_private,
      event.channel,
      threadTs,
      client  // Pass client for later updates
    ).catch(error => {
      console.error('Pipeline error:', error);
      // Fallback error update
      client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: `❌ Fatal error: ${error.message}`,
      });
    });
    
  } catch (error) {
    console.error('Event handler error:', error);
    await say({
      thread_ts: threadTs,
      text: '❌ Error processing file. Check logs.',
    });
  }
});
```

## Status Update Pattern

**Key Principle:** One status message per stage, posted to thread

```typescript
class SlackStatusUpdater {
  constructor(
    private client: any,
    private channelId: string,
    private threadTs: string,
  ) {}

  async updateStatus(stage: string, emoji: string, message: string) {
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: this.threadTs,
      text: `${emoji} ${stage} - ${message}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${stage}*\n\`\`\`\n${message}\n\`\`\``,
          },
        },
      ],
    });
  }

  async success(mrUrl: string, details: string) {
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: this.threadTs,
      text: '✅ Documentation generated',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Documentation Complete*\n\n🔗 *MR/PR:* <${mrUrl}|View Merge Request>\n\n📊 *Details:*\n${details}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View in GitLab/GitHub',
              },
              url: mrUrl,
            },
          ],
        },
      ],
    });
  }

  async error(stage: string, reason: string) {
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: this.threadTs,
      text: '❌ Processing failed',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ *Failed at: ${stage}*\n\n\`\`\`\n${reason}\n\`\`\``,
          },
        },
      ],
    });
  }
}
```

## Processing Pipeline (Async)

```typescript
async function processFile(
  fileId: string,
  fileName: string,
  fileUrl: string,
  channelId: string,
  threadTs: string,
  slackClient: any,
) {
  const updater = new SlackStatusUpdater(slackClient, channelId, threadTs);

  try {
    // ============================================
    // STAGE 1: DOWNLOAD & PARSE
    // ============================================
    await updater.updateStatus('Stage 1/3', '📄', 'Downloading and parsing...');

    const filePath = await downloadFile(fileUrl, fileName);
    const parsed = await parseDocument(filePath);  // Python subprocess

    await updater.updateStatus('Stage 1/3', '✅', `Extracted ${parsed.chunk_count} chunks`);

    // ============================================
    // STAGE 2: GENERATE
    // ============================================
    await updater.updateStatus('Stage 2/3', '✨', 'Generating with Claude...');

    const generator = new DocumentationGenerator();
    const documentation = await generator.generateFromContent(
      combinedChunks(parsed.chunks),
      {
        projectName: extractProjectName(fileName),
        context: `Auto-generated from: ${fileName}`,
      }
    );

    await updater.updateStatus(
      'Stage 2/3',
      '✅',
      `Generated ${documentation.length} chars`
    );

    // ============================================
    // STAGE 3: CREATE MR
    // ============================================
    await updater.updateStatus('Stage 3/3', '📤', 'Creating merge request...');

    const mrManager = new MRManager();
    const mrUrl = await mrManager.createDocumentationMR(
      `docs: ${extractProjectName(fileName)}`,
      documentation,
      `docs/auto-${Date.now()}`,
      'main'
    );

    // ============================================
    // SUCCESS
    // ============================================
    await updater.success(mrUrl, `
📄 Source: ${fileName}
🔗 Chunks: ${parsed.chunk_count}
📊 Generated: ${Math.ceil(documentation.length / 3500)} pages (estimate)
⏱️  Completed: ${new Date().toISOString()}
    `);

  } catch (error) {
    const stage = error.stage || 'Unknown';
    const reason = error.message || String(error);
    
    console.error(`Pipeline error at ${stage}:`, error);
    await updater.error(stage, reason);
  }
}
```

## Thread-Safe Patterns

**Challenge:** Multiple files uploaded → multiple processes → race conditions?

**Solution:** Each upload gets unique `threadTs` (message timestamp)
- Slack guarantees uniqueness
- All updates scoped to that thread
- No cross-contamination

```typescript
// Each file_shared event has unique ts
event.ts === '1234567890.123456';  // Always unique per message

// All replies target that thread
await client.chat.postMessage({
  channel: event.channel,
  thread_ts: event.ts,  // ← Scopes reply to this thread
  text: '...'
});
```

## Webhook (vs Block Kit) Justification

**We don't need:**
❌ Slash commands (`/docs status`)
❌ Interactive buttons (approve/reject)
❌ Form inputs (configure options)
❌ Rich formatting (block kit overengineering)

**We use:**
✅ Simple text posts to thread
✅ Markdown formatting (sufficient for status)
✅ Links to MR/PR (user navigates externally)
✅ Event handlers (declarative on file upload)

**Why:** Keeps bot simple, lightweight, predictable. User experience is "upload → done" with status in thread.

## Error States & Recovery

```typescript
enum ProcessingError {
  UNSUPPORTED_TYPE = 'File type not supported',
  FILE_TOO_LARGE = 'File exceeds 50MB limit',
  PARSE_FAILED = 'Could not parse document',
  CLAUDE_ERROR = 'Generation service unavailable',
  MR_CONFLICT = 'Branch already exists (naming collision)',
  RATE_LIMITED = 'VCS rate limit exceeded',
  TIMEOUT = 'Processing took too long',
}

// Slack notification
if (error === ProcessingError.RATE_LIMITED) {
  await updater.error(
    'Create MR',
    'Rate limited by GitLab. Retrying in 60s...'
  );
  // Exponential backoff queue (e.g., Bull/RabbitMQ)
}
```

## Monitoring & Observability

**Log pattern:**
```
[FILE_SHARED] fileId=F123 fileName=api.pdf user=U456
[PARSE_START] stage=1 chunks_expected=~50
[PARSE_COMPLETE] stage=1 chunks_actual=52 duration_ms=2341
[GENERATE_START] stage=2 model=claude-opus
[GENERATE_COMPLETE] stage=2 tokens_used=3421 duration_ms=8932
[MR_START] stage=3 branch=docs/auto-1234567890
[MR_COMPLETE] stage=3 mrUrl=https://gitlab.com/.../merge_requests/999
[SUCCESS] jobId=f123-1234567890 total_duration_ms=11273
```

## Slack Bot Permissions (Socket Mode)

Required bot scopes for this workflow:
- `files:read` - Access uploaded file metadata
- `chat:write` - Post messages to channels
- `chat:write.public` - Post to public channels

Socket Mode scopes:
- `connections:write` - Maintain socket connection
- `app_mentions:read` - Listen to events

## Future Enhancements

1. **Interactive MR Review** - "Approve & Merge" button in Slack thread
2. **Webhook Retries** - Failed operations auto-attempt
3. **Polling Updates** - `/docs status @filename` command
4. **Batch Processing** - Multiple files → single MR
5. **Custom Prompts** - User specifies documentation style in thread reply
