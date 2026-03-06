"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackClient = void 0;
const bolt_1 = require("@slack/bolt");
const config_1 = require("../config");
class SlackClient {
    constructor() {
        this.app = new bolt_1.App({
            token: config_1.config.slack.botToken,
            signingSecret: config_1.config.slack.signingSecret,
            appToken: config_1.config.slack.appToken,
            socketMode: true,
        });
    }
    async sendMessage(channelId, text, blocks) {
        return this.app.client.chat.postMessage({
            channel: channelId,
            text,
            blocks: blocks || [],
        });
    }
    async sendThreadReply(channelId, threadTs, text) {
        return this.app.client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text,
        });
    }
    async getFileInfo(fileId) {
        return this.app.client.files.info({ file: fileId });
    }
    async downloadFile(fileUrl, token) {
        const response = await fetch(fileUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return Buffer.from(await response.arrayBuffer());
    }
    getApp() {
        return this.app;
    }
}
exports.SlackClient = SlackClient;
//# sourceMappingURL=client.js.map