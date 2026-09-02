/** Host-scheduled worker. It never mutates Gmail; it only resolves ambiguous outcomes. */
export class ReconciliationWorker {
    store;
    userId;
    reconciler;
    constructor(store, userId, reconciler) {
        this.store = store;
        this.userId = userId;
        this.reconciler = reconciler;
    }
    async runOnce() { const rows = this.store.unknownJobItems(this.userId), summary = { confirmed: 0, failed: 0, unknown: 0 }; for (const row of rows) {
        const parsed = JSON.parse(row.result), state = await this.reconciler.reconcile(row.messageId, parsed.action === 'restore' ? 'restored' : 'trashed');
        if (state === 'confirmed') {
            this.store.resolveJobItem(row.jobId, row.messageId, 'succeeded');
            summary.confirmed++;
        }
        else if (state === 'failed') {
            this.store.resolveJobItem(row.jobId, row.messageId, 'failed', 'Reconciliation found the requested state was not applied');
            summary.failed++;
        }
        else
            summary.unknown++;
    } return summary; }
}
