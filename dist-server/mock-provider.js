export class MockGmailProvider {
    kind = 'mock';
    messages = new Map();
    failures = new Set();
    constructor(messages = []) { messages.forEach(m => this.messages.set(m.id, structuredClone(m))); }
    async listMetadata() { return { items: [...this.messages.values()].map(m => structuredClone(m)) }; }
    async currentMetadata(ids) { return ids.flatMap(id => { const m = this.messages.get(id); return m ? [structuredClone(m)] : []; }); }
    async trash(id) { this.maybeFail(id); const m = this.require(id); if (!m.labels.includes('TRASH'))
        m.labels.push('TRASH'); }
    async restore(id) { this.maybeFail(id); const m = this.require(id); m.labels = m.labels.filter(x => x !== 'TRASH'); }
    require(id) { const m = this.messages.get(id); if (!m)
        throw new Error('Message not found'); return m; }
    maybeFail(id) { if (this.failures.has(id))
        throw new Error('Provider temporarily unavailable'); }
}
export class DisabledGmailProvider {
    kind = 'gmail';
    fail() { throw new Error('Live Gmail mode is disabled. Configure the secure backend before use.'); }
    async listMetadata() { return this.fail(); }
    async currentMetadata() { return this.fail(); }
    async trash() { return this.fail(); }
    async restore() { return this.fail(); }
}
