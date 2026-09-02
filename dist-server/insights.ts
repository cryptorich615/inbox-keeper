import type { NormalizedMessage } from './domain.js';
import { extractBrandKey } from './brand-extraction.js';
import {
  classifyMessage,
  type EmailCategory,
} from './category-classifier.js';

export interface StorageInsight {
  brandKey: string;
  displayName: string;
  totalMessages: number;
  totalBytes: number;
  categories: Record<EmailCategory, { count: number; bytes: number }>;
  lastMessageAt: string;
  sampleSenders: string[];
}

export interface InsightsSummary {
  totalMessages: number;
  totalBytes: number;
  unreadCount: number;
  oldestUnreadAt: string | null;
  staleAfterDays: number;
  staleBrandCount: number;
  staleMessages: number;
  topByBytes: StorageInsight[];
  topByCount: StorageInsight[];
  subscriptionCount: number;
  receiptCount: number;
  attachmentBytes: number;
  attachmentCount: number;
}

const DAY_MS = 86_400_000;

function classify(m: NormalizedMessage): EmailCategory {
  return classifyMessage({
    subject: String(m.subject ?? ''),
    snippet: String(m.snippet ?? ''),
    fromAddress: String(m.fromAddress ?? ''),
    hasListUnsubscribe: false,
    hasAttachments: !!m.hasAttachment,
  }).category;
}

export function computeInsights(
  messages: NormalizedMessage[],
  staleAfterDays = 180,
): InsightsSummary {
  const buckets = new Map<string, StorageInsight>();
  let totalMessages = 0;
  let totalBytes = 0;
  let unreadCount = 0;
  let oldestUnreadAt: string | null = null;
  const now = Date.now();
  const staleThreshold = now - staleAfterDays * DAY_MS;
  const staleBrandKeys = new Set<string>();
  let staleMessages = 0;
  let subscriptionCount = 0;
  let receiptCount = 0;
  let attachmentBytes = 0;
  let attachmentCount = 0;

  for (const m of messages) {
    totalMessages += 1;
    const size = Number(m.sizeEstimate ?? 0);
    totalBytes += size;
    if (m.unread) {
      unreadCount += 1;
      const received = String(m.receivedAt ?? '');
      if (received && (!oldestUnreadAt || received < oldestUnreadAt)) {
        oldestUnreadAt = received;
      }
    }
    const brand = extractBrandKey(String(m.fromAddress ?? ''));
    const bucket = buckets.get(brand.brandKey) ?? {
      brandKey: brand.brandKey,
      displayName: brand.displayName,
      totalMessages: 0,
      totalBytes: 0,
      categories: {
        receipts: { count: 0, bytes: 0 },
        shipping: { count: 0, bytes: 0 },
        promotions: { count: 0, bytes: 0 },
        newsletters: { count: 0, bytes: 0 },
        statements: { count: 0, bytes: 0 },
        surveys: { count: 0, bytes: 0 },
        account: { count: 0, bytes: 0 },
        personal: { count: 0, bytes: 0 },
      },
      lastMessageAt: String(m.receivedAt ?? '1970-01-01T00:00:00Z'),
      sampleSenders: [],
    };
    bucket.totalMessages += 1;
    bucket.totalBytes += size;
    const cat = classify(m);
    bucket.categories[cat].count += 1;
    bucket.categories[cat].bytes += size;
    if (cat === 'newsletters' || cat === 'promotions') subscriptionCount += 1;
    if (cat === 'receipts') receiptCount += 1;
    if (m.hasAttachment) {
      attachmentCount += 1;
      attachmentBytes += size;
    }
    if (bucket.sampleSenders.length < 3 && !bucket.sampleSenders.includes(m.fromAddress)) {
      bucket.sampleSenders.push(m.fromAddress);
    }
    const received = String(m.receivedAt ?? '');
    if (received && received > bucket.lastMessageAt) {
      bucket.lastMessageAt = received;
    }
    if (received && new Date(received).getTime() < staleThreshold) {
      staleBrandKeys.add(brand.brandKey);
      staleMessages += 1;
    }
    buckets.set(brand.brandKey, bucket);
  }

  const all = [...buckets.values()];
  return {
    totalMessages,
    totalBytes,
    unreadCount,
    oldestUnreadAt,
    staleAfterDays,
    staleBrandCount: staleBrandKeys.size,
    staleMessages,
    topByBytes: [...all].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 20),
    topByCount: [...all].sort((a, b) => b.totalMessages - a.totalMessages).slice(0, 20),
    subscriptionCount,
    receiptCount,
    attachmentBytes,
    attachmentCount,
  };
}

export interface OneClickCleanupInput {
  category?: EmailCategory;
  brandKey?: string;
  olderThanDays?: number;
  maxItems?: number;
}

