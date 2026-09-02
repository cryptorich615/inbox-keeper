import {Pool, type PoolClient} from 'pg';

export const PROTECTION_VERSION_BACKFILL_SQL='INSERT INTO protection_versions(user_id,version) SELECT $1,COALESCE(MAX(version),0) FROM protections WHERE user_id=$1 ON CONFLICT(user_id) DO UPDATE SET version=GREATEST(protection_versions.version,EXCLUDED.version)';
export const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY, google_subject text UNIQUE NOT NULL, email text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions(id_hash text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, oauth_state_hash text, pkce_ciphertext text);
CREATE TABLE IF NOT EXISTS protections(user_id text REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('sender','domain')), value text NOT NULL, version bigint NOT NULL, PRIMARY KEY(user_id,kind,value));
CREATE TABLE IF NOT EXISTS protection_versions(user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, version bigint NOT NULL DEFAULT 0);
INSERT INTO protection_versions(user_id,version)
SELECT user_id,MAX(version) FROM protections GROUP BY user_id
ON CONFLICT(user_id) DO UPDATE SET version=GREATEST(protection_versions.version,EXCLUDED.version);
CREATE TABLE IF NOT EXISTS previews(id uuid PRIMARY KEY, session_hash text NOT NULL, user_id text REFERENCES users(id) ON DELETE CASCADE, action text NOT NULL CHECK(action IN ('trash','restore')), ids jsonb NOT NULL, excluded jsonb NOT NULL, rule_version bigint NOT NULL, confirm_text text, expires_at timestamptz NOT NULL, claimed_at timestamptz);
CREATE TABLE IF NOT EXISTS jobs(id text NOT NULL, user_id text REFERENCES users(id) ON DELETE CASCADE, action text NOT NULL, status text NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS job_items(user_id text NOT NULL, job_id text NOT NULL, message_id text NOT NULL, status text NOT NULL, reason text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,job_id,message_id), FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS job_items_unknown_idx ON job_items(user_id,status) WHERE status='unknown';
CREATE TABLE IF NOT EXISTS audit(id uuid PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, event_type text NOT NULL, event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS token_envelopes(user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, ciphertext text NOT NULL, key_id text NOT NULL, scopes text[] NOT NULL DEFAULT '{}', expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS message_cache(user_id text REFERENCES users(id) ON DELETE CASCADE, message_id text NOT NULL, metadata jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,message_id));
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS user_brand_overrides(brand_key text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, display_name text NOT NULL, merged_keys text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_category_overrides(user_id text REFERENCES users(id) ON DELETE CASCADE, message_id text NOT NULL, category text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,message_id));
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;`;

export class PostgresDatabase {
  readonly pool: Pool;
  constructor(connectionString: string) {
    const hostname=new URL(connectionString).hostname,loopback=hostname==='localhost'||hostname==='127.0.0.1'||hostname==='::1';
    this.pool = new Pool({connectionString, max: 10, idleTimeoutMillis: 30_000, statement_timeout: 15_000, ssl: loopback ? false : {rejectUnauthorized: true}});
  }
  async migrate() { const client=await this.pool.connect(); try { await client.query('BEGIN'); await client.query(MIGRATION_001); await client.query('COMMIT'); } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  async ready() { await this.pool.query('SELECT 1'); }
  async close() { await this.pool.end(); }
  async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await this.pool.connect();try{await client.query('BEGIN');const out=await fn(client);await client.query('COMMIT');return out}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
}

export class PostgresTokenRepository {
  constructor(private db:PostgresDatabase){}
  async put(userId:string,ciphertext:string,keyId:string,scopes:string[],expiresAt?:number){await this.db.pool.query(`INSERT INTO token_envelopes(user_id,ciphertext,key_id,scopes,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,key_id=EXCLUDED.key_id,scopes=EXCLUDED.scopes,expires_at=EXCLUDED.expires_at,updated_at=now()`,[userId,ciphertext,keyId,scopes,expiresAt?new Date(expiresAt):null])}
  async get(userId:string){const{rows}=await this.db.pool.query('SELECT ciphertext,key_id AS "keyId",scopes,expires_at AS "expiresAt" FROM token_envelopes WHERE user_id=$1',[userId]);return rows[0]??null}
  async delete(userId:string){await this.db.pool.query('DELETE FROM token_envelopes WHERE user_id=$1',[userId])}
}

export class PostgresProtectionRepository {
  constructor(private db:PostgresDatabase){}
  async get(userId:string){const[{rows},{rows:states}]=await Promise.all([this.db.pool.query('SELECT kind,value,version FROM protections WHERE user_id=$1',[userId]),this.db.pool.query('SELECT version FROM protection_versions WHERE user_id=$1',[userId])]);return{senders:new Set(rows.filter(r=>r.kind==='sender').map(r=>r.value)),domains:new Set(rows.filter(r=>r.kind==='domain').map(r=>r.value)),version:states[0]?Number(states[0].version):Math.max(0,...rows.map(r=>Number(r.version)))}}
  async replace(userId:string,senders:string[],domains:string[],expectedVersion:number){return this.db.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[userId]);await c.query(PROTECTION_VERSION_BACKFILL_SQL,[userId]);const locked=await c.query('SELECT version FROM protection_versions WHERE user_id=$1',[userId]),current=Number(locked.rows[0].version);if(current!==expectedVersion)return null;const version=current+1;await c.query('DELETE FROM protections WHERE user_id=$1',[userId]);for(const[kind,values]of [['sender',senders],['domain',domains]]as const)for(const value of values)await c.query('INSERT INTO protections(user_id,kind,value,version) VALUES($1,$2,$3,$4)',[userId,kind,value.toLowerCase(),version]);await c.query('UPDATE protection_versions SET version=$2 WHERE user_id=$1',[userId,version]);return version})}
  async add(userId:string,senders:string[],domains:string[]=[]){return this.db.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[userId]);await c.query(PROTECTION_VERSION_BACKFILL_SQL,[userId]);const locked=await c.query('SELECT version FROM protection_versions WHERE user_id=$1',[userId]),version=Number(locked.rows[0].version)+1;for(const[kind,values]of [['sender',senders],['domain',domains]]as const)for(const value of values)await c.query('INSERT INTO protections(user_id,kind,value,version) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,kind,value) DO UPDATE SET version=EXCLUDED.version',[userId,kind,value.toLowerCase(),version]);await c.query('UPDATE protection_versions SET version=$2 WHERE user_id=$1',[userId,version]);return version})}
}
