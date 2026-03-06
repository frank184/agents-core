import { App } from '@slack/bolt';
import dotenv from 'dotenv';

dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Placeholder for documentation processing
app.event('file_shared', async ({ event, client }) => {
  console.log('File shared event received:', event);
});

(async () => {
  await app.start();
  console.log('⚡️ Bolt app is running!');
})();
