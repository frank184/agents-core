# Slack Documentation Agent

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A524-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/)

Automated documentation generation tool that integrates with Slack, parses PDFs/DOCX files, generates professional documentation using Claude via Copilot SDK, and creates merge requests in GitLab or GitHub.

## Overview

This agent provides a zero-friction documentation workflow:
1. **Intake**: Upload a PDF or DOCX file to a designated Slack channel
2. **Parse**: Agent automatically parses and chunks the document
3. **Transform**: Pass to Copilot SDK with skills to convert to polished markdown documentation
4. **Create MR**: Use GitLab SDK (or GitHub SDK) to create merge request with the generated markdown
5. **Notify**: Post the MR link back to Slack thread

## Features

- 📄 **Multi-format parsing**: PDF and DOCX document support
- ✨ **AI-powered generation**: Uses Claude via Copilot SDK with skills for markdown conversion
- 🔗 **VCS integration**: Creates MRs in GitLab or GitHub via direct SDK integration
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
COPILOT_MODEL=claude-opus  # or claude-sonnet, gpt-4.1

# VCS Provider (optional - for automatic MR creation)
GIT_PROVIDER=gitlab  # or 'github'

# GitLab Configuration (if using GitLab for MR creation)
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=glpat-your-gitlab-token
GITLAB_PROJECT_ID=12345

# GitHub Configuration (if using GitHub for MR creation)
GITHUB_TOKEN=ghp_your-github-token
GITHUB_REPO=org/repo-name

# Document Processing
DOC_STORAGE_PATH=./processed_docs
```

**Note:** VCS configuration is optional. If provided, the agent can automatically create merge requests via GitLab/GitHub SDKs. Otherwise, it just generates markdown and posts to Slack for manual MR creation.

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

### TypeScript/Node.js Tests

The test suite covers stable components with full TypeScript type-checking:

```bash
# Run all tests (15 passing tests)
npm test

# Run tests in watch mode for development
npm run test:watch

# Check TypeScript compilation + test type-checking
npm run build
```

**Test Coverage:**
- ✅ `ClaudeClient` - Copilot SDK integration, streaming, error handling
- ✅ `GitLabClient` - API calls for branches, commits, merge requests
- ✅ `Slack Events` - File validation, message handling, status updates
- ✅ `Config` - Environment variable validation

**Test Organization:**
```
tests/
├── config.test.ts                          # Configuration validation
├── generation/
│   ├── claude-client.test.ts               # Claude/Copilot SDK tests
│   └── generator.test.ts                   # Prompt template tests
├── gitlab/
│   └── client.test.ts                      # GitLab REST API tests
├── pipeline/
│   └── processor.test.ts                   # End-to-end pipeline tests
└── slack/
    └── events.test.ts                      # Event handler tests
```

### Python Document Parser Tests

```bash
# Install pytest if not already installed
pip install pytest

# Run parser unit tests
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
   - "✨ Generating documentation..."
   - "✅ Documentation complete"

### Test Document Parser Standalone

You can test the Python parser independently:

