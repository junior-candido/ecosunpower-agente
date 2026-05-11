import { createHmac } from 'crypto';

const GRAPH = 'https://graph.facebook.com/v22.0';

export class InstagramDirectService {
  constructor(
    private igUserId: string,
    private accessToken: string,
    private appSecret: string,
  ) {}

  async sendText(recipientIgId: string, text: string): Promise<void> {
    const url = `${GRAPH}/${this.igUserId}/messages?access_token=${this.accessToken}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgId },
        message: { text },
      }),
    });
    if (!r.ok) throw new Error(`IG DM send ${r.status}: ${await r.text()}`);
  }

  async sendQuickReplies(
    recipientIgId: string,
    text: string,
    options: { title: string; payload: string }[],
  ): Promise<void> {
    const url = `${GRAPH}/${this.igUserId}/messages?access_token=${this.accessToken}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgId },
        message: {
          text,
          quick_replies: options.slice(0, 13).map((o) => ({
            content_type: 'text',
            title: o.title.slice(0, 20),
            payload: o.payload,
          })),
        },
      }),
    });
    if (!r.ok) throw new Error(`IG DM quick_replies ${r.status}: ${await r.text()}`);
  }

  validateSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = 'sha256=' + createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    return signature === expected;
  }
}
