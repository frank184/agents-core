"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    slack: {
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN,
        channelId: process.env.SLACK_CHANNEL_ID,
    },
    copilot: {
        apiKey: process.env.COPILOT_API_KEY,
        model: process.env.COPILOT_MODEL || 'claude-opus',
    },
    git: {
        provider: (process.env.GIT_PROVIDER || 'gitlab'),
        gitlab: {
            url: process.env.GITLAB_URL,
            token: process.env.GITLAB_TOKEN,
            projectId: process.env.GITLAB_PROJECT_ID,
        },
        github: {
            token: process.env.GITHUB_TOKEN,
            repo: process.env.GITHUB_REPO,
        },
    },
    docStorage: process.env.DOC_STORAGE_PATH || './processed_docs',
};
function validateConfig() {
    const errors = [];
    if (!exports.config.slack.botToken)
        errors.push('SLACK_BOT_TOKEN not set');
    if (!exports.config.slack.signingSecret)
        errors.push('SLACK_SIGNING_SECRET not set');
    if (!exports.config.copilot.apiKey)
        errors.push('COPILOT_API_KEY not set');
    return errors;
}
//# sourceMappingURL=config.js.map