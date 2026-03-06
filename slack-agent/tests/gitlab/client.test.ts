import assert from "node:assert";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import { GitLabClient } from "../../src/gitlab/client";

describe("GitLabClient", () => {
  let client: GitLabClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Mock environment variables
    process.env.GITLAB_URL = "https://gitlab.example.com";
    process.env.GITLAB_TOKEN = "test-token-123";
    process.env.GITLAB_PROJECT_ID = "42";

    client = new GitLabClient();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GITLAB_URL;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_PROJECT_ID;
  });

  describe.skip("createBranch", () => {
    it.skip("should create a branch with correct API call", async () => {
      global.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ name: "test-branch" }),
      })) as unknown as typeof fetch;

      await client.createBranch("test-branch", "main");

      assert.strictEqual((global.fetch as any).mock.calls.length, 1);
      const [url, options] = (global.fetch as any).mock.calls[0].arguments;

      assert.ok(
        (url as string).includes("/api/v4/projects/42/repository/branches"),
      );
      assert.strictEqual(
        (options as RequestInit).method,
        "POST",
      );
      assert.strictEqual(
        ((options as RequestInit).headers as any)?.["PRIVATE-TOKEN"],
        "test-token-123",
      );

      const body = JSON.parse((options as RequestInit).body as string);
      assert.strictEqual(body.branch, "test-branch");
      assert.strictEqual(body.ref, "main");
    });

    it("should throw error on failure", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        text: async () => "Branch already exists",
      }));
      global.fetch = mockFetch as unknown as typeof fetch;

      await assert.rejects(
        async () => await client.createBranch("test-branch"),
        /Failed to create branch/,
      );
    });
  });

  describe("commitFile", () => {
    it("should create a new file when it doesn't exist", async () => {
      const mockFetch = mock.fn(async (url: string, options?: RequestInit) => {
        // First call is GET to check if file exists
        if (!options || options.method === undefined) {
          return { ok: false }; // File doesn't exist
        }
        // Second call is POST to create file
        return {
          ok: true,
          json: async () => ({ file_path: "docs/test.md" }),
        };
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await client.commitFile(
        "test-branch",
        "docs/test.md",
        "# Test Doc",
        "Add test doc",
      );

      assert.strictEqual(mockFetch.mock.calls.length, 2);
      const [, createOptions] = mockFetch.mock.calls[1].arguments as [string, RequestInit];
      assert.strictEqual((createOptions as RequestInit)?.method, "POST");

      const body = JSON.parse((createOptions as RequestInit).body as string);
      assert.strictEqual(body.branch, "test-branch");
      assert.strictEqual(body.content, "# Test Doc");
      assert.strictEqual(body.commit_message, "Add test doc");
    });

    it("should update an existing file", async () => {
      const mockFetch = mock.fn(async (url: string, options?: RequestInit) => {
        // First call is GET - file exists
        if (!options || options.method === undefined) {
          return { ok: true };
        }
        // Second call is PUT to update
        return {
          ok: true,
          json: async () => ({ file_path: "docs/test.md" }),
        };
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await client.commitFile(
        "test-branch",
        "docs/test.md",
        "# Updated Doc",
        "Update test doc",
      );

      const [, updateOptions] = mockFetch.mock.calls[1].arguments as [string, RequestInit];
      assert.strictEqual((updateOptions as RequestInit)?.method, "PUT");
    });
  });

  describe("createMergeRequest", () => {
    it("should create MR with correct parameters", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          iid: 123,
          web_url: "https://gitlab.example.com/project/-/merge_requests/123",
          title: "Test MR",
        }),
      }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await client.createMergeRequest(
        "feature-branch",
        "main",
        "Test MR",
        "Test description",
      );

      assert.strictEqual(result.iid, 123);
      assert.strictEqual(
        result.url,
        "https://gitlab.example.com/project/-/merge_requests/123",
      );
      assert.strictEqual(result.title, "Test MR");
      assert.strictEqual(result.branchName, "feature-branch");

      const args = mockFetch.mock.calls[0].arguments as any[];
      const [url, options] = args;
      assert.ok((url as string).includes("/merge_requests"));

      const body = JSON.parse((options as RequestInit).body as string);
      assert.strictEqual(body.source_branch, "feature-branch");
      assert.strictEqual(body.target_branch, "main");
      assert.strictEqual(body.title, "Test MR");
      assert.strictEqual(body.remove_source_branch, true);
    });
  });

  describe.skip("getDefaultBranch", () => {
    it.skip("should fetch default branch from project", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ default_branch: "develop" }),
      }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const branch = await client.getDefaultBranch();

      assert.strictEqual(branch, "develop");
      const args = mockFetch.mock.calls[0].arguments as any[];
      const [url] = args;
      assert.ok((url as string).includes("/api/v4/projects/42"));
    });

    it("should return 'main' as fallback on error", async () => {
      const mockFetch = mock.fn(async () => ({ ok: false }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const branch = await client.getDefaultBranch();
      assert.strictEqual(branch, "main");
    });
  });

  describe("createDocumentationMR", () => {
    it("should execute complete workflow", async () => {
      const calls: string[] = [];
      const mockFetch = mock.fn(
        async (url: unknown, options?: unknown) => {
          if ((url as string).includes("/branches")) {
            calls.push("createBranch");
            return { ok: true, json: async () => ({}) };
          }
          if ((url as string).includes("/files/")) {
            if (!options || !(options as any)?.method) {
              calls.push("checkFile");
              return { ok: false }; // File doesn't exist
            }
            calls.push("commitFile");
            return { ok: true, json: async () => ({}) };
          }
          if ((url as string).includes("/merge_requests")) {
            calls.push("createMR");
            return {
              ok: true,
              json: async () => ({
                iid: 456,
                web_url: "https://gitlab.example.com/mr/456",
                title: "Test MR",
              }),
            };
          }
          return { ok: true, json: async () => ({}) };
        },
      );
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await client.createDocumentationMR({
        title: "docs: Add documentation",
        description: "Auto-generated docs",
        sourceBranch: "docs/test-2026-03-06",
        targetBranch: "main",
        filePath: "docs/generated/test.md",
        fileContent: "# Test Documentation",
        commitMessage: "docs: Add test documentation",
      });

      // Verify workflow steps executed in order
      assert.deepStrictEqual(calls, [
        "createBranch",
        "checkFile",
        "commitFile",
        "createMR",
      ]);

      assert.strictEqual(result.iid, 456);
      assert.strictEqual(result.url, "https://gitlab.example.com/mr/456");
    });

    it("should handle errors and throw with context", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        text: async () => "API Error",
      }));
      global.fetch = mockFetch as unknown as typeof fetch;

      await assert.rejects(
        async () =>
          await client.createDocumentationMR({
            title: "Test",
            description: "Test",
            sourceBranch: "test",
            filePath: "test.md",
            fileContent: "test",
            commitMessage: "test",
          }),
        /GitLab MR creation failed/,
      );
    });
  });
});
