import { validateConfig } from './config';
import { SlackClient } from './slack/client';
import { registerEventHandlers } from './slack/events';

async function main() {
  // Validate configuration
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    process.exit(1);
  }

  // Initialize Slack client
  const slackClient = new SlackClient();
  const app = slackClient.getApp();

  // Register event handlers
  registerEventHandlers(app, slackClient);

  // Start bot
  await app.start();
  console.log('⚡️ Slack Documentation Agent Started');
}

main().catch(console.error);
