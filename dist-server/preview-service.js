import { protectedMessage } from './domain.js';
import { PublicError } from './http-security.js';
export class PreviewService {
    provider;
    store;
    constructor(provider, store) {
        this.provider = provider;
        this.store = store;
    }
    async create(input) { const unique = [...new Set(input.ids)]; if (!unique.length || unique.length > 500)
        throw new PublicError(400, 'Select between 1 and 500 messages'); const current = await this.provider.currentMetadata(unique), rules = this.store.protections(input.userId), found = new Map(current.map(m => [m.id, m])), excluded = [], eligible = []; for (const id of unique) {
        const m = found.get(id);
        if (!m || input.action === 'trash' && protectedMessage(m, rules))
            excluded.push(id);
        else
            eligible.push(id);
    } const confirmText = eligible.length >= 50 ? `MOVE ${eligible.length}` : null; return this.store.createPreview({ sessionId: input.sessionId, userId: input.userId, action: input.action, ids: eligible, excluded, ruleVersion: rules.version, confirmText, expiresAt: Date.now() + 5 * 60_000 }); }
    async validate(input) { const p = this.store.preview(input.previewId); if (!p || p.sessionId !== input.sessionId || p.userId !== input.userId)
        throw new PublicError(404, 'Preview not found'); if (p.used || p.expiresAt < Date.now())
        throw new PublicError(409, 'Preview expired or already used'); if (p.confirmText && input.confirmation !== p.confirmText)
        throw new PublicError(400, 'Typed confirmation does not match'); const rules = this.store.protections(input.userId); if (rules.version !== p.ruleVersion)
        throw new PublicError(409, 'Protection rules changed. Create a new preview.'); if (!this.store.consumePreview(p.id))
        throw new PublicError(409, 'Preview expired or already used'); return p; }
}
