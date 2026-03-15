import dotenv from 'dotenv';
dotenv.config();

export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    appToken: process.env.SLACK_APP_TOKEN!,
    channelId: process.env.SLACK_CHANNEL_ID!,
  },
  copilot: {
    apiKey: process.env.COPILOT_API_KEY!,
    model: process.env.COPILOT_MODEL || 'claude-opus',
  },
  git: {
    provider: (process.env.GIT_PROVIDER || 'gitlab') as 'gitlab' | 'github',
    gitlab: {
      url: process.env.GITLAB_URL || 'https://gitlab.com',
      token: process.env.GITLAB_TOKEN!,
      projectId: process.env.GITLAB_PROJECT_ID!,
    },
    github: {
      token: process.env.GITHUB_TOKEN!,
      repo: process.env.GITHUB_REPO!,
    },
  },
  docStorage: process.env.DOC_STORAGE_PATH || './processed_docs',
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.slack.botToken) errors.push('SLACK_BOT_TOKEN not set');
  if (!config.slack.signingSecret) errors.push('SLACK_SIGNING_SECRET not set');
  if (!config.copilot.apiKey) errors.push('COPILOT_API_KEY not set');
  
  // VCS validation (optional - only if user wants MR creation)
  if (config.git.provider === 'gitlab') {
    if (!config.git.gitlab.token) errors.push('GITLAB_TOKEN not set (required for MR creation)');
    if (!config.git.gitlab.projectId) errors.push('GITLAB_PROJECT_ID not set (required for MR creation)');
  } else if (config.git.provider === 'github') {
    if (!config.git.github.token) errors.push('GITHUB_TOKEN not set (required for MR creation)');
    if (!config.git.github.repo) errors.push('GITHUB_REPO not set (required for MR creation)');
  }
  
  return errors;
}
