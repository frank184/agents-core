# Slack Integration Guide

> How the Slack Documentation Agent listens for files, manages threads, and posts updates

## Overview

The agent integrates with Slack via the **Bolt SDK** using **Socket Mode** for real-time event handling. This enables a seamless workflow: upload file → agent processes → posts MR link to thread.

## Key References

- **Slack Bolt SDK**: [Node.js Documentation](https://slack.dev/bolt-js/)
- **Slack Events API**: [Event Types](https://api.slack.com/events)
- **Socket Mode**: [Documentation](https://api.slack.com/socket-mode)

## Architecture

### High-Level Flow

```
User uploads file to #docs-channel
       ↓
Slack sends file_shared event
       ↓
[Socket Mode] → Bolt App receives event
       ↓
[events.ts] registerEventHandlers()
       ↓
File validation (PDF/DOCX check)
       ↓
Send acknowledgment: "📄 Processing..."
       ↓
Trigger async pipeline (parse → generate → MR)
       ↓
Post status updates to thread:
   "✨ Generating documentation..."
   "📤 Creating merge request..."
       ↓
Final: "✅ MR: https://gitlab.com/.../merge_requests/123"
```

## Socket Mode vs HTTP

| Feature | Socket Mode | HTTP Webhooks |
|---------|------------|---|
| **Setup** | Simpler (no ngrok/reverse proxy) | Requires public URL |
| **Local Dev** | Works immediately | Needs tunnel |
| **Firewall** | Outbound connection only | Inbound port required |
| **Reliability** | Good for dev/small apps | Better for production scale |

We use **Socket Mode** for development simplicity.

## Implementation Details

### 1. Bot Initialization

The `SlackClient` class wraps the Bolt SDK:

```typescript
import { App } from '@slack/bolt';
import { config } from '../config';

export class SlackClient {
  private app: App;

  constructor() {
    this.app = new App({
      token: config.slack.botToken,                 // xoxb-...
      signingSecret: config.slack.signingSecret,    // Sign webhook requests
      appToken: config.slack.appToken,              // xapp-... (Socket Mode)
      socketMode: true,                             // Enable Socket Mode
    });
  }
}
```

**Token Types:**
- `botToken` (xoxb-): OAuth token for bot actions (posting, reading files)
- `signingSecret`: Validates Slack requests (security)
- `appToken` (xapp-): Socket Mode connection token

### 2. Event Subscription Pattern

```typescript
// In events.ts
export function registerEventHandlers(app: App, slackClient: SlackClient) {
  // Listen for file uploads
  app.event('file_shared', async ({ event, client }) => {
    // event.file_id: The uploaded file ID
    // event.channel_id: Channel where uploaded
    // client: Slack API client
  });

  // Listen for @documentation mentions
  app.message(/^@documentation/, async ({ message, client, say }) => {
    // Regex-matched messages starting with @documentation
  });
}
```

**Event Flow:**
1. Slack detects event (file upload, mention, reaction, etc.)
2. Sends event to Socket Mode connection
3. Bolt app receives and matches to registered handler
4. Handler executes with context (event data, API client)

### 3. File Upload Event Handling

The `file_shared` event fires when a file is uploaded anywhere the bot can see:

```typescript
app.event('file_shared', async ({ event, client }) => {
  try {
    // Get file metadata
    const fileInfo = await slackClient.getFileInfo(event.file_id);
    const file = fileInfo.file as any;

    // Validate file type
    if (!['.pdf', '.docx'].some(ext => file.name.toLowerCase().endsWith(ext))) {
      await client.chat.postMessage({
        channel: event.channel_id,
        text: '⚠️ Only PDF and DOCX files supported.',
      });
      return;
    }

    // Acknowledge in channel
    const ackMsg = await client.chat.postMessage({
      channel: event.channel_id,
      text: `📄 Processing ${file.name}...`,
    });

    // Trigger background pipeline (don't await)
    processFileAsync(event.file_id, file, event.channel_id, ackMsg.ts);

  } catch (error) {
    console.error('File handler error:', error);
    await client.chat.postMessage({
      channel: event.channel_id,
      text: '❌ Error processing file.',
    });
  }
});
```

### 4. Thread-Based Communication

Slack threads keep conversations organized. We use them for job status:

```typescript
class SlackStatusUpdater {
  constructor(
    private client: any,
    private channelId: string,
    private threadTs: string,  // Message timestamp (unique thread ID)
  ) {}

  // Post status updates to thread
  async updateStatus(stage: string, emoji: string, message: string) {
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: this.threadTs,  // ← Posts to thread, not channel
      text: `${emoji} ${stage}\n${message}`,
    });
  }

  // Final success with MR link
  async success(mrUrl: string) {
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: this.threadTs,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Documentation Complete*\n\n🔗 <${mrUrl}|View Merge Request>`,
          },
        },
      ],
    });
  }
}
```

**Key Concept:** `thread_ts` (thread timestamp) is the unique ID for each thread. All replies to that thread use the same `thread_ts`.

### 5. API Methods

The Slack client provides these key methods:

```typescript
// Post a message
await client.chat.postMessage({
  channel: 'C1234567890',
  text: 'Hello',
});

