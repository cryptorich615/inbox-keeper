import type { OutcomeReconciler } from './google-adapter.js';
import type { SqliteStore } from './store.js';
/** Host-scheduled worker. It never mutates Gmail; it only resolves ambiguous outcomes. */
export declare class ReconciliationWorker {
    private store;
    private userId;
    private reconciler;
    constructor(store: SqliteStore, userId: string, reconciler: OutcomeReconciler);
    runOnce(): Promise<{
        confirmed: number;
        failed: number;
        unknown: number;
    }>;
}
