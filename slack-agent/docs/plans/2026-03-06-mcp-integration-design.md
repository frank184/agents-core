# MCP Integration Design (DEPRECATED)

> **Note**: This design document is deprecated. The agent has been simplified to focus on document transformation only, without MCP integration or autonomous VCS operations.

## Why Removed

The original plan included MCP (Model Context Protocol) integration for GitLab/GitHub to enable the agent to autonomously create branches, commit files, and open merge requests.

**We decided to simplify:**
- Agent focuses on **transformation** (PDF → markdown), not **agency** (autonomous commits)
- MCP integration adds complexity without clear value for this use case
- Human review and manual MR creation is preferred for documentation quality control

## Current Workflow (No MCP)

```
PDF/DOCX upload → Parse → Claude generates markdown → Upload to Slack
                                                              ↓
                                                    Human reviews and creates MR
```

## Historical Context

```
Agent (TypeScript)
    ↓
MCP Client Layer (mcp-client.ts base class)
    ├─→ GitLab MCP Implementation (gitlab.ts)
    └─→ GitHub MCP Implementation (github.ts)
        ↓
    MCP Protocol (stdio/http transport)
        ↓
    External MCP Servers
    ├─→ gitlab-mcp-server (or native API)
    └─→ github-mcp-server (or native API)
        ↓
    VCS APIs (GitLab.com / GitHub.com)
```

## VCS Operations Abstraction

### Core Operations (MCP Tools)

#### 1. Branch Management
```typescript
interface BranchOperation {
  type: 'create' | 'delete' | 'get';
  name: string;
  source?: string; // for create, which branch to base from
}

// MCP Tool: vcs/branch
mcp.createTool('vcs/branch', {
  params: { operation: BranchOperation },
  handler: (op) => vcs.manageBranch(op)
})
```

**Usage:**
```typescript
// Create docs branch
await mcp.invoke('vcs/branch', {
  type: 'create',
  name: 'docs/auto-2026-03-06-project',
  source: 'main'
});
```

#### 2. File Operations
```typescript
interface FileOperation {
  type: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  message: string; // commit message
  branch: string;
}

// MCP Tool: vcs/file
mcp.createTool('vcs/file', {
  params: { operation: FileOperation },
  handler: (op) => vcs.manageFile(op)
})
```

**Usage:**
```typescript
// Create documentation file
await mcp.invoke('vcs/file', {
  type: 'create',
  path: 'docs/auto-generated-api.md',
  content: generatedDocumentation,
  message: 'docs: auto-generated API documentation',
  branch: 'docs/auto-2026-03-06-project'
});
```

#### 3. Merge Request / Pull Request
```typescript
interface MROperation {
  type: 'create' | 'update' | 'merge' | 'close' | 'comment';
  sourceBranch: string;
  targetBranch?: string; // for create
  title?: string;
  description?: string;
  mrId?: string; // for update/merge/close/comment
  comment?: string;
  labels?: string[];
}

// MCP Tool: vcs/mr
mcp.createTool('vcs/mr', {
  params: { operation: MROperation },
  handler: (op) => vcs.manageMR(op)
})
```

**Usage:**
```typescript
// Create MR
const mr = await mcp.invoke('vcs/mr', {
  type: 'create',
  sourceBranch: 'docs/auto-2026-03-06-project',
  targetBranch: 'main',
  title: 'docs: Project API documentation',
  description: 'Auto-generated documentation from parsed artifacts',
  labels: ['documentation', 'auto-generated', 'no-review-needed']
});

// Comment on MR with status
await mcp.invoke('vcs/mr', {
  type: 'comment',
  mrId: mr.id,
  comment: '✅ Documentation automatically generated and validated'
});
```

## Provider-Specific Implementations

### GitLab MCP

**Transport:** HTTP to `gitlab.com/api/v4` or self-hosted

**Key Endpoints:**
- `POST /projects/:id/repository/branches`
- `POST /projects/:id/repository/files/...`
- `POST /projects/:id/merge_requests`
- `PUT /projects/:id/merge_requests/:mr_iid/merge`
- `POST /projects/:id/merge_requests/:mr_iid/notes`

**Rate Limits:** 600 req/min (consider caching branch checks)

**Authentication:** `PRIVATE-TOKEN` header

### GitHub MCP

**Transport:** HTTP REST API to `api.github.com`

**Key Endpoints:**
- `POST /repos/:owner/:repo/git/refs`
- `PUT /repos/:owner/:repo/contents/:path` (for file operations)
- `POST /repos/:owner/:repo/pulls`
- `PUT /repos/:owner/:repo/pulls/:pr_number/merge`
- `POST /repos/:owner/:repo/issues/:pr_number/comments`

**Rate Limits:** 5000 req/hour (more generous)

**Authentication:** `Authorization: token` header

## Error Handling Strategy

```typescript
enum MCPErrorType {
  BRANCH_EXISTS = 'branch_exists',
  FILE_NOT_FOUND = 'file_not_found',
  MR_CONFLICT = 'mr_conflict',
  RATE_LIMITED = 'rate_limited',
  UNAUTHORIZED = 'unauthorized',
  NETWORK_ERROR = 'network_error',
}

// Slack notification on MCP failure
try {
  await mcp.invoke('vcs/mr', createRequest);
} catch (error) {
  if (error.type === MCPErrorType.RATE_LIMITED) {
    await slackClient.sendThreadReply(
      channelId,
      threadTs,
      `⏱️ Rate limited by VCS. Retrying in 60s...`
    );
    // Exponential backoff
  }
}
```

## Extensibility

Future agents can reuse these MCP tools:
- Documentation review agent
- Code quality agent
- Release management automation
- Cross-repo sync tools

## Configuration

```env
# Provider selection
GIT_PROVIDER=gitlab # or 'github'

# GitLab
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=glpat-xxxxx
GITLAB_PROJECT_ID=12345
GITLAB_NAMESPACE=org # for file paths

# GitHub
GITHUB_TOKEN=ghp_xxxxx
GITHUB_REPO=org/repo-name
GITHUB_BRANCH_PREFIX=docs # for branch naming
```

## Implementation Notes

1. **Branch naming strategy**: `docs/{feature}/{timestamp}` to avoid collisions
2. **File paths**: Consistent across providers (normalize to Unix paths)
3. **Commit messages**: Follow conventional commits for parsing downstream
4. **MR descriptions**: Include source metadata (uploaded file name, generation timestamp)
5. **Labels/Tags**: Automatic tagging for discoverability and automation rules
