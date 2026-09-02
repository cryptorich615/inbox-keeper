import { extractBrandKey } from './brand-extraction.js';
import { classifyMessage, } from './category-classifier.js';
const DAY_MS = 86_400_000;
function classify(m) {
    return classifyMessage({
        subject: String(m.subject ?? ''),
        snippet: String(m.subject ?? ''),
        fromAddress: String(m.fromAddress ?? ''),
        hasListUnsubscribe: false,
        hasAttachments: !!m.hasAttachment,
    }).category;
}
export function computeInsights(messages, staleAfterDays = 180) {
    const buckets = new Map();
    let totalMessages = 0;
    let totalBytes = 0;
    let unreadCount = 0;
    let oldestUnreadAt = null;
    const now = Date.now();
    const staleThreshold = now - staleAfterDays * DAY_MS;
    const staleBrandKeys = new Set();
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
        const cat = classifyMessage(signalsFromMessage(m));
        bucket.categories[cat.category].count += 1;
        bucket.categories[cat.category].bytes += size;
        if (cat.category === 'newsletters' || cat.category === 'promotions')
            subscriptionCount += 1;
        if (cat.category === 'receipts')
            receiptCount += 1;
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
export function selectForOneClickCleanup(messages, input, protectedSenders, protectedDomains, excludeStarred = true) {
    const maxItems = input.maxItems ?? 500;
    const cutoff = typeof input.olderThanDays === 'number'
        ? Date.now() - input.olderThanDays * DAY_MS
        : 0;
    const matches = [];
    const excludedProtected = [];
    const excludedStarred = [];
    let totalBytes = 0;
    let totalCandidates = 0;
    for (const m of messages) {
        if (m.labels.includes('TRASH'))
            continue;
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
            if (brand.brandKey !== input.brandKey)
                continue;
        }
        if (input.category) {
            const cat = classifyMessage(signalsFromMessage(m));
            if (cat.category !== input.category)
                continue;
        }
        if (cutoff > 0) {
            const received = String(m.receivedAt ?? '');
            if (!received || new Date(received).getTime() > cutoff)
                continue;
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
export function detectSubscriptions(messages) {
    const map = new Map();
    for (const m of messages) {
        if (m.labels.includes('TRASH'))
            continue;
        const cat = classifyMessage(signalsFromMessage(m));
        if (cat.category !== 'newsletters' && cat.category !== 'promotions')
            continue;
        const brand = extractBrandKey(String(m.fromAddress ?? ''));
        const key = `${brand.brandKey}:${String(m.fromAddress ?? '').toLowerCase()}`;
        const existing = map.get(key);
        const received = String(m.receivedAt ?? '');
        if (existing) {
            existing.messageCount += 1;
            if (received > existing.lastReceivedAt)
                existing.lastReceivedAt = received;
        }
        else {
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
export function extractReceipts(messages) {
    return messages
        .filter((m) => !m.labels.includes('TRASH'))
        .map((m) => ({ m, cat: classifyMessage(signalsFromMessage(m)) }))
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
function signalsFromMessage(m) {
    return {
        subject: String(m.subject ?? ""),
        snippet: String(m.subject ?? ""),
        fromAddress: String(m.fromAddress ?? ""),
        hasListUnsubscribe: false,
        hasAttachments: !!m.hasAttachment,
    };
}
