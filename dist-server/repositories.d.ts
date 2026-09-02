import type { AuditRecord, JobRepository, MutationResult, TokenRepository } from './domain.js';
export declare class MemoryJobs implements JobRepository {
    private jobs;
    private events;
    get(id: string): Promise<MutationResult | null>;
    put(id: string, r: MutationResult): Promise<void>;
    appendAudit(r: AuditRecord): Promise<void>;
    audit(): Promise<AuditRecord[]>;
    clear(): Promise<void>;
}
export declare class MemoryEncryptedTokens implements TokenRepository {
    private values;
    put(id: string, v: string): Promise<void>;
    get(id: string): Promise<string | null>;
    delete(id: string): Promise<void>;
}
