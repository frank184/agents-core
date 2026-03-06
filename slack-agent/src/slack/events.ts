import { App } from '@slack/bolt';
import { SlackClient } from './client';

export function registerEventHandlers(app: App, slackClient: SlackClient) {
  // File shared event
  app.event('file_shared', async ({ event, say, client }) => {
    try {
      const fileInfo = await slackClient.getFileInfo(event.file_id);
      const file = fileInfo.file as any;

      await say({
        thread_ts: event.ts,
        text: `📄 Processing ${file.name}...`,
      });

      // TODO: Trigger document processing pipeline
    } catch (error) {
      console.error('Error handling file_shared event:', error);
      await say({
        thread_ts: event.ts,
        text: '❌ Error processing file. Check logs.',
      });
    }
  });

  // Message event for commands
  app.message(/^@documentation/, async ({ message, say }) => {
    const text = (message as any).text;

    if (text.includes('status')) {
      await say('📊 Documentation Agent Status: Ready');
    } else if (text.includes('help')) {
      await say(
        'Commands:\n' +
        '• Upload PDFs/DOCX to auto-parse\n' +
        '• @documentation status - Check agent health\n' +
        '• @documentation recent - Show recent MRs'
      );
    }
  });
}
