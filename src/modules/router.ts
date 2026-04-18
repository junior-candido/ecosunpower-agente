import type { QueueMessage } from './queue.js';

interface RouterHandlers {
  onTextMessage: (from: string, text: string) => Promise<void>;
  onUnsupported?: (from: string, type: string) => void;
}

interface SpamEntry {
  content: string;
  count: number;
  firstSeen: number;
}

export class Router {
  private handlers: RouterHandlers;
  private spamTracker: Map<string, SpamEntry[]> = new Map();
  private readonly SPAM_THRESHOLD = 5;
  private readonly SPAM_WINDOW_MS = 60_000;

  constructor(handlers: RouterHandlers) {
    this.handlers = handlers;
  }

  async handle(message: QueueMessage): Promise<void> {
    if (message.type === 'text' && this.isSpam(message.from, message.content)) {
      return;
    }

    switch (message.type) {
      case 'text':
        await this.handlers.onTextMessage(message.from, message.content);
        break;
      case 'audio':
      case 'image':
      case 'location':
        this.handlers.onUnsupported?.(message.from, message.type);
        break;
    }
  }

  private isSpam(from: string, content: string): boolean {
    const now = Date.now();
    const entries = this.spamTracker.get(from) ?? [];
    const recentEntries = entries.filter(e => now - e.firstSeen < this.SPAM_WINDOW_MS);

    const existing = recentEntries.find(e => e.content === content);

    if (existing) {
      existing.count++;
      if (existing.count > this.SPAM_THRESHOLD) {
        return true;
      }
    } else {
      recentEntries.push({ content, count: 1, firstSeen: now });
    }

    this.spamTracker.set(from, recentEntries);
    return false;
  }
}
