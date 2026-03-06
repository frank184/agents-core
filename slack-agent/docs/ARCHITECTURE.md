# Architecture

## System Overview

The Slack Documentation Agent is an event-driven bot that automates documentation generation from uploaded files. It integrates Slack for user interaction, Python for document parsing, Claude via Copilot SDK for AI-powered generation, and GitLab/GitHub for version control integration.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Slack Channel                                 │
│                                                                       │
│                  User uploads PDF/DOCX file                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
                    file_shared event (Socket Mode)
                               │
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    Slack Bot (Node.js/TypeScript)                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ • Receives file_shared events via Socket Mode               │   │
│  │ • Validates file type (PDF, DOCX, TXT)                      │   │
│  │ • Downloads file to temporary storage                       │   │
│  │ • Posts status updates to Slack thread                      │   │
│  │ • Orchestrates pipeline components                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┬─────────────────┐
        ↓                     ↓                 ↓
   ┌─────────┐          ┌──────────┐      ┌─────────┐
   │ Download│          │ Validator│      │ Parser  │
   │  File   │          │          │      │(Python) │
   └─────────┘          └──────────┘      └─────────┘
        │                    │                 │
        └────────────────────┼─────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────────────┐
│               Document Processing Pipeline                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ DocumentationProcessor (src/pipeline/processor.ts)            │   │
│  │ • Orchestrates end-to-end workflow                           │   │
│  │ • Error handling with user-friendly messages                 │   │
│  │ • Streams progress updates every 2 seconds                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┬──────────────┐
        ↓                     ↓              ↓
   ┌──────────┐          ┌─────────┐   ┌─────────┐
   │  Parse   │          │Generate │   │  Format │
   │ Document │          │  Markdown   │  Output │
   └──────────┘          └─────────┘   └─────────┘
        │                     │              │
        ↓                     ↓              ↓
   ┌──────────┐          ┌─────────────┐ ┌────────┐
   │  Python  │          │ Copilot SDK │ │ Save   │
   │ PDF/DOCX │          │  (Claude)   │ │ to MR  │
   │  Parser  │          │             │ └────────┘
   └──────────┘          └─────────────┘
                               │
                               ↓
                    ┌──────────────────┐
                    │   Generate      │
                    │  Markdown Doc   │
                    └──────────────────┘
                               │
                               ↓
                    ┌──────────────────┐
                    │   Create MR/PR   │
                    │  (GitLab/GitHub) │
                    └──────────────────┘
                               │
                               ↓
                    ┌──────────────────┐
                    │ Slack Response   │
                    │ (with MR link)   │
                    └──────────────────┘
```

## Component Architecture

### 1. Slack Module (`src/slack/`)

**File: `client.ts`**
- Initializes Slack Bolt app with Socket Mode
- Implements low-level Slack API calls
- Handles message/file uploads

**File: `events.ts`**
- Registers event handlers for `file_shared` events
- Message commands: `status`, `help`
- File type validation

### 2. Document Parser (`src/document-parser/`)

**Language:** Python 3.9+

**File: `parser.py`**
- Extracts text from PDF (PyPDF2) and DOCX (python-docx)
- Chunks text with configurable overlap (2000 chars, 200 char overlap)
- Returns JSON with metadata

**File: `main.py`**
- Entry point spawned by Node.js child_process
- Takes file path as argument
- Outputs JSON to stdout

### 3. Generation Module (`src/generation/`)

**File: `claude-client.ts`**
- Wraps Copilot SDK HTTP API
- Handles streaming responses
- Error handling with retry logic

**File: `prompts.ts`**
- System prompts for:
  - Document summarization
  - Enhancement for existing docs
  - Code documentation
  - Release notes generation

**File: `generator.ts`**
- High-level interface for documentation generation
- Configuration-driven generation

### 4. VCS Integration Module (`src/vcs/`)

**GitLab Implementation (`gitlab.ts`)**
- Create branches from main/master
- Commit files via GitLab REST API v4
- Create merge requests
- List/check MR status

**GitHub Implementation (`github.ts`)**
- Create branches
- Create pull requests
- List/check PR status
- Comment on PRs

**Manager (`mr-manager.ts`)**
- Provider-agnostic interface
- Handles both GitLab and GitHub
- Auto-formats MR URLs

### 5. Pipeline Orchestrator (`src/pipeline/`)

**File: `processor.ts`**
- Coordinates all components
- Manages job state
- Handles async/streaming operations
- Error recovery

## Data Flow

```
User Action              Component              State              Output
─────────────────────────────────────────────────────────────────────────

Upload file      →  Slack event handler   →  pending         → Slack: "Processing..."
                 →  Download file         →  downloading     → (update Slack)

Parse document   →  Python parser        →  parsing         → Slack: "Parsing..."
                 →  Get text chunks      →  parsed          → (progress update)

