# Slack Documentation Agent

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A524-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/)

Automated documentation generation tool that integrates with Slack, parses PDFs/DOCX files, generates professional documentation using Claude via Copilot SDK, and creates merge requests in GitLab or GitHub.

## Overview

This agent provides a zero-friction documentation workflow:
1. Upload a PDF or DOCX file to a designated Slack channel
2. Agent automatically parses and chunks the document
3. Claude generates polished documentation
4. Creates a merge request in your VCS (GitLab/GitHub)
5. Posts the MR link back to Slack thread

## Features

- 📄 **Multi-format parsing**: PDF and DOCX document support
- ✨ **AI-powered generation**: Uses Claude via Copilot SDK for documentation
- 🔗 **VCS integration**: Creates MRs in GitLab or GitHub via MCP
- 💬 **Slack integration**: Full Slack workflow with status updates
- 🚀 **Async processing**: Non-blocking pipeline with thread updates

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ and npm
- **Python** 3.9+ and pip
- **Slack App** with appropriate permissions
- **Copilot SDK API Key** (enterprise license)
- **GitLab** or **GitHub** personal access token
- Git installed

## Installation

### 1. Clone and Navigate

```bash
cd slack-agent
```

### 2. Install Node.js Dependencies

```bash
npm install
```

Expected output: ~503 packages installed

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or with a virtual environment (recommended):

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

This installs:
- `PyPDF2` - PDF parsing
- `python-docx` - DOCX parsing
- `pydantic` - Data validation

## Configuration

### 1. Create Environment File

Copy the example configuration:

```bash
cp .env.example .env
```

### 2. Configure Slack App

#### Create the App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Enter app name: "Documentation Agent"
4. Select your Slack workspace
5. Click **Create App**

#### Add Bot Permissions (OAuth & Permissions)

1. In the left sidebar, click **OAuth & Permissions** (under "Features")
2. Scroll to **Scopes** section
3. Under **Bot Token Scopes**, click **Add an OAuth Scope** and add:
   - `files:read` - Access uploaded file metadata
   - `chat:write` - Post messages to channels

#### Install App to Workspace

1. Scroll to the top of the **OAuth & Permissions** page
2. Look for the **Install to Workspace** button (green button at the top)
3. Click **Install to Workspace**
4. Review permissions and click **Allow**
5. After installation, you'll see **Bot User OAuth Token** on this same page
6. **Copy this token** (starts with `xoxb-`) and save it as `SLACK_BOT_TOKEN` in your `.env` file

#### Get Signing Secret

1. In the left sidebar, click **Basic Information** (under "Settings")
2. Scroll down to **App Credentials** section
3. **Copy the Signing Secret** and save it as `SLACK_SIGNING_SECRET` in your `.env` file

#### Enable Socket Mode

1. In the left sidebar, click **Socket Mode** (under "Settings")
2. Click the toggle to **enable Socket Mode**
3. In the dialog, click **Generate an app-level token**
4. Enter a name (e.g., "socket-token") and select scope: `connections:write`
5. Click **Generate**
6. **Copy this token** (starts with `xapp-`) and save it as `SLACK_APP_TOKEN` in your `.env` file

#### Subscribe to File Upload Events

1. In the left sidebar, click **Event Subscriptions** (under "Features")
2. Toggle **Enable Events** to **On**
3. Under **Subscribe to bot events**, click **Add Bot User Event**
4. Select `file_shared` from the list
5. Click **Save Changes**

### 3. Update .env File

Edit `.env` with your credentials:

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-actual-token
SLACK_SIGNING_SECRET=your-actual-signing-secret
SLACK_APP_TOKEN=xapp-your-actual-app-token
SLACK_CHANNEL_ID=C1234567890  # Optional: specific channel ID

# Copilot SDK (Enterprise Claude)
COPILOT_API_KEY=your-copilot-api-key
COPILOT_MODEL=claude-opus  # or claude-sonnet

# Choose your VCS provider: 'gitlab' or 'github'
GIT_PROVIDER=gitlab

# GitLab Configuration (if using GitLab)
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=glpat-your-gitlab-token
GITLAB_PROJECT_ID=12345

# GitHub Configuration (if using GitHub)
GITHUB_TOKEN=ghp_your-github-token
GITHUB_REPO=org/repo-name

# Document Processing
DOC_STORAGE_PATH=./processed_docs
```

### 4. Create Storage Directory

```bash
mkdir -p processed_docs
```

## Running the App

### Development Mode (with auto-reload)

```bash
npm run dev
```

Expected output:
```
⚡️ Slack Documentation Agent Started
```

The bot is now listening for file uploads in Slack!

### Production Mode

Build and run:

```bash
npm run build
npm start
```

## Testing

### Run TypeScript Compilation Check

```bash
npm run build
```

Should complete without errors.

### Run Python Unit Tests

```bash
# Install pytest if not already installed
pip install pytest

# Run tests
pytest tests/test_parser.py -v
```

Expected output:
```
tests/test_parser.py::test_chunk_text_basic PASSED
tests/test_parser.py::test_chunk_text_respects_size PASSED
tests/test_parser.py::test_serialize_parsed_doc PASSED
```

### Manual Integration Test

1. Start the bot: `npm run dev`
2. Upload a PDF or DOCX file to any Slack channel where the bot is invited
3. Check the Slack thread for status updates:
   - "📄 Processing filename.pdf..."
   - (Future updates as more features are implemented)

### Test Document Parser Standalone

You can test the Python parser independently:

```bash
# Create a test document
echo "This is a test document for parsing." > test.txt

# Note: Parser expects .pdf or .docx, so this will error as expected
python -m src.document_parser.main test.txt

