import type { NormalizedMessage } from './domain.js';
import { type EmailCategory } from './category-classifier.js';
export interface StorageInsight {
    brandKey: string;
    displayName: string;
    totalMessages: number;
    totalBytes: number;
    categories: Record<EmailCategory, {
        count: number;
        bytes: number;
    }>;
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
export declare function computeInsights(messages: NormalizedMessage[], staleAfterDays?: number): InsightsSummary;
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
export declare function selectForOneClickCleanup(messages: NormalizedMessage[], input: OneClickCleanupInput, protectedSenders: Set<string>, protectedDomains: Set<string>, excludeStarred?: boolean): OneClickMatchResult;
export interface DetectedSubscription {
    brandKey: string;
    displayName: string;
    sender: string;
    category: EmailCategory;
    messageCount: number;
    lastReceivedAt: string;
    unsubscribeHint: string | null;
}
export declare function detectSubscriptions(messages: NormalizedMessage[]): DetectedSubscription[];
export interface ReceiptRecord {
    messageId: string;
    brandKey: string;
    displayName: string;
    sender: string;
    subject: string;
    receivedAt: string;
    sizeEstimate: number;
}
export declare function extractReceipts(messages: NormalizedMessage[]): ReceiptRecord[];
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
