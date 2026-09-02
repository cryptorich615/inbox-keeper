async function safeJson(response) { try {
    return await response.json();
}
catch {
    throw new Error('Google returned an invalid response');
} }
export class GoogleOAuthHttp {
    cfg;
    http;
    constructor(cfg, http = fetch) {
        this.cfg = cfg;
        this.http = http;
    }
    async exchangeCode(input) {
        if (input.redirectUri !== this.cfg.redirectUri)
            throw new Error('OAuth redirect mismatch');
        const response = await this.http('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, code: input.code, code_verifier: input.verifier, redirect_uri: input.redirectUri, grant_type: 'authorization_code' }) });
        if (!response.ok)
            throw new Error('Google authorization failed');
        const token = await safeJson(response);
        if (typeof token.access_token !== 'string' || typeof token.id_token !== 'string')
            throw new Error('Google authorization response was incomplete');
        // Verify identity through Google's authenticated endpoint. Tokens never appear in URLs or logs.
        const verify = await this.http('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
        if (!verify.ok)
            throw new Error('Google identity verification failed');
        const identity = await safeJson(verify);
        if (typeof identity.sub !== 'string' || identity.email_verified === false)
            throw new Error('Google identity verification failed');
        return { accessToken: token.access_token, refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : undefined, expiresAt: Date.now() + Number(token.expires_in ?? 3600) * 1000, scopes: String(token.scope ?? '').split(' ').filter(Boolean), identity: { sub: identity.sub, email: typeof identity.email === 'string' ? identity.email : undefined } };
    }
    async refresh(refreshToken) { const response = await this.http('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) }); if (!response.ok)
        throw new Error('Google session refresh failed'); const token = await safeJson(response); if (typeof token.access_token !== 'string')
        throw new Error('Google session refresh response was incomplete'); return { accessToken: token.access_token, expiresAt: Date.now() + Number(token.expires_in ?? 3600) * 1000, scopes: typeof token.scope === 'string' ? token.scope.split(' ').filter(Boolean) : undefined }; }
    async revoke(token) { const response = await this.http('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }); if (!response.ok)
        throw new Error('Google authorization revocation failed'); }
}
export class GmailHttpProvider {
    access;
    http;
    kind = 'gmail';
    constructor(access, http = fetch) {
        this.access = access;
        this.http = http;
    }
    async call(path, init = {}) { const response = await this.http(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${await this.access()}` } }); if (!response.ok)
        throw new Error(response.status === 429 || response.status >= 500 ? 'Gmail temporarily unavailable' : 'Gmail request rejected'); return response; }
    async listMetadata(pageToken) { const query = new URLSearchParams({ maxResults: '500' }); if (pageToken)
        query.set('pageToken', pageToken); const list = await safeJson(await this.call(`/messages?${query}`)), items = []; for (const item of Array.isArray(list.messages) ? list.messages : [])
        if (item && typeof item === 'object' && typeof item.id === 'string')
            items.push(await this.getOne(item.id)); return { items, nextPageToken: typeof list.nextPageToken === 'string' ? list.nextPageToken : undefined }; }
    async currentMetadata(ids) { return Promise.all(ids.map(id => this.getOne(id))); }
    async getOne(id) { const data = await safeJson(await this.call(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)), payload = data.payload, headers = Object.fromEntries((payload?.headers ?? []).map(h => [String(h.name).toLowerCase(), String(h.value)])), from = headers.from ?? '', match = /^(.*?)(?:\s*<([^>]+)>)?$/.exec(from), labels = Array.isArray(data.labelIds) ? data.labelIds.map(String) : []; return { id: String(data.id), threadId: String(data.threadId), fromName: (match?.[1] || from).replace(/^"|"$/g, '').trim(), fromAddress: (match?.[2] || from).toLowerCase(), subject: headers.subject || '(no subject)', receivedAt: new Date(Number(data.internalDate || 0)).toISOString(), sizeEstimate: Number(data.sizeEstimate || 0), labels, unread: labels.includes('UNREAD'), starred: labels.includes('STARRED'), hasAttachment: false }; }
    async trash(id) { await this.call(`/messages/${encodeURIComponent(id)}/trash`, { method: 'POST' }); }
    async restore(id) { await this.call(`/messages/${encodeURIComponent(id)}/untrash`, { method: 'POST' }); }
}
