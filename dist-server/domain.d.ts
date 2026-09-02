export type ConnectionMode = 'demo' | 'disconnected' | 'readonly' | 'cleanup';
export interface NormalizedMessage {
    id: string;
    threadId: string;
    fromName: string;
    fromAddress: string;
    subject: string;
    receivedAt: string;
    sizeEstimate: number;
    labels: string[];
    unread: boolean;
    starred: boolean;
    hasAttachment: boolean;
}
export interface Page<T> {
    items: T[];
    nextPageToken?: string;
}
export interface ProtectionSnapshot {
    senders: Set<string>;
    domains: Set<string>;
}
export interface MutationResult {
    requested: number;
    succeeded: string[];
    failed: Array<{
        id: string;
        reason: string;
    }>;
    skipped: Array<{
        id: string;
        reason: string;
    }>;
    unknown?: Array<{
        id: string;
        reason: string;
    }>;
}
export interface AuditRecord {
    id: string;
    jobId: string;
    action: 'trash' | 'restore';
    requested: number;
    succeeded: number;
    failed: number;
    skipped: number;
    at: string;
}
export interface MailProvider {
    readonly kind: 'mock' | 'gmail';
    listMetadata(pageToken?: string): Promise<Page<NormalizedMessage>>;
    currentMetadata(ids: string[]): Promise<NormalizedMessage[]>;
    trash(id: string): Promise<void>;
    restore(id: string): Promise<void>;
}
export interface TokenRepository {
    put(userId: string, encryptedToken: string): Promise<void>;
    get(userId: string): Promise<string | null>;
    delete(userId: string): Promise<void>;
}
export interface JobRepository {
    get(jobId: string): Promise<MutationResult | null>;
    put(jobId: string, result: MutationResult): Promise<void>;
    appendAudit(record: AuditRecord): Promise<void>;
    audit(): Promise<AuditRecord[]>;
    clear(): Promise<void>;
}
export declare function senderDomain(address: string): string;
export declare function protectedMessage(m: NormalizedMessage, p: ProtectionSnapshot): boolean;
