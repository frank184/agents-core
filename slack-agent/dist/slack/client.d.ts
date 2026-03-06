import { App } from '@slack/bolt';
export declare class SlackClient {
    private app;
    constructor();
    sendMessage(channelId: string, text: string, blocks?: any[]): Promise<import("@slack/web-api").ChatPostMessageResponse>;
    sendThreadReply(channelId: string, threadTs: string, text: string): Promise<import("@slack/web-api").ChatPostMessageResponse>;
    getFileInfo(fileId: string): Promise<import("@slack/web-api").FilesInfoResponse>;
    downloadFile(fileUrl: string, token: string): Promise<Buffer>;
    getApp(): App;
}
//# sourceMappingURL=client.d.ts.map