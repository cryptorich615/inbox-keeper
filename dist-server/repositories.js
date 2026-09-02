export class MemoryJobs {
    jobs = new Map();
    events = [];
    async get(id) { return this.jobs.get(id) ?? null; }
    async put(id, r) { this.jobs.set(id, r); }
    async appendAudit(r) { this.events.unshift(r); }
    async audit() { return structuredClone(this.events); }
    async clear() { this.jobs.clear(); this.events = []; }
}
export class MemoryEncryptedTokens {
    values = new Map();
    async put(id, v) { this.values.set(id, v); }
    async get(id) { return this.values.get(id) ?? null; }
    async delete(id) { this.values.delete(id); }
}
