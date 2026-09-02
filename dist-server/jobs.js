import { randomUUID } from 'node:crypto';
import { protectedMessage } from './domain.js';
import { retryDelay } from './limits.js';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
export class ProviderOutcomeReconciler {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async reconcile(id, expected) { try {
        const [message] = await this.provider.currentMetadata([id]);
        if (!message)
            return 'unknown';
        const trashed = message.labels.includes('TRASH');
        return (expected === 'trashed' ? trashed : !trashed) ? 'confirmed' : 'failed';
    }
    catch {
        return 'unknown';
    } }
}
export class CleanupService {
    provider;
    jobs;
    reconciler;
    constructor(provider, jobs, reconciler = new ProviderOutcomeReconciler(provider)) {
        this.provider = provider;
        this.jobs = jobs;
        this.reconciler = reconciler;
    }
    async run(input) {
        const existing = await this.jobs.get(input.jobId);
        if (existing)
            return existing;
        const unique = [...new Set(input.ids)].slice(0, 500), result = { requested: unique.length, succeeded: [], failed: [], skipped: [], unknown: [] };
        for (const id of unique) {
            // Reload immediately before every mutation. Browser selections and previews are never authoritative.
            let m;
            try {
                [m] = await this.provider.currentMetadata([id]);
            }
            catch {
                result.unknown.push({ id, reason: 'Could not revalidate current message state' });
                continue;
            }
            if (!m) {
                result.failed.push({ id, reason: 'Message no longer exists' });
                continue;
            }
            const protections = typeof input.protections === 'function' ? await input.protections() : input.protections;
            if (input.action === 'trash' && protectedMessage(m, protections)) {
                result.skipped.push({ id, reason: 'Protected sender or domain' });
                continue;
            }
            let completed = false;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await this.provider[input.action](id);
                    result.succeeded.push(id);
                    completed = true;
                    break;
                }
                catch {
                    if (attempt < 2)
                        await wait(retryDelay(attempt, 250, 10_000, Math.random));
                }
            }
            if (!completed) {
                const state = await this.reconciler.reconcile(id, input.action === 'trash' ? 'trashed' : 'restored');
                if (state === 'confirmed')
                    result.succeeded.push(id);
                else if (state === 'failed')
                    result.failed.push({ id, reason: 'Gmail rejected the requested change' });
                else
                    result.unknown.push({ id, reason: 'Outcome unknown; reconciliation required' });
            }
        }
        await this.jobs.put(input.jobId, result);
        await this.jobs.appendAudit({ id: randomUUID(), jobId: input.jobId, action: input.action, requested: result.requested, succeeded: result.succeeded.length, failed: result.failed.length + (result.unknown?.length ?? 0), skipped: result.skipped.length, at: new Date().toISOString() });
        return result;
    }
}
