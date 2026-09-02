import { safeEqual } from './security.js';
export function parseCookies(raw = '') { return Object.fromEntries(raw.split(';').map(x => x.trim().split('=')).filter(x => x.length === 2).map(([k, v]) => [k, decodeURIComponent(v)])); }
export function sessionCookie(id, secure) { const name = secure ? '__Host-inbox_session' : 'inbox_session'; return `${name}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure ? '; Secure' : ''}`; }
export function requireSession(req, store) { const cookies = parseCookies(req.headers.cookie), id = cookies['__Host-inbox_session'] || cookies.inbox_session; return id ? store.session(id) : null; }
export function requireMutation(req, session, origin) { if (req.headers.origin !== origin)
    throw new PublicError(403, 'Request origin rejected'); const csrf = String(req.headers['x-csrf-token'] || ''); if (!csrf || !safeEqual(csrf, session.csrf))
    throw new PublicError(403, 'CSRF validation failed'); }
export async function jsonBody(req, max = 65536) { if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json'))
    throw new PublicError(415, 'JSON content type required'); const chunks = []; let size = 0; for await (const c of req) {
    size += c.length;
    if (size > max)
        throw new PublicError(413, 'Request body too large');
    chunks.push(c);
} try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
catch {
    throw new PublicError(400, 'Invalid JSON');
} }
export class PublicError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export function send(res, status, body) { res.statusCode = status; res.end(JSON.stringify(body)); }