export interface OneClickMatchResult {
  messageIds: string[];
  totalBytes: number;
  excludedProtected: string[];
  excludedStarred: string[];
  totalCandidates: number;
}

export function selectForOneClickCleanup(
  messages: NormalizedMessage[],
  input: OneClickCleanupInput,
  protectedSenders: Set<string>,
  protectedDomains: Set<string>,
  excludeStarred = true,
): OneClickMatchResult {
  const maxItems = input.maxItems ?? 500;
  const cutoff =
    typeof input.olderThanDays === 'number'
      ? Date.now() - input.olderThanDays * DAY_MS
      : 0;
  const matches: string[] = [];
  const excludedProtected: string[] = [];
  const excludedStarred: string[] = [];
  let totalBytes = 0;
  let totalCandidates = 0;
  for (const m of messages) {
    if (m.labels.includes('TRASH')) continue;
    const sender = String(m.fromAddress ?? '').toLowerCase();
    const domain = sender.slice(sender.lastIndexOf('@') + 1);
    if (protectedSenders.has(sender) || protectedDomains.has(domain)) {
      excludedProtected.push(m.id);
      continue;
    }
    if (excludeStarred && m.starred) {
      excludedStarred.push(m.id);
      continue;
    }
    if (input.brandKey) {
      const brand = extractBrandKey(sender);
      if (brand.brandKey !== input.brandKey) continue;
    }
    if (input.category) {
      const cat = classify(m);
      if (cat.category !== input.category) continue;
    }
    if (cutoff > 0) {
      const received = String(m.receivedAt ?? '');
      if (!received || new Date(received).getTime() > cutoff) continue;
    }
    totalCandidates += 1;
    if (matches.length < maxItems) {
      matches.push(m.id);
      totalBytes += Number(m.sizeEstimate ?? 0);
    }
  }
  return {
    messageIds: matches,
    totalBytes,
    excludedProtected,
    excludedStarred,
    totalCandidates,
  };
}

export interface DetectedSubscription {
  brandKey: string;
  displayName: string;
  sender: string;
  category: EmailCategory;
  messageCount: number;
  lastReceivedAt: string;
  unsubscribeHint: string | null;
}

export function detectSubscriptions(messages: NormalizedMessage[]): DetectedSubscription[] {
  const map = new Map<string, DetectedSubscription>();
  for (const m of messages) {
    if (m.labels.includes('TRASH')) continue;
    const cat = classify(m);
    if (cat.category !== 'newsletters' && cat.category !== 'promotions') continue;
    const brand = extractBrandKey(String(m.fromAddress ?? ''));
    const key = `${brand.brandKey}:${String(m.fromAddress ?? '').toLowerCase()}`;
    const existing = map.get(key);
    const received = String(m.receivedAt ?? '');
    if (existing) {
      existing.messageCount += 1;
      if (received > existing.lastReceivedAt) existing.lastReceivedAt = received;
    } else {
      map.set(key, {
        brandKey: brand.brandKey,
        displayName: brand.displayName,
        sender: String(m.fromAddress ?? ''),
        category: cat.category,
        messageCount: 1,
        lastReceivedAt: received,
        unsubscribeHint: null,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.messageCount - a.messageCount);
}

export interface ReceiptRecord {
  messageId: string;
  brandKey: string;
  displayName: string;
  sender: string;
  subject: string;
  receivedAt: string;
  sizeEstimate: number;
}

export function extractReceipts(messages: NormalizedMessage[]): ReceiptRecord[] {
  return messages
    .filter((m) => !m.labels.includes('TRASH'))
    .map((m) => ({ m, cat: classify(m) }))
    .filter((x) => x.cat.category === 'receipts')
    .map(({ m }) => {
      const brand = extractBrandKey(String(m.fromAddress ?? ''));
      return {
        messageId: m.id,
        brandKey: brand.brandKey,
        displayName: brand.displayName,
        sender: String(m.fromAddress ?? ''),
        subject: String(m.subject ?? ''),
        receivedAt: String(m.receivedAt ?? ''),
        sizeEstimate: Number(m.sizeEstimate ?? 0),
      };
    })
    .sort((a, b) => (b.receivedAt > a.receivedAt ? 1 : -1));
}

export interface SmartRule {
  id: string;
  match: {
    brandKey?: string;
    category?: EmailCategory;
    olderThanDays?: number;
  };
  action: 'trash' | 'archive';
  enabled: boolean;
  createdAt: string;
  label: string;
}

export interface SnoozeRecord {
  id: string;
  brandKey?: string;
  category?: EmailCategory;
  untilISO: string;
  createdAt: string;
  reason: string;
}
