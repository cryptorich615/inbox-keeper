export class GoogleTokenService {
    store;
    cipher;
    oauth;
    refreshes = new Map();
    constructor(store, cipher, oauth) {
        this.store = store;
        this.cipher = cipher;
        this.oauth = oauth;
    }
    async save(userId, tokens) { if (!tokens.refreshToken)
        throw new Error('Google did not issue offline authorization'); const value = { refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes, email: tokens.identity.email }; this.store.putToken(userId, await this.cipher.encrypt(value), this.cipher.keyId); }
    async load(userId) { const row = this.store.token(userId); return row ? this.cipher.decrypt(row.ciphertext) : null; }
    async access(userId) { const value = await this.load(userId); if (!value)
        throw new Error('Gmail is not connected'); if (value.expiresAt > Date.now() + 60_000)
        return value.accessToken; const existing = this.refreshes.get(userId); if (existing)
        return existing; const refreshing = this.doRefresh(userId, value).finally(() => this.refreshes.delete(userId)); this.refreshes.set(userId, refreshing); return refreshing; }
    async doRefresh(userId, value) { const next = await this.oauth.refresh(value.refreshToken), updated = { ...value, accessToken: next.accessToken, expiresAt: next.expiresAt, scopes: next.scopes ?? value.scopes }; this.store.putToken(userId, await this.cipher.encrypt(updated), this.cipher.keyId); return next.accessToken; }
    async disconnect(userId) { const value = await this.load(userId); try {
        if (value)
            await this.oauth.revoke(value.refreshToken);
    }
    finally {
        this.store.deleteToken(userId);
    } }
}