// Get file metadata
const fileInfo = await client.files.info({ file: 'F1234567890' });

// Download file content
const response = await fetch(fileInfo.file.url_private, {
  headers: { Authorization: `Bearer ${botToken}` },
});
const buffer = await response.arrayBuffer();

// Update existing message
await client.chat.update({
  channel: 'C1234567890',
  ts: '1234567890.123456',
  text: 'Updated message',
});

// Add reaction
await client.reactions.add({
  channel: 'C1234567890',
  timestamp: '1234567890.123456',
  name: 'checkmark',
});
```

### 6. Async Processing Pattern

Don't block the event handler. Trigger async work and return immediately:

```typescript
async function processFileAsync(
  fileId: string,
  file: any,
  channelId: string,
  initialMsgTs: string,
) {
  const updater = new SlackStatusUpdater(client, channelId, initialMsgTs);

  try {
    // Stage 1: Parse
    updater.updateStatus('Parse', '📄', 'Extracting document...');
    const parsed = await parseDocument(fileId, file);

    // Stage 2: Generate
    updater.updateStatus('Generate', '✨', 'Creating documentation...');
    const docs = await generateDocumentation(parsed);

    // Stage 3: Create MR
    updater.updateStatus('Create MR', '📤', 'Opening merge request...');
    const mrUrl = await createMergeRequest(docs);

    // Success
    await updater.success(mrUrl);

  } catch (error) {
    await updater.error('Pipeline', error.message);
  }
}

// Trigger without awaiting
processFileAsync(fileId, file, channelId, msgTs).catch(console.error);
```

## Error Handling

### Auth Failures

```typescript
try {
  await app.start();
} catch (error) {
  if (error.code === 'SLACK_API_PLATFORM_ERROR') {
    console.error('Invalid token or signing secret');
    process.exit(1);
  }
}
```

### Rate Limiting

Slack limits: 1 message/channel/second, ~20 API calls/min per bot:

```typescript
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function postWithRetry(
  client: any,
  msg: any,
  maxRetries = 3,
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.chat.postMessage(msg);
    } catch (error) {
      if (error.code === 'rate_limited') {
        const waitMs = 1000 * Math.pow(2, i); // Exponential backoff
        console.log(`Rate limited. Waiting ${waitMs}ms...`);
        await delay(waitMs);
      } else {
        throw error;
      }
    }
  }
}
```

### Missing Permissions

The bot needs specific scopes to access files and post messages:

```
Required Scopes:
- files:read         → Access file metadata
- chat:write         → Post messages
- chat:write.public  → Post to public channels
- channels:read      → (optional) List channels
- users:read         → (optional) Get user info
```

If the bot can't read a file: "File not accessible by bot" → Add `files:read` scope and reinstall.

## Event Types We Use

| Event | Fired When | Handler |
|-------|-----------|---------|
| `file_shared` | File uploaded anywhere bot can see | Parse + generate doc |
| `app_mention` | Bot mentioned with @bot-name | Command handling |
| `message` | Message posted (with regex filter) | @documentation commands |
| `reaction_added` | Reaction on message | (future: approve/reject) |

## Development Tips

### Local Testing

```bash
# Start bot
npm run dev

# Upload file to Slack channel
# Check terminal for logs
# Check Slack thread for updates
```

### Socket Mode Logs

```bash
# Very verbose debug logging
DEBUG=@slack:* npm run dev
```

Look for:
- `Socket Mode client ready` - Connected
- `Handling incoming event` - Event received
- `Posting message` - API calls being made

### Testing Without Slack

Mock the Slack client for unit tests:

```typescript
const mockClient = {
  chat: {
    postMessage: jest.fn().mockResolvedValue({ ts: '1234567890.123456' }),
    update: jest.fn().mockResolvedValue({}),
  },
  files: {
    info: jest.fn().mockResolvedValue({
      file: { name: 'test.pdf', size: 1000 },
    }),
  },
};

// Pass to handler
registerEventHandlers(app, { getApp: () => ({ client: mockClient }) });
```

## Performance Considerations

**Thread Safety:**
- Bolt SDK is thread-safe for concurrent events
- Each file upload is independent
- MCP API calls may serialize (depends on VCS rate limits)

**Message Updates:**
- Use `chat.update` to edit existing messages vs posting new ones
- Reduces channel clutter
- All updates go to same thread

**File Download:**
- Files stored in `processed_docs/` directory
- Consider cleanup after processing (optional)
- Large files may timeout - Python parser handles chunking

## Next Steps

1. ✅ Understand Socket Mode and events (this doc)
2. ⏳ **SlackClient is implemented** in `src/slack/client.ts`
3. ⏳ **Event handlers registered** in `src/slack/events.ts`
4. ⏳ **Wire to async pipeline** in Task 4/5/6

## Resources

- [Slack Bolt for JavaScript](https://slack.dev/bolt-js/)
- [Event Types API](https://api.slack.com/events)
- [Socket Mode Guide](https://api.slack.com/socket-mode)
- [Slack API Best Practices](https://api.slack.com/best-practices)
- [Rate Limits](https://api.slack.com/rate-limits)
