import assert from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";
import { config, validateConfig } from "../src/config";

describe("Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear environment
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.SLACK_APP_TOKEN;
    delete process.env.COPILOT_API_KEY;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_PROJECT_ID;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPO;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("validateConfig", () => {
    it("should return errors for missing required Slack config", () => {
      const errors = validateConfig();

      assert.ok(errors.length > 0);
      assert.ok(errors.some((e) => e.includes("SLACK_BOT_TOKEN")));
      assert.ok(errors.some((e) => e.includes("SLACK_SIGNING_SECRET")));
    });

    it("should return errors for missing Copilot config", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test";
      process.env.SLACK_SIGNING_SECRET = "test-secret";
      process.env.SLACK_APP_TOKEN = "xapp-test";

      const errors = validateConfig();

      assert.ok(errors.some((e) => e.includes("COPILOT_API_KEY")));
    });

    it("should validate GitLab config when provider is gitlab", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test";
      process.env.SLACK_SIGNING_SECRET = "test-secret";
      process.env.SLACK_APP_TOKEN = "xapp-test";
      process.env.COPILOT_API_KEY = "test-key";
      process.env.GIT_PROVIDER = "gitlab";

      const errors = validateConfig();

      assert.ok(errors.some((e) => e.includes("GITLAB_TOKEN")));
      assert.ok(errors.some((e) => e.includes("GITLAB_PROJECT_ID")));
    });

    it("should validate GitHub config when provider is github", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test";
      process.env.SLACK_SIGNING_SECRET = "test-secret";
      process.env.SLACK_APP_TOKEN = "xapp-test";
      process.env.COPILOT_API_KEY = "test-key";
      process.env.GIT_PROVIDER = "github";

      const errors = validateConfig();

      assert.ok(errors.some((e) => e.includes("GITHUB_TOKEN")));
      assert.ok(errors.some((e) => e.includes("GITHUB_REPO")));
    });

    it("should return no errors with complete valid config", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test";
      process.env.SLACK_SIGNING_SECRET = "test-secret";
      process.env.SLACK_APP_TOKEN = "xapp-test";
      process.env.COPILOT_API_KEY = "test-key";
      process.env.GIT_PROVIDER = "gitlab";
      process.env.GITLAB_TOKEN = "glpat-test";
      process.env.GITLAB_PROJECT_ID = "123";

      const errors = validateConfig();

      assert.strictEqual(errors.length, 0);
    });
  });

  describe("config object", () => {
    it("should have default values", () => {
      assert.strictEqual(config.copilot.model, "claude-opus");
      assert.strictEqual(config.git.provider, "gitlab");
      assert.strictEqual(config.git.gitlab.url, "https://gitlab.com");
      assert.strictEqual(config.docStorage, "./processed_docs");
    });

    it("should respect environment overrides", () => {
      process.env.COPILOT_MODEL = "gpt-4";
      process.env.GIT_PROVIDER = "github";
      process.env.GITLAB_URL = "https://gitlab.custom.com";
      process.env.DOC_STORAGE_PATH = "/custom/path";

      // Re-import to get updated config
      delete require.cache[require.resolve("../src/config")];
      const { config: freshConfig } = require("../src/config");

      assert.strictEqual(freshConfig.copilot.model, "gpt-4");
      assert.strictEqual(freshConfig.git.provider, "github");
      assert.strictEqual(freshConfig.git.gitlab.url, "https://gitlab.custom.com");
      assert.strictEqual(freshConfig.docStorage, "/custom/path");
    });
  });
});