# For actual testing, upload a real PDF/DOCX
python -m src.document_parser.main path/to/your/document.pdf
```

Expected output: JSON with parsed chunks

## Project Structure

```
slack-agent/
├── src/
│   ├── index.ts              # Main application entry point
│   ├── config.ts             # Environment configuration
│   ├── slack/
│   │   ├── client.ts         # Slack API wrapper
│   │   └── events.ts         # Event handlers
│   └── document-parser/
│       ├── types.py          # Python data types
│       ├── parser.py         # PDF/DOCX parsing logic
│       └── main.py           # CLI interface
├── tests/
│   └── test_parser.py        # Python unit tests
├── dist/                     # Compiled TypeScript output
├── processed_docs/           # Uploaded file storage
├── package.json              # Node.js dependencies
├── tsconfig.json             # TypeScript configuration
├── requirements.txt          # Python dependencies
├── .env.example              # Environment template
└── README.md                 # This file
```

## Development Workflow

### Making Changes

1. Make your code changes
2. Build TypeScript: `npm run build`
3. Check for errors: `npm run build` (should show no errors)
4. Test locally: `npm run dev`
5. Commit: `git add . && git commit -m "your message"`

### Adding New Features

Follow the implementation plan in `docs/plans/2026-03-06-slack-documentation-agent.md`

Current status:
- ✅ Task 1: Project Setup
- ✅ Task 2: Slack Bot Core
- ✅ Task 3: Document Parsing Pipeline
- ⏳ Task 4: Claude Generation (not yet implemented)
- ⏳ Task 5: MCP Integration (not yet implemented)
- ⏳ Task 6: End-to-End Pipeline (not yet implemented)

## Troubleshooting

### "Configuration errors: SLACK_BOT_TOKEN not set"

**Solution**: Check that your `.env` file exists and contains valid tokens. The bot validates configuration on startup.

### "Import 'PyPDF2' could not be resolved"

**Solution**: Install Python dependencies:
```bash
pip install -r requirements.txt
```

### "Cannot connect to Slack"

**Solutions**:
1. Verify Socket Mode is enabled in Slack app settings
2. Check that `SLACK_APP_TOKEN` starts with `xapp-`
3. Ensure the app is installed in your workspace
4. Verify network connectivity

### "No response when uploading files"

**Solutions**:
1. Ensure the bot is invited to the channel (`/invite @Documentation Agent`)
2. Check bot is running (`npm run dev` shows "Slack Documentation Agent Started")
3. Verify `file_shared` event is subscribed in Slack app settings
4. Check console logs for errors

### "TypeScript compilation errors"

**Solution**: Run `npm install` to ensure all dependencies are installed, then `npm run build`

### "Python script cannot find modules"

**Solution**: Ensure you're running from the `slack-agent/` directory, or adjust Python path

## Developer Documentation

Start here to understand how each component works:

**Core Component Guides:**
- **[Slack Integration Guide](./docs/SLACK_INTEGRATION.md)** - How the bot receives files, manages threads, and posts status updates
  - Socket Mode setup, event handling patterns, thread-based communication
  - Rate limiting, error handling, async processing strategy

- **[Document Parser Guide](./docs/DOCUMENT_PARSER.md)** - How we extract text from PDFs/DOCX and chunk semantically
  - PDF and DOCX extraction, sentence-boundary chunking, metadata enrichment
  - Performance characteristics and optimization tips

- **[Copilot Client Implementation Guide](./docs/COPILOT_CLIENT.md)** - Our approach to Claude generation, tool definitions, and streaming
  - Aligns with [official Copilot SDK Getting Started](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
  - Shows architecture, authentication, event handling, and MCP integration

## Next Steps

To complete the full documentation pipeline:

1. **Implement Claude Generation** (Task 4)
   - Review [Copilot Client Implementation Guide](./docs/COPILOT_CLIENT.md)
   - Add Copilot SDK integration with streaming
   - Define custom tools for branch/file/MR operations
   - Test documentation generation with prompts

2. **Implement MCP Integration** (Task 5)
   - Add MCP clients for GitLab/GitHub
   - Test branch creation and MR workflows
   - Implement tool handlers for Copilot to invoke

3. **Connect End-to-End Pipeline** (Task 6)
   - Wire document parsing → Claude → MCP
   - Add comprehensive error handling
   - Add async job processing with Slack thread updates
   - Test full workflow end-to-end

See the implementation plan for detailed steps: [Implementation Plan](../docs/plans/2026-03-06-slack-documentation-agent.md)

## Design Documentation

For architectural details and implementation guides, see:

**Developer Guides (Implementation):**
- [Slack Integration Guide](./docs/SLACK_INTEGRATION.md) - Event handling, threading, real-time updates
- [Document Parser Guide](./docs/DOCUMENT_PARSER.md) - PDF/DOCX extraction and semantic chunking
- [Copilot Client Implementation](./docs/COPILOT_CLIENT.md) - Claude generation and custom tools

**Architecture Docs (Design):**
- [MCP Integration Strategy](../docs/plans/2026-03-06-mcp-integration-design.md) - GitLab/GitHub API via Model Context Protocol
- [Document Processing Pipeline](../docs/plans/2026-03-06-document-pipeline-design.md) - Chunking, parsing, and preparation for Claude
- [Slack Lifecycle Design](../docs/plans/2026-03-06-slack-lifecycle-design.md) - Event flow and status updates
- [Claude Integration Patterns](../docs/plans/2026-03-06-claude-patterns-design.md) - Prompt engineering and token optimization

## Contributing

Follow these commit message conventions:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring

## License

MIT
