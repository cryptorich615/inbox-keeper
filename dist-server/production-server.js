import { createServer, } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { loadProductionConfig } from "./production-config.js";
import { accessSecret } from "./gcp-secrets.js";
import { GoogleCloudKms } from "./gcp-kms.js";
import { LocalFileKms, readLocalSecret } from "./local-file-kms.js";
import { TokenEnvelopeCipher } from "./kms.js";
import { PostgresDatabase, PostgresTokenRepository, PROTECTION_VERSION_BACKFILL_SQL } from "./postgres.js";
import { GoogleOAuthHttp, GmailHttpProvider } from "./google-provider.js";
import { authorizationUrl, pkce, opaqueState, safeEqual } from "./security.js";
import { GoogleOidcVerifier } from "./task-auth.js";
import { isOAuthCallback, isPublicFrontendRequest } from "./route-policy.js";
import { extractBrandKey } from "./brand-extraction.js";
import { classifyMessage, getCategoryDescriptors, } from "./category-classifier.js";
const sha = (value) => createHash("sha256").update(value).digest("base64url");
class ProtectedSenderSet extends Set {
    has(value) {
        return !/^[^@\s<>]+@[^@\s<>]+$/.test(value) || super.has(value);
    }
}
const cookie = (id, local = false) => `${local ? "inbox_local_session" : "__Host-inbox_session"}=${encodeURIComponent(id)}; Path=/; HttpOnly; ${local ? "" : "Secure; "}SameSite=Lax; Max-Age=1800`;
const json = (res, status, value) => {
    res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
    });
    res.end(JSON.stringify(value));
};
const body = async (req) => {
    if (!String(req.headers["content-type"] || "").startsWith("application/json"))
        throw Object.assign(new Error("JSON required"), { status: 415 });
    let total = 0, text = "";
    for await (const chunk of req) {
        total += chunk.length;
        if (total > 65536)
            throw Object.assign(new Error("Body too large"), { status: 413 });
        text += chunk;
    }
    return JSON.parse(text || "{}");
};
const sessionId = (req) => /\b(?:__Host-inbox_session|inbox_local_session)=([^;]+)/.exec(String(req.headers.cookie || ""))?.[1];
async function main() {
    const cfg = loadProductionConfig(), clientSecret = cfg.localTest
        ? await readLocalSecret(cfg.googleClientSecretResource)
        : await accessSecret(cfg.googleClientSecretResource), clientId = cfg.localTest
        ? await readLocalSecret(cfg.googleClientId)
        : cfg.googleClientId, db = new PostgresDatabase(cfg.databaseUrl);
    await db.migrate();
    const kms = cfg.localTest
        ? await LocalFileKms.fromFile(cfg.kmsKeyName)
        : new GoogleCloudKms(cfg.kmsKeyName), cipher = new TokenEnvelopeCipher(kms), tokens = new PostgresTokenRepository(db), oauth = new GoogleOAuthHttp({
        clientId,
        clientSecret,
        redirectUri: cfg.googleRedirectUri,
    });
    const taskAuth = cfg.localTest
        ? null
        : new GoogleOidcVerifier(cfg.taskAudience, cfg.taskServiceAccount), dist = resolve("dist");
    let ready = true;
    const getSession = async (req) => {
        const raw = sessionId(req);
        if (!raw)
            return null;
        const { rows } = await db.pool.query('SELECT id_hash,user_id AS "userId",csrf_hash,expires_at FROM sessions WHERE id_hash=$1 AND expires_at>now()', [sha(decodeURIComponent(raw))]);
        return rows[0] ? { ...rows[0], raw } : null;
    };
    const requireMutation = (req, s) => {
        if (req.headers.origin !== cfg.appOrigin)
            throw Object.assign(new Error("Origin rejected"), { status: 403 });
        const csrf = String(req.headers["x-csrf-token"] || "");
        if (!csrf || !safeEqual(sha(csrf), s.csrf_hash))
            throw Object.assign(new Error("CSRF rejected"), { status: 403 });
    };
    const access = async (userId) => db.transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `gmail-refresh:${userId}`,
        ]);
        const { rows } = await client.query("SELECT ciphertext FROM token_envelopes WHERE user_id=$1 FOR UPDATE", [userId]);
        if (!rows[0])
            throw new Error("Gmail not connected");
        const value = await cipher.decrypt(rows[0].ciphertext);
        if (value.expiresAt > Date.now() + 60_000)
            return value.accessToken;
        const refreshed = await oauth.refresh(value.refreshToken), updated = {
            ...value,
            ...refreshed,
            scopes: refreshed.scopes ?? value.scopes,
        }, sealed = await cipher.encrypt(updated);
        await client.query("UPDATE token_envelopes SET ciphertext=$1,key_id=$2,scopes=$3,expires_at=$4,updated_at=now() WHERE user_id=$5", [
            sealed,
            cipher.keyId,
            updated.scopes,
            new Date(updated.expiresAt),
            userId,
        ]);
        return updated.accessToken;
    });
    const protections = async (userId) => {
        const [{ rows }, state] = await Promise.all([db.pool.query("SELECT kind,value,version FROM protections WHERE user_id=$1", [userId]), db.pool.query("SELECT version FROM protection_versions WHERE user_id=$1", [userId])]);
        return {
            senders: new ProtectedSenderSet(rows
                .filter((r) => r.kind === "sender")
                .map((r) => String(r.value).toLowerCase())),
            domains: new Set(rows
                .filter((r) => r.kind === "domain")
                .map((r) => String(r.value).toLowerCase())),
            version: state.rows[0] ? Number(state.rows[0].version) : Math.max(0, ...rows.map((r) => Number(r.version))),
        };
    };
    const isProtected = (addressInput, rules) => {
        const address = addressInput.trim().toLowerCase();
        if (!/^[^@\s<>]+@[^@\s<>]+$/.test(address))
            return true;
        const domain = address.slice(address.lastIndexOf("@") + 1);
        return rules.senders.has(address) || rules.domains.has(domain);
    };
    const serve = async (req, res) => {
        let pathname = new URL(req.url || "/", cfg.appOrigin).pathname;
        if (pathname === "/" || !extname(pathname))
            pathname = "/index.html";
        const file = resolve(dist, `.${pathname}`);
        if (!file.startsWith(dist) || !existsSync(file))
            return false;
        const info = await stat(file);
        if (!info.isFile())
            return false;
        const types = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
        };
        res.writeHead(200, {
            "content-type": types[extname(file)] || "application/octet-stream",
            "cache-control": pathname === "/index.html"
                ? "no-cache"
                : "public, max-age=31536000, immutable",
            "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        });
        createReadStream(file).pipe(res);
        return true;
    };
    const server = createServer(async (req, res) => {
        const requestId = randomUUID();
        res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
        res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
        res.setHeader("x-frame-options", "DENY");
        try {
            if (req.method === "GET" && req.url === "/healthz")
                return json(res, 200, { ok: true });
            if (req.method === "GET" && req.url === "/readyz") {
                if (!ready)
                    return json(res, 503, { ok: false });
                await db.ready();
                return json(res, 200, { ok: true });
            }
            if (req.method === "POST" && req.url === "/internal/tasks/reconcile") {
                if (!taskAuth)
                    throw Object.assign(new Error("Not found"), { status: 404 });
                await taskAuth.verify(req);
                const { rows } = await db.pool.query(`SELECT ji.user_id AS "userId",ji.job_id AS "jobId",ji.message_id AS "messageId",j.action FROM job_items ji JOIN jobs j ON j.user_id=ji.user_id AND j.id=ji.job_id WHERE ji.status='unknown' ORDER BY ji.updated_at LIMIT 50`);
                for (const item of rows) {
                    try {
                        const provider = new GmailHttpProvider(() => access(item.userId)), [message] = await provider.currentMetadata([item.messageId]), trashed = message.labels.includes("TRASH"), confirmed = item.action === "trash" ? trashed : !trashed;
                        await db.pool.query(`UPDATE job_items SET status=$1,reason=$2,updated_at=now() WHERE user_id=$3 AND job_id=$4 AND message_id=$5`, [
                            confirmed ? "succeeded" : "unknown",
                            confirmed ? "reconciled" : "provider state not yet confirmed",
                            item.userId,
                            item.jobId,
                            item.messageId,
                        ]);
                    }
                    catch { }
                }
                return json(res, 200, { processed: rows.length });
            }
            if (req.method === "POST" &&
                req.url === "/internal/scheduler/reconcile") {
                if (!taskAuth)
                    throw Object.assign(new Error("Not found"), { status: 404 });
                await taskAuth.verify(req);
                return json(res, 202, {
                    accepted: true,
                    worker: "/internal/tasks/reconcile",
                });
            }
            if (req.method === "POST" && req.url === "/api/session") {
                if (req.headers.origin !== cfg.appOrigin)
                    throw Object.assign(new Error("Origin rejected"), { status: 403 });
                const raw = randomBytes(32).toString("base64url"), csrf = randomBytes(24).toString("base64url");
                await db.pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,NULL,$2,now()+interval '30 minutes')", [sha(raw), sha(csrf)]);
                res.setHeader("set-cookie", cookie(raw, cfg.localTest));
                return json(res, 201, { csrfToken: csrf, mode: "disconnected" });
            }
            if (isPublicFrontendRequest(req.method, req.url)) {
                if (await serve(req, res))
                    return;
                return json(res, 404, { error: "Not found" });
            }
            const session = await getSession(req);
            if (!session)
                throw Object.assign(new Error("Session required"), { status: 401 });
            if (req.method === "GET" && req.url === "/api/status") {
                const csrf = randomBytes(24).toString("base64url");
                await db.pool.query("UPDATE sessions SET csrf_hash=$1 WHERE id_hash=$2", [sha(csrf), session.id_hash]);
                if (!session.userId)
                    return json(res, 200, {
                        mode: "disconnected",
                        liveEnabled: true,
                        provider: "gmail",
                        scopes: [],
                        csrfToken: csrf,
                    });
                const token = await tokens.get(session.userId), { rows } = await db.pool.query("SELECT email FROM users WHERE id=$1", [session.userId]), scopes = token?.scopes ?? [], mode = scopes.includes("https://www.googleapis.com/auth/gmail.modify")
                    ? "cleanup"
                    : "readonly";
                return json(res, 200, {
                    mode,
                    liveEnabled: true,
                    provider: "gmail",
                    scopes,
                    csrfToken: csrf,
                    email: rows[0]?.email,
                });
            }
            if (req.method === "POST" && req.url === "/api/oauth/start") {
                requireMutation(req, session);
                const input = await body(req), pair = pkce(), state = opaqueState(), sealed = await cipher.encrypt({ verifier: pair.verifier, state });
                await db.pool.query("UPDATE sessions SET oauth_state_hash=$1,pkce_ciphertext=$2 WHERE id_hash=$3", [sha(state), sealed, session.id_hash]);
                return json(res, 200, {
                    authorizationUrl: authorizationUrl({
                        clientId,
                        redirectUri: cfg.googleRedirectUri,
                        state,
                        challenge: pair.challenge,
                        cleanup: input.cleanup === true,
                    }),
                });
            }
            if (req.method === "GET" && isOAuthCallback(req.url)) {
                const u = new URL(req.url || "/api/oauth/callback", cfg.appOrigin), state = u.searchParams.get("state") || "", code = u.searchParams.get("code") || "";
                const { rows } = await db.pool.query("DELETE FROM sessions WHERE id_hash=$1 AND oauth_state_hash=$2 AND expires_at>now() RETURNING pkce_ciphertext", [session.id_hash, sha(state)]);
                if (!rows[0] || !code)
                    throw Object.assign(new Error("OAuth callback rejected"), {
                        status: 400,
                    });
                const saved = await cipher.decrypt(rows[0].pkce_ciphertext), grant = await oauth.exchangeCode({
                    code,
                    verifier: saved.verifier,
                    redirectUri: cfg.googleRedirectUri,
                }), userId = `google:${grant.identity.sub}`;
                if (!grant.refreshToken)
                    throw new Error("Offline authorization was not granted");
                const stored = {
                    refreshToken: grant.refreshToken,
                    accessToken: grant.accessToken,
                    expiresAt: grant.expiresAt,
                    scopes: grant.scopes,
                    email: grant.identity.email,
                }, sealed = await cipher.encrypt(stored);
                await db.transaction(async (c) => {
                    await c.query("INSERT INTO users(id,google_subject,email) VALUES($1,$2,$3) ON CONFLICT(google_subject) DO UPDATE SET email=EXCLUDED.email", [userId, grant.identity.sub, grant.identity.email ?? null]);
                    await c.query(`INSERT INTO token_envelopes(user_id,ciphertext,key_id,scopes,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,key_id=EXCLUDED.key_id,scopes=EXCLUDED.scopes,expires_at=EXCLUDED.expires_at,updated_at=now()`, [
                        userId,
                        sealed,
                        cipher.keyId,
                        stored.scopes,
                        new Date(stored.expiresAt),
                    ]);
                    const raw = randomBytes(32).toString("base64url"), csrf = randomBytes(24).toString("base64url");
                    await c.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')", [sha(raw), userId, sha(csrf)]);
                    res.setHeader("set-cookie", cookie(raw, cfg.localTest));
                    res.setHeader("x-csrf-token", csrf);
                });
                res.writeHead(303, { location: "/" });
                return res.end();
            }
            if (req.method === "POST" && req.url === "/api/sync") {
                requireMutation(req, session);
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), {
                        status: 409,
                    });
                const provider = new GmailHttpProvider(() => access(session.userId));
                const page = await provider.listMetadata();
                for (const message of page.items)
                    await db.pool.query("INSERT INTO message_cache(user_id,message_id,metadata) VALUES($1,$2,$3) ON CONFLICT(user_id,message_id) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=now()", [session.userId, message.id, message]);
                return json(res, 200, {
                    messages: page.items,
                    nextPageToken: page.nextPageToken,
                });
            }
            if (req.method === "GET" && req.url === "/api/messages") {
                const { rows } = await db.pool.query("SELECT metadata FROM message_cache WHERE user_id=$1 ORDER BY updated_at DESC", [session.userId]);
                return json(res, 200, { messages: rows.map((r) => r.metadata) });
            }
            if (req.method === "GET" && req.url === "/api/brands") {
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), { status: 409 });
                const { rows: messages } = await db.pool.query("SELECT metadata FROM message_cache WHERE user_id=$1", [session.userId]);
                const { rows: overrides } = await db.pool.query("SELECT brand_key, display_name, merged_keys FROM user_brand_overrides");
                const overrideMap = new Map();
                for (const r of overrides) {
                    overrideMap.set(r.brand_key, { displayName: r.display_name, mergedKeys: r.merged_keys ?? [] });
                }
                const buckets = new Map();
                for (const row of messages) {
                    const m = row.metadata;
                    const sender = String(m.fromAddress || "");
                    const ext = extractBrandKey(sender);
                    const override = overrideMap.get(ext.brandKey);
                    const finalKey = override?.mergedKeys?.length ? ext.brandKey : ext.brandKey;
                    const displayName = override?.displayName ?? ext.displayName;
                    const bucket = buckets.get(finalKey) ?? {
                        brandKey: finalKey,
                        displayName,
                        isCustom: !!override || ext.isCustom,
                        totalMessages: 0,
                        categories: { receipts: 0, shipping: 0, promotions: 0, newsletters: 0, statements: 0, surveys: 0, account: 0, personal: 0 },
                        lastMessageAt: m.receivedAt ?? "1970-01-01T00:00:00Z",
                        storageBytes: 0,
                        sampleSenders: new Set(),
                    };
                    bucket.totalMessages += 1;
                    const cat = classifyMessage({
                        subject: String(m.subject ?? ""),
                        snippet: String(m.snippet ?? ""),
                        fromAddress: sender,
                        hasListUnsubscribe: false,
                        hasAttachments: !!m.hasAttachment,
                    });
                    bucket.categories[cat.category] += 1;
                    bucket.storageBytes += Number(m.sizeEstimate ?? 0);
                    if (sender && bucket.sampleSenders.size < 5)
                        bucket.sampleSenders.add(sender);
                    const received = String(m.receivedAt ?? "");
                    if (received && received > bucket.lastMessageAt)
                        bucket.lastMessageAt = received;
                    buckets.set(finalKey, bucket);
                }
                const out = [...buckets.values()]
                    .map((b) => ({
                    brandKey: b.brandKey,
                    displayName: b.displayName,
                    isCustom: b.isCustom,
                    totalMessages: b.totalMessages,
                    categories: b.categories,
                    lastMessageAt: b.lastMessageAt,
                    storageBytes: b.storageBytes,
                    sampleSenders: [...b.sampleSenders],
                }))
                    .sort((a, b) => b.totalMessages - a.totalMessages);
                return json(res, 200, { brands: out });
            }
            if (req.method === "GET" && req.url?.startsWith("/api/brands/") && !req.url.endsWith("/rename")) {
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), { status: 409 });
                const brandKey = decodeURIComponent(req.url.slice("/api/brands/".length));
                const { rows: messages } = await db.pool.query("SELECT metadata FROM message_cache WHERE user_id=$1", [session.userId]);
                const { rows: overrides } = await db.pool.query("SELECT brand_key, display_name FROM user_brand_overrides WHERE brand_key=$1", [brandKey]);
                const override = overrides[0];
                const categories = {
                    receipts: [], shipping: [], promotions: [], newsletters: [],
                    statements: [], surveys: [], account: [], personal: [],
                };
                let displayName = override?.display_name ?? brandKey;
                let isCustom = !!override;
                let totalMessages = 0;
                for (const row of messages) {
                    const m = row.metadata;
                    const ext = extractBrandKey(String(m.fromAddress || ""));
                    if (ext.brandKey !== brandKey)
                        continue;
                    if (!override)
                        displayName = ext.displayName;
                    isCustom = isCustom || ext.isCustom;
                    const cat = classifyMessage({
                        subject: String(m.subject ?? ""),
                        snippet: String(m.snippet ?? ""),
                        fromAddress: String(m.fromAddress ?? ""),
                        hasListUnsubscribe: false,
                        hasAttachments: !!m.hasAttachment,
                    });
                    categories[cat.category].push(m);
                    totalMessages += 1;
                }
                return json(res, 200, { brandKey, displayName, isCustom, totalMessages, categories });
            }
            if (req.method === "POST" && req.url?.startsWith("/api/brands/") && req.url.endsWith("/rename")) {
                requireMutation(req, session);
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), { status: 409 });
                const brandKey = decodeURIComponent(req.url.slice("/api/brands/".length, -"/rename".length));
                const input = await body(req);
                const newName = String(input.displayName ?? "").trim();
                if (!newName || newName.length > 80)
                    throw Object.assign(new Error("Invalid displayName"), { status: 400 });
                await db.pool.query("INSERT INTO user_brand_overrides(brand_key, display_name) VALUES($1,$2) ON CONFLICT(brand_key) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=now()", [brandKey, newName]);
                return json(res, 200, { brandKey, displayName: newName, isCustom: true });
            }
            if (req.method === "GET" && req.url === "/api/categories") {
                return json(res, 200, { categories: getCategoryDescriptors() });
            }
            if (req.method === "GET" && req.url === "/api/activity") {
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), { status: 409 });
                const { rows } = await db.pool.query("SELECT id,event_type AS \"eventType\",event,created_at AS \"createdAt\" FROM audit WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500", [session.userId]);
                return json(res, 200, { events: rows });
            }
            if (req.method === "GET" && req.url === "/api/protections") {
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), { status: 409 });
                const rules = await protections(session.userId);
                return json(res, 200, {
                    senders: [...rules.senders],
                    domains: [...rules.domains],
                    version: rules.version,
                });
            }
            if (req.method === "PUT" && req.url === "/api/protections") {
                requireMutation(req, session);
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), {
                        status: 409,
                    });
                const input = await body(req);
                if (!Array.isArray(input.senders) ||
                    !Array.isArray(input.domains) ||
                    !Number.isSafeInteger(input.expectedVersion) ||
                    input.expectedVersion < 0 ||
                    input.senders.length > 1000 ||
                    input.domains.length > 1000)
                    throw Object.assign(new Error("Invalid protection rules"), {
                        status: 400,
                    });
                const clean = (v) => String(v).trim().toLowerCase(), senders = [
                    ...new Set(input.senders
                        .map(clean)
                        .filter((v) => /^[^@\s]+@[^@\s]+$/.test(v))),
                ], domains = [
                    ...new Set(input.domains
                        .map(clean)
                        .filter((v) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(v))),
                ];
                const version = await db.transaction(async (c) => {
                    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
                        session.userId,
                    ]);
                    await c.query(PROTECTION_VERSION_BACKFILL_SQL, [session.userId]);
                    const current = await c.query("SELECT version FROM protection_versions WHERE user_id=$1", [session.userId]), currentVersion = current.rows[0] ? Number(current.rows[0].version) : 0;
                    if (currentVersion !== input.expectedVersion)
                        return null;
                    const next = currentVersion + 1;
                    await c.query("DELETE FROM protections WHERE user_id=$1", [
                        session.userId,
                    ]);
                    for (const value of senders)
                        await c.query("INSERT INTO protections(user_id,kind,value,version) VALUES($1,'sender',$2,$3)", [session.userId, value, next]);
                    for (const value of domains)
                        await c.query("INSERT INTO protections(user_id,kind,value,version) VALUES($1,'domain',$2,$3)", [session.userId, value, next]);
                    await c.query("INSERT INTO protection_versions(user_id,version) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version", [session.userId, next]);
                    return next;
                });
                if (version === null)
                    throw Object.assign(new Error("Protected mail changed in another session. Latest rules were reloaded; review and retry your change."), { status: 409 });
                return json(res, 200, { version, senders, domains });
            }
            if (req.method === "POST" && req.url === "/api/protections/senders") {
                requireMutation(req, session);
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), { status: 409 });
                const input = await body(req);
                if (!Array.isArray(input.senders) || input.senders.length < 1 || input.senders.length > 500)
                    throw Object.assign(new Error("Select between 1 and 500 senders"), { status: 400 });
                const senders = [...new Set(input.senders.map((v) => String(v).trim().toLowerCase()).filter((v) => /^[^@\s]+@[^@\s]+$/.test(v)))];
                if (!senders.length)
                    throw Object.assign(new Error("No valid sender addresses"), { status: 400 });
                const version = await db.transaction(async (c) => {
                    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [session.userId]);
                    await c.query(PROTECTION_VERSION_BACKFILL_SQL, [session.userId]);
                    const current = await c.query("SELECT version FROM protection_versions WHERE user_id=$1", [session.userId]), next = (current.rows[0] ? Number(current.rows[0].version) : 0) + 1;
                    for (const value of senders)
                        await c.query("INSERT INTO protections(user_id,kind,value,version) VALUES($1,'sender',$2,$3) ON CONFLICT(user_id,kind,value) DO UPDATE SET version=EXCLUDED.version", [session.userId, value, next]);
                    await c.query("INSERT INTO protection_versions(user_id,version) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version", [session.userId, next]);
                    return next;
                });
                const rules = await protections(session.userId);
                return json(res, 200, { version, senders: [...rules.senders], domains: [...rules.domains] });
            }
            if (req.method === "POST" && req.url === "/api/previews") {
                requireMutation(req, session);
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), {
                        status: 409,
                    });
                const input = await body(req), ids = Array.isArray(input.ids)
                    ? [
                        ...new Set(input.ids.map((v) => String(v))),
                    ].slice(0, 1000)
                    : [];
                if (!ids.length || !["trash", "restore"].includes(String(input.action)))
                    throw Object.assign(new Error("Invalid preview"), { status: 400 });
                const action = input.action === "restore" ? "restore" : "trash", provider = new GmailHttpProvider(() => access(session.userId)), messages = await provider.currentMetadata(ids), rules = await protections(session.userId), found = new Set(messages.map((m) => m.id)), excluded = messages
                    .filter((m) => isProtected(m.fromAddress, rules))
                    .map((m) => m.id), missing = ids.filter((id) => !found.has(id)), included = ids.filter((id) => found.has(id) && !excluded.includes(id)), previewId = randomUUID(), confirmText = `${action === "trash" ? "MOVE" : "RESTORE"} ${included.length}`;
                await db.pool.query(`INSERT INTO previews(id,session_hash,user_id,action,ids,excluded,rule_version,confirm_text,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes')`, [
                    previewId,
                    session.id_hash,
                    session.userId,
                    action,
                    JSON.stringify(included),
                    JSON.stringify(excluded),
                    rules.version,
                    confirmText,
                ]);
                return json(res, 201, {
                    previewId,
                    action,
                    requestedCount: ids.length,
                    count: included.length,
                    excludedCount: excluded.length,
                    missingCount: missing.length,
                    confirmText,
                    expiresInSeconds: 600,
                });
            }
            if (req.method === "POST" && req.url === "/api/jobs") {
                requireMutation(req, session);
                if (!session.userId)
                    throw Object.assign(new Error("Gmail not connected"), {
                        status: 409,
                    });
                const idempotency = String(req.headers["idempotency-key"] || "");
                if (!idempotency || idempotency.length > 128)
                    throw Object.assign(new Error("Valid Idempotency-Key required"), {
                        status: 400,
                    });
                const prior = await db.pool.query("SELECT result FROM jobs WHERE user_id=$1 AND id=$2", [session.userId, idempotency]);
                if (prior.rows[0]?.result)
                    return json(res, 200, prior.rows[0].result);
                const input = await body(req), claimed = await db.pool.query(`UPDATE previews SET claimed_at=now() WHERE id=$1 AND session_hash=$2 AND user_id=$3 AND claimed_at IS NULL AND expires_at>now() AND (confirm_text IS NULL OR confirm_text=$4) RETURNING action,ids`, [
                    String(input.previewId || ""),
                    session.id_hash,
                    session.userId,
                    String(input.confirmation || ""),
                ]);
                if (!claimed.rows[0])
                    throw Object.assign(new Error("Preview expired, used, or confirmation rejected"), { status: 409 });
                const action = claimed.rows[0].action, ids = claimed.rows[0].ids, provider = new GmailHttpProvider(() => access(session.userId)), items = [];
                await db.pool.query("INSERT INTO jobs(id,user_id,action,status) VALUES($1,$2,$3,'running') ON CONFLICT DO NOTHING", [idempotency, session.userId, action]);
                for (const id of ids) {
                    try {
                        const [message] = await provider.currentMetadata([id]), rules = await protections(session.userId), address = message.fromAddress.toLowerCase(), domain = address.split("@")[1] || "";
                        if (rules.senders.has(address) || rules.domains.has(domain)) {
                            items.push({ id, status: "skipped", reason: "protected" });
                            continue;
                        }
                        await (action === "trash"
                            ? provider.trash(id)
                            : provider.restore(id));
                        items.push({ id, status: "succeeded" });
                    }
                    catch {
                        items.push({
                            id,
                            status: "unknown",
                            reason: "provider outcome requires reconciliation",
                        });
                    }
                    const last = items.at(-1);
                    await db.pool.query("INSERT INTO job_items(user_id,job_id,message_id,status,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,job_id,message_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,updated_at=now()", [
                        session.userId,
                        idempotency,
                        last.id,
                        last.status,
                        last.reason ?? null,
                    ]);
                }
                const result = {
                    jobId: idempotency,
                    action,
                    items,
                    succeeded: items.filter((i) => i.status === "succeeded").length,
                    skipped: items.filter((i) => i.status === "skipped").length,
                    unknown: items.filter((i) => i.status === "unknown").length,
                };
                await db.transaction(async (c) => {
                    await c.query("UPDATE jobs SET status=$1,result=$2,updated_at=now() WHERE user_id=$3 AND id=$4", [
                        result.unknown ? "needs_reconciliation" : "completed",
                        result,
                        session.userId,
                        idempotency,
                    ]);
                    await c.query("INSERT INTO audit(id,user_id,event_type,event) VALUES($1,$2,'cleanup_job',$3)", [randomUUID(), session.userId, result]);
                });
                return json(res, 200, result);
            }
            if (req.method === "POST" && req.url === "/api/disconnect") {
                requireMutation(req, session);
                if (session.userId) {
                    const row = await tokens.get(session.userId);
                    if (row) {
                        const value = await cipher.decrypt(row.ciphertext);
                        await oauth.revoke(value.refreshToken).catch(() => { });
                        await tokens.delete(session.userId);
                    }
                }
                await db.pool.query("DELETE FROM sessions WHERE id_hash=$1", [
                    session.id_hash,
                ]);
                res.setHeader("set-cookie", cookie("", cfg.localTest).replace("Max-Age=1800", "Max-Age=0"));
                return json(res, 200, { ok: true });
            }
            if (req.method === "DELETE" && req.url === "/api/account") {
                requireMutation(req, session);
                if (session.userId) {
                    const row = await tokens.get(session.userId);
                    if (row) {
                        const value = await cipher.decrypt(row.ciphertext);
                        await oauth.revoke(value.refreshToken).catch(() => { });
                    }
                    await db.pool.query("DELETE FROM users WHERE id=$1", [
                        session.userId,
                    ]);
                }
                else
                    await db.pool.query("DELETE FROM sessions WHERE id_hash=$1", [
                        session.id_hash,
                    ]);
                res.setHeader("set-cookie", cookie("", cfg.localTest).replace("Max-Age=1800", "Max-Age=0"));
                return json(res, 200, { ok: true });
            }
            if (req.method === "GET" && (await serve(req, res)))
                return;
            throw Object.assign(new Error("Not found"), { status: 404 });
        }
        catch (error) {
            const status = typeof error.status === "number"
                ? error.status
                : 500;
            json(res, status, {
                error: status >= 500 ? "Request failed safely" : error.message,
                requestId,
            });
        }
    });
    server.listen(cfg.port, cfg.localTest ? "127.0.0.1" : "0.0.0.0");
    const shutdown = async () => {
        ready = false;
        server.close(async () => {
            await db.close();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
main().catch(() => {
    process.stderr.write("Production startup failed safely.\n");
    process.exit(1);
});
