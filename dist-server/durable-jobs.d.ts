import type { AuditRecord, JobRepository, MutationResult } from './domain.js';
import type { SqliteStore } from './store.js';
export declare class DurableJobs implements JobRepository {
    private store;
    private userId;
    constructor(store: SqliteStore, userId: string);
    get(id: string): Promise<any>;
    put(id: string, r: MutationResult): Promise<void>;
    appendAudit(r: AuditRecord): Promise<void>;
    audit(): Promise<any[]>;
    clear(): Promise<void>;
}
