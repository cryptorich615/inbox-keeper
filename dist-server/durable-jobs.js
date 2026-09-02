export class DurableJobs {
    store;
    userId;
    constructor(store, userId) {
        this.store = store;
        this.userId = userId;
    }
    async get(id) { return this.store.job(id, this.userId); }
    async put(id, r) { this.store.putJob(id, this.userId, r); const storedId = this.store.storedJobId(id, this.userId), q = this.store.db.prepare('INSERT OR REPLACE INTO job_items VALUES(?,?,?,?)'); const write = (messageId, status, reason) => q.run(...[storedId, messageId, status, reason]); r.succeeded.forEach(x => write(x, 'succeeded', '')); r.failed.forEach(x => write(x.id, 'failed', x.reason)); r.skipped.forEach(x => write(x.id, 'skipped', x.reason)); r.unknown?.forEach(x => write(x.id, 'unknown', x.reason)); }
    async appendAudit(r) { this.store.appendAudit(this.userId, r); }
    async audit() { const rows = this.store.db.prepare('SELECT event_json event FROM audit WHERE user_id=? ORDER BY created_at DESC').all(this.userId); return rows.map(x => JSON.parse(x.event)); }
    async clear() { this.store.deleteUser(this.userId); }
}
