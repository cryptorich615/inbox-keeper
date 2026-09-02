import { DatabaseSync } from 'node:sqlite';
export interface SessionRow {
    id: string;
    userId: string;
    csrf: string;
    expiresAt: number;
    oauthState: string | null;
    pkceVerifier: string | null;
}
export interface PreviewRow {
    id: string;
    sessionId: string;
    userId: string;
    action: 'trash' | 'restore';
    ids: string[];
    excluded: string[];
    ruleVersion: number;
    confirmText: string | null;
    expiresAt: number;
    used: boolean;
}
export declare class SqliteStore {
    readonly db: DatabaseSync;
    constructor(path?: string);
    private jobKey;
    private migrate;
    createSession(userId?: string, ttl?: number): SessionRow;
    session(id: string): SessionRow | null;
    rotateSession(id: string): SessionRow | null;
    bindOAuth(id: string, state: string, verifier: string): void;
    consumeOAuth(id: string, state: string): string | null;
    protections(userId: string): {
        senders: Set<string>;
        domains: Set<string>;
        version: number;
    };
    replaceProtections(userId: string, senders: string[], domains: string[], expectedVersion?: number): number | null;
    addProtections(userId: string, senders: string[], domains?: string[]): number;
    createPreview(p: Omit<PreviewRow, 'id' | 'used'>): {
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
    };
    preview(id: string): PreviewRow | null;
    consumePreview(id: string): boolean;
    putJob(id: string, userId: string, result: unknown): void;
    job(id: string, userId: string): any;
    storedJobId(id: string, userId: string): string;
    appendAudit(userId: string, event: unknown): void;
    putToken(userId: string, ciphertext: string, keyId: string): void;
    token(userId: string): {
        ciphertext: string;
        keyId: string;
    } | null;
    deleteToken(userId: string): void;
    putMetadata(userId: string, message: unknown & {
        id: string;
    }): void;
    metadata(userId: string): any[];
    unknownJobItems(userId: string, limit?: number): Array<{
        jobId: string;
        messageId: string;
        result: string;
    }>;
    resolveJobItem(jobId: string, messageId: string, status: 'succeeded' | 'failed' | 'unknown', reason?: string): void;
    deleteUser(userId: string): void;
    close(): void;
}