Generate docs    →  claude-client        →  generating      → Slack: "Generating..."
                 →  Stream chunks        →  streaming       → (live updates)

Create MR        →  GitLab/GitHub SDK    →  committing      → Slack: "Creating MR..."
                 →  Push branch          →  complete        → Final: "✅ [MR Link]"

Error flow       →  Catch exception      →  failed          → Slack: "❌ Error: [msg]"
```

## Technology Stack

### Runtime
- **Node.js** 18+ (TypeScript compiled to ES2020)
- **Python** 3.9+ (for document parsing)

### Key Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| @slack/bolt | Slack bot framework | ^3.x |
| typescript | TypeScript compiler | ^5.x |
| axios | HTTP client for Copilot/Git APIs | ^1.x |
| PyPDF2 | PDF extraction | 3.x |
| python-docx | DOCX extraction | 0.8.x |
| pydantic | Python data validation | ^2.x |

### Testing
- **node:test** - Native Node.js test framework
- **mock.fn()** - Built-in mocking utilities
- **tsx** - TypeScript execution with watch mode

## Deployment Architectures

### Local Development

```bash
npm run dev
```

- Socket Mode connects directly to Slack
- No exposed HTTP ports
- Runs in foreground with hot reload

### Docker Deployment

```bash
docker-compose up -d
```

**Multi-stage build:**
1. Builder stage: Node & Python deps, TypeScript compilation
2. Runtime stage: Minimal Node + Python runtime
3. Layers optimized for image size and layer caching

**Volumes:**
- `processed_docs/` - Shared storage for generated markdown
- `logs/` - Application logs for debugging

**Environment:**
- Variables loaded from `.env` file
- `NODE_ENV=production` for optimizations

### High-Availability Deployment (Future)

```docker-compose
services:
  slack-bot:
    # Primary instance with health checks
    deploy:
      replicas: 1  # Can be increased for redundancy
      restart_policy:
        condition: on-failure

  nginx:
    # Optional reverse proxy for metrics/monitoring
    # Can expose Prometheus metrics endpoint
```

## Security Considerations

### API Credentials
- All tokens stored in `.env` (git-ignored)
- Never logged or included in responses
- Rotated regularly via CI/CD secrets

### Data Handling
- Temporary files cleaned up after processing
- No sensitive data stored in processed docs
- File validation before processing (type/size checks)

### Network
- Socket Mode: Direct Slack connection (no public listener)
- No HTTP ports exposed (unless proxy added)
- HTTPS/TLS for all external API calls

### Access Control
- File processing restricted to authenticated Slack workspace members
- Optional: Add channel-level permissions
- Future: Add role-based access via Slack admins

## Scalability Patterns

### Current Design
- Single bot instance
- Asynchronous job processing
- Streaming for long operations

### Scaling Opportunities

**1. Job Queue (Redis)**
```
Multiple bot instances → Redis Queue → Shared job processing
```

**2. Parser Workers**
```
Central bot → Python worker pool (scaled separately)
```

**3. Caching**
```
Processed documents cached by hash
Common prompts cached for common file types
```

**4. Rate Limiting**
- Implement per-user/channel rate limits
- Queue documents during high load
- Show queue position to users

### Metrics to Monitor
- File processing latency (parse + generate time)
- Claude API token usage
- Git API call success rates
- Slack message delivery success
- Queue depth (if implemented)

## Error Handling Strategy

| Error Type | Recovery | User Message |
|-----------|----------|--------------|
| Unsupported file type | Reject early | ⚠️ File type not supported (PDF/DOCX only) |
| Parser failure | Log & retry once | ❌ Failed to parse document |
| Empty extraction | Reject | ❌ No content extracted |
| Claude rate limit | Queue & retry | ⏳ Busy, retrying in 30s... |
| Git API failure | Show detailed error | ❌ Failed to create MR: [reason] |
| Network timeout | Retry with backoff | ⏳ Connection timeout, retrying... |

## Monitoring & Logging

### Log Levels
- `error` - API failures, exceptions
- `warn` - Rate limits, retries
- `info` - Processing stages, MR creation
- `debug` - Request/response details

### Key Metrics
```typescript
// Logged for each job:
{
  jobId: string;
  fileName: string;
  startTime: Date;
  parseTime: number;   // seconds
  generateTime: number; // seconds
  totalTime: number;
  status: 'success' | 'failed';
  error?: string;
  mrUrl?: string;
}
```

## Future Enhancements

1. **Multi-language support** - Translate generated docs
2. **Style preferences** - Users choose doc format/tone
3. **Template library** - Reusable doc templates
4. **Review workflow** - Mandatory human review before MR
5. **Analytics dashboard** - Usage stats, trends
6. **Custom skills** - Extend Claude prompts per project
