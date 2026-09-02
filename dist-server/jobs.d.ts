import { type JobRepository, type MailProvider, type MutationResult, type ProtectionSnapshot } from './domain.js';
import type { OutcomeReconciler } from './google-adapter.js';
export declare class ProviderOutcomeReconciler implements OutcomeReconciler {
    private provider;
    constructor(provider: MailProvider);
    reconcile(id: string, expected: 'trashed' | 'restored'): Promise<"confirmed" | "failed" | "unknown">;
}
export declare class CleanupService {
    private provider;
    private jobs;
    private reconciler;
    constructor(provider: MailProvider, jobs: JobRepository, reconciler?: OutcomeReconciler);
    run(input: {
        jobId: string;
        action: 'trash' | 'restore';
        ids: string[];
        protections: ProtectionSnapshot | (() => ProtectionSnapshot | Promise<ProtectionSnapshot>);
    }): Promise<MutationResult>;
}
