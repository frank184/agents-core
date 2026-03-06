"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const client_1 = require("./slack/client");
const events_1 = require("./slack/events");
async function main() {
    // Validate configuration
    const errors = (0, config_1.validateConfig)();
    if (errors.length > 0) {
        console.error('Configuration errors:', errors);
        process.exit(1);
    }
    // Initialize Slack client
    const slackClient = new client_1.SlackClient();
    const app = slackClient.getApp();
    // Register event handlers
    (0, events_1.registerEventHandlers)(app, slackClient);
    // Start bot
    await app.start();
    console.log('⚡️ Slack Documentation Agent Started');
}
main().catch(console.error);
//# sourceMappingURL=index.js.map