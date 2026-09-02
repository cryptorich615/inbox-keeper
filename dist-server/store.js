import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
export class SqliteStore {
    db;
    constructor(path = ':memory:') { this.db = new DatabaseSync(path); this.migrate(); }
    jobKey(userId, id) { return `${userId.length}:${userId}${id}`; }
    migrate() {
        this.db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations VALUES(1);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,oauth_state TEXT,pkce_verifier TEXT);
 CREATE TABLE IF NOT EXISTS protections(user_id TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(user_id,kind,value));
 CREATE TABLE IF NOT EXISTS protection_versions(user_id TEXT PRIMARY KEY,version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS previews(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,user_id TEXT NOT NULL,action TEXT NOT NULL,ids_json TEXT NOT NULL,excluded_json TEXT NOT NULL,rule_version INTEGER NOT NULL,confirm_text TEXT,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS job_items(job_id TEXT NOT NULL,message_id TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,PRIMARY KEY(job_id,message_id));
 CREATE INDEX IF NOT EXISTS job_items_status ON job_items(status);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,event_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS tokens(user_id TEXT PRIMARY KEY,ciphertext TEXT NOT NULL,key_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS metadata(user_id TEXT NOT NULL,message_id TEXT NOT NULL,data_json TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,message_id));`);
    }
    createSession(userId = `anonymous:${randomUUID()}`, ttl = 1800000) { const s = { id: randomBytes(32).toString('base64url'), userId, csrf: randomBytes(24).toString('base64url'), expiresAt: Date.now() + ttl, oauthState: null, pkceVerifier: null }; this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run(s.id, s.userId, s.csrf, s.expiresAt, null, null); return s; }
    session(id) { const r = this.db.prepare('SELECT id,user_id userId,csrf,expires_at expiresAt,oauth_state oauthState,pkce_verifier pkceVerifier FROM sessions WHERE id=?').get(id); if (!r || r.expiresAt <= Date.now()) {
        if (r)
            this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
        return null;
    } return r; }
    rotateSession(id) { const old = this.session(id); if (!old)
        return null; this.db.prepare('DELETE FROM sessions WHERE id=?').run(id); return this.createSession(old.userId); }
    bindOAuth(id, state, verifier) { this.db.prepare('UPDATE sessions SET oauth_state=?,pkce_verifier=? WHERE id=?').run(state, verifier, id); }
    consumeOAuth(id, state) { const s = this.session(id); if (!s || s.oauthState !== state || !s.pkceVerifier)
        return null; this.db.prepare('UPDATE sessions SET oauth_state=NULL,pkce_verifier=NULL WHERE id=?').run(id); return s.pkceVerifier; }
    protections(userId) { const rows = this.db.prepare('SELECT kind,value,version FROM protections WHERE user_id=?').all(userId), state = this.db.prepare('SELECT version FROM protection_versions WHERE user_id=?').get(userId); return { senders: new Set(rows.filter(r => r.kind === 'sender').map(r => r.value)), domains: new Set(rows.filter(r => r.kind === 'domain').map(r => r.value)), version: state?.version ?? Math.max(0, ...rows.map(r => r.version)) }; }
    replaceProtections(userId, senders, domains, expectedVersion = this.protections(userId).version) { this.db.exec('BEGIN'); try {
        const current = this.protections(userId).version;
        if (current !== expectedVersion) {
            this.db.exec('ROLLBACK');
            return null;
        }
        const version = current + 1;
        this.db.prepare('DELETE FROM protections WHERE user_id=?').run(userId);
        const q = this.db.prepare('INSERT INTO protections VALUES(?,?,?,?)');
        senders.forEach(v => q.run(userId, 'sender', v.toLowerCase(), version));
        domains.forEach(v => q.run(userId, 'domain', v.toLowerCase(), version));
        this.db.prepare('INSERT INTO protection_versions VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version').run(userId, version);
        this.db.exec('COMMIT');
        return version;
    }
    catch (e) {
        try {
            this.db.exec('ROLLBACK');
        }
        catch { }
        throw e;
    } }
    addProtections(userId, senders, domains = []) { this.db.exec('BEGIN'); try {
        const current = this.protections(userId), version = current.version + 1, q = this.db.prepare('INSERT INTO protections VALUES(?,?,?,?) ON CONFLICT(user_id,kind,value) DO UPDATE SET version=excluded.version');
        for (const value of new Set(senders.map(v => v.trim().toLowerCase()).filter(Boolean)))
            q.run(userId, 'sender', value, version);
        for (const value of new Set(domains.map(v => v.trim().toLowerCase()).filter(Boolean)))
            q.run(userId, 'domain', value, version);
        this.db.prepare('INSERT INTO protection_versions VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version').run(userId, version);
        this.db.exec('COMMIT');
        return version;
    }
    catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
    } }
    createPreview(p) { const row = { ...p, id: randomUUID(), used: false }; this.db.prepare('INSERT INTO previews VALUES(?,?,?,?,?,?,?,?,?,0)').run(row.id, row.sessionId, row.userId, row.action, JSON.stringify(row.ids), JSON.stringify(row.excluded), row.ruleVersion, row.confirmText, row.expiresAt); return row; }
    preview(id) { const r = this.db.prepare('SELECT id,session_id sessionId,user_id userId,action,ids_json idsJson,excluded_json excludedJson,rule_version ruleVersion,confirm_text confirmText,expires_at expiresAt,used FROM previews WHERE id=?').get(id); if (!r)
        return null; return { ...r, ids: JSON.parse(r.idsJson), excluded: JSON.parse(r.excludedJson), used: !!r.used }; }
    consumePreview(id) { return this.db.prepare('UPDATE previews SET used=1 WHERE id=? AND used=0 AND expires_at>?').run(id, Date.now()).changes === 1; }
    putJob(id, userId, result) { this.db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?,?,?)').run(this.jobKey(userId, id), userId, JSON.stringify(result), Date.now()); }
    job(id, userId) { const r = this.db.prepare('SELECT result_json result FROM jobs WHERE id=? AND user_id=?').get(this.jobKey(userId, id), userId); return r ? JSON.parse(r.result) : null; }
    storedJobId(id, userId) { return this.jobKey(userId, id); }
    appendAudit(userId, event) { this.db.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(randomUUID(), userId, JSON.stringify(event), Date.now()); }
    putToken(userId, ciphertext, keyId) { this.db.prepare('INSERT OR REPLACE INTO tokens VALUES(?,?,?,?)').run(userId, ciphertext, keyId, Date.now()); }
    token(userId) { const row = this.db.prepare('SELECT ciphertext,key_id keyId FROM tokens WHERE user_id=?').get(userId); return row ?? null; }
    deleteToken(userId) { this.db.prepare('DELETE FROM tokens WHERE user_id=?').run(userId); }
    putMetadata(userId, message) { this.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?,?,?)').run(userId, message.id, JSON.stringify(message), Date.now()); }
    metadata(userId) { return this.db.prepare('SELECT data_json data FROM metadata WHERE user_id=? ORDER BY updated_at DESC').all(userId).map(row => JSON.parse(row.data)); }
    unknownJobItems(userId, limit = 50) { return this.db.prepare(`SELECT ji.job_id jobId,ji.message_id messageId,j.result_json result FROM job_items ji JOIN jobs j ON j.id=ji.job_id WHERE j.user_id=? AND ji.status='unknown' LIMIT ?`).all(userId, limit); }
    resolveJobItem(jobId, messageId, status, reason = '') { this.db.prepare('UPDATE job_items SET status=?,reason=? WHERE job_id=? AND message_id=?').run(status, reason, jobId, messageId); }
    deleteUser(userId) { this.db.exec('BEGIN'); try {
        this.db.prepare('DELETE FROM job_items WHERE job_id IN (SELECT id FROM jobs WHERE user_id=?)').run(userId);
        for (const t of ['tokens', 'metadata', 'audit', 'jobs', 'previews', 'protections', 'sessions'])
            this.db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(userId);
        this.db.exec('COMMIT');
    }
    catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
    } }
    close() { this.db.close(); }
}
