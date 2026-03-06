import { App } from '@slack/bolt';
import { config } from '../config';

export class SlackClient {
  private app: App;

  constructor() {
    this.app = new App({
      token: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
      appToken: config.slack.appToken,
      socketMode: true,
    });
  }

  async sendMessage(channelId: string, text: string, blocks?: any[]) {
    return this.app.client.chat.postMessage({
      channel: channelId,
      text,
      blocks: blocks || [],
    });
  }

  async sendThreadReply(channelId: string, threadTs: string, text: string) {
    return this.app.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text,
    });
  }

  async getFileInfo(fileId: string) {
    return this.app.client.files.info({ file: fileId });
  }

  async downloadFile(fileUrl: string, token: string): Promise<Buffer> {
    const response = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return Buffer.from(await response.arrayBuffer());
  }

  getApp(): App {
    return this.app;
  }
}
