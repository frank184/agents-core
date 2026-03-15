import { config } from "../config";

export interface MergeRequestResult {
  url: string;
  iid: number;
  title: string;
  branchName: string;
}

export interface CreateMROptions {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch?: string;
  filePath: string;
  fileContent: string;
  commitMessage: string;
}

/**
 * GitLab API client for creating merge requests with documentation
 */
export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private projectId: string;

  constructor() {
    this.baseUrl = config.git.gitlab.url;
    this.token = config.git.gitlab.token;
    this.projectId = config.git.gitlab.projectId;
  }

  /**
   * Create a new branch from the default branch
   */
  async createBranch(branchName: string, ref: string = "main"): Promise<void> {
    const url = `${this.baseUrl}/api/v4/projects/${this.projectId}/repository/branches`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: branchName,
        ref,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create branch: ${error}`);
    }
  }

  /**
   * Create or update a file in the repository
   */
  async commitFile(
    branchName: string,
    filePath: string,
    content: string,
    commitMessage: string
  ): Promise<void> {
    const url = `${this.baseUrl}/api/v4/projects/${this.projectId}/repository/files/${encodeURIComponent(filePath)}`;

    // Try to get existing file first
    const getResponse = await fetch(`${url}?ref=${branchName}`, {
      headers: {
        "PRIVATE-TOKEN": this.token,
      },
    });

    const action = getResponse.ok ? "update" : "create";

    const response = await fetch(url, {
      method: action === "create" ? "POST" : "PUT",
      headers: {
        "PRIVATE-TOKEN": this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: branchName,
        content,
        commit_message: commitMessage,
        encoding: "text",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to commit file: ${error}`);
    }
  }

  /**
   * Create a merge request
   */
  async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<MergeRequestResult> {
    const url = `${this.baseUrl}/api/v4/projects/${this.projectId}/merge_requests`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
        remove_source_branch: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create MR: ${error}`);
    }

    const data = (await response.json()) as {
      iid: number;
      web_url: string;
      title: string;
    };

    return {
      url: data.web_url,
      iid: data.iid,
      title: data.title,
      branchName: sourceBranch,
    };
  }

  /**
   * Complete workflow: create branch, commit file, create MR
   */
  async createDocumentationMR(options: CreateMROptions): Promise<MergeRequestResult> {
    const targetBranch = options.targetBranch || "main";

    try {
      // Step 1: Create branch
      await this.createBranch(options.sourceBranch, targetBranch);

      // Step 2: Commit documentation file
      await this.commitFile(
        options.sourceBranch,
        options.filePath,
        options.fileContent,
        options.commitMessage
      );

      // Step 3: Create merge request
      const mr = await this.createMergeRequest(
        options.sourceBranch,
        targetBranch,
        options.title,
        options.description
      );

      return mr;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`GitLab MR creation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get default branch for the project
   */
  async getDefaultBranch(): Promise<string> {
    const url = `${this.baseUrl}/api/v4/projects/${this.projectId}`;

    const response = await fetch(url, {
      headers: {
        "PRIVATE-TOKEN": this.token,
      },
    });

    if (!response.ok) {
      return "main"; // Fallback
    }

    const data = (await response.json()) as { default_branch: string };
    return data.default_branch;
  }
}
