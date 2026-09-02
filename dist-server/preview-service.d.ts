import type { MailProvider } from './domain.js';
import type { SqliteStore } from './store.js';
export declare class PreviewService {
    private provider;
    private store;
    constructor(provider: MailProvider, store: SqliteStore);
    create(input: {
        sessionId: string;
        userId: string;
        action: 'trash' | 'restore';
        ids: string[];
    }): Promise<{
        sessionId: string;
        userId: string;
        action: 'trash' | 'restore';
        ids: string[];
        excluded: string[];
        ruleVersion: number;
        confirmText: string | null;
        expiresAt: number;
        id: `${string}-${string}-${string}-${string}-${string}`;
        used: boolean;
    }>;
    validate(input: {
        previewId: string;
        sessionId: string;
        userId: string;
        confirmation?: string;
    }): Promise<import("./store.js").PreviewRow>;
}
