# Slack Documentation Agent

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

If you don't have a Slack app yet:

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it "Documentation Agent" and select your workspace
4. Navigate to **OAuth & Permissions**:
   - Add Bot Token Scopes:
     - `files:read` - Access uploaded file metadata
     - `chat:write` - Post messages to channels
     - `chat:write.public` - Post to public channels
   - Install to workspace and copy **Bot User OAuth Token** (starts with `xoxb-`)
5. Navigate to **Basic Information**:
   - Copy **Signing Secret**
6. Navigate to **Socket Mode**:
   - Enable Socket Mode
   - Generate an **App-Level Token** with `connections:write` scope (starts with `xapp-`)
7. Navigate to **Event Subscriptions**:
   - Enable Events
   - Subscribe to bot events: `file_shared`

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

## Next Steps

To complete the full documentation pipeline:

1. **Implement Claude Generation** (Task 4)
   - Add Copilot SDK integration
   - Create prompt engineering templates
   - Test documentation generation

2. **Implement MCP Integration** (Task 5)
   - Add MCP client for GitLab/GitHub
   - Test branch creation and MR workflows

3. **Connect End-to-End Pipeline** (Task 6)
   - Wire document parsing → Claude → MCP
   - Add comprehensive error handling
   - Test full workflow

See the implementation plan for detailed steps: `docs/plans/2026-03-06-slack-documentation-agent.md`

## Design Documentation

For architectural details, see:
- [MCP Integration Strategy](../docs/plans/2026-03-06-mcp-integration-design.md)
- [Document Processing Pipeline](../docs/plans/2026-03-06-document-pipeline-design.md)
- [Slack Lifecycle Design](../docs/plans/2026-03-06-slack-lifecycle-design.md)
- [Claude Integration Patterns](../docs/plans/2026-03-06-claude-patterns-design.md)

## Contributing

Follow these commit message conventions:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring

## License

MIT