```bash
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
5. Commit with conventional format: `git commit -m "feat: Your feature description"`
   - Pre-commit hooks will validate your message format
   - See the [Contributing](#contributing) section for commit message guidelines

### Adding New Features

Follow the implementation plan in `docs/plans/2026-03-06-slack-documentation-agent.md`

Current status:
- ✅ Task 1: Project Setup
- ✅ Task 2: Slack Bot Core
- ✅ Task 3: Document Parsing Pipeline
- ⏳ Task 4: Claude Generation via Copilot SDK with Skills (not yet implemented)
- ⏳ Task 5: End-to-End Pipeline (not yet implemented)
- ⏳ Task 6: Deployment (not yet implemented)

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

- **[Copilot Client Implementation Guide](./docs/COPILOT_CLIENT.md)** - Our approach to Claude generation with skills for markdown conversion
  - Aligns with [official Copilot SDK Getting Started](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md)
  - Shows architecture, authentication, prompt engineering, and streaming responses

## Next Steps

To complete the documentation agent:

1. **Implement Claude Generation with Skills** (Task 4)
   - Review [Copilot Client Implementation Guide](./docs/COPILOT_CLIENT.md)
   - Add Copilot SDK integration with skills for markdown conversion
   - Create prompt templates for different documentation types
   - Implement streaming responses for real-time Slack updates
   - Test markdown generation with uploaded files

2. **Connect End-to-End Pipeline** (Task 5)
   - Wire document parsing → Copilot SDK (with skills) → GitLab SDK for MR creation
   - Add comprehensive error handling
   - Add async job processing with Slack thread updates
   - Test full workflow: PDF upload → markdown generation → MR created → link posted to Slack

3. **Deploy** (Task 6)
   - Dockerize the application
   - Set up GitHub Actions CI/CD
   - Deploy to production environment

See the implementation plan for detailed steps: [Implementation Plan](docs/plans/2026-03-06-slack-documentation-agent.md)

## Design Documentation

For architectural details and implementation guides, see:

**Developer Guides (Implementation):**
- [Slack Integration Guide](./docs/SLACK_INTEGRATION.md) - Event handling, threading, real-time updates
- [Document Parser Guide](./docs/DOCUMENT_PARSER.md) - PDF/DOCX extraction and semantic chunking
- [Copilot Client Implementation](./docs/COPILOT_CLIENT.md) - Claude-powered markdown generation

**Architecture Docs (Design):**
- [Document Processing Pipeline](./docs/plans/2026-03-06-document-pipeline-design.md) - Chunking, parsing, and preparation for Claude
- [Slack Lifecycle Design](./docs/plans/2026-03-06-slack-lifecycle-design.md) - Event flow and status updates
- [Claude Integration Patterns](./docs/plans/2026-03-06-claude-patterns-design.md) - Prompt engineering and streaming

## Contributing

### Commit Message Format

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) using commitlint and Husky pre-commit hooks.

**Format:** `<type>: <Subject starting with capital letter>`

**Allowed types:**
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring without behavior change
- `chore:` - Build tasks, dependency updates, tooling
- `style:` - Code formatting, missing semicolons (no logic change)
- `perf:` - Performance improvements
- `ci:` - CI/CD configuration changes

**Examples:**
```bash
git commit -m "feat: Add PDF chunking with sentence boundaries"
git commit -m "fix: Resolve Slack thread race condition"
git commit -m "docs: Update installation instructions for Python 3.9+"
git commit -m "chore: Upgrade @slack/bolt to v3.16.0"
```

**Invalid examples (will be rejected):**
```bash
git commit -m "add feature"           # ❌ No type
git commit -m "feat: add feature"     # ❌ Subject must be sentence-case
git commit -m "updated readme"        # ❌ No type
```

### Pre-commit Hooks

This project uses Husky to enforce commit message standards. The hooks are configured at the workspace root (monorepo structure).

**First-time setup:**
```bash
# Install dependencies (this runs the prepare script)
npm install --ignore-scripts

# The prepare script configures git hooks automatically
# Alternatively, run manually from workspace root:
cd /home/dev/dev/agents-core
git config core.hooksPath .husky
```

**Monorepo Note:** Since `slack-agent/` is a subdirectory of the `agents-core` git repository, Husky hooks are configured at the workspace root (`.husky/commit-msg`). The hook automatically runs commitlint from the slack-agent directory.

**Troubleshooting:**

If commits are not being validated:
```bash
# Check git hooks path
git config --get core.hooksPath
# Should output: .husky

# Verify hook exists and is executable
ls -la /home/dev/dev/agents-core/.husky/commit-msg
# Should show: -rwxr-xr-x (executable)

# Test commitlint manually
cd slack-agent
echo "test message" | npx commitlint
```

### Releases and Versioning

This project uses [standard-version](https://github.com/conventional-changelog/standard-version) for automated versioning and CHANGELOG generation based on conventional commits.

**Creating a release:**
```bash
# Automatically bump version and generate CHANGELOG
npm run release              # Auto-detect version bump (patch/minor/major)
npm run release:patch        # Force patch version (0.0.X)
npm run release:minor        # Force minor version (0.X.0)
npm run release:major        # Force major version (X.0.0)

# Preview without making changes
npm run release:dry
```

**What happens during release:**
1. Bumps version in `package.json` based on commit types
2. Generates/updates `CHANGELOG.md` from conventional commits
3. Creates a git commit with release changes
4. Creates a git tag (e.g., `v1.2.0`)

**After release:**
```bash
# Push release commit and tag
git push --follow-tags origin feat/your-branch

# Or push tag separately
git push origin v1.2.0
```

The GitHub Actions workflow (`.github/workflows/release.yml`) will automatically create a GitHub release when you push a version tag.

## License

MIT
