import { Pool, type PoolClient } from 'pg';
export declare const PROTECTION_VERSION_BACKFILL_SQL = "INSERT INTO protection_versions(user_id,version) SELECT $1,COALESCE(MAX(version),0) FROM protections WHERE user_id=$1 ON CONFLICT(user_id) DO UPDATE SET version=GREATEST(protection_versions.version,EXCLUDED.version)";
export declare const MIGRATION_001 = "\nCREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());\nCREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY, google_subject text UNIQUE NOT NULL, email text, created_at timestamptz NOT NULL DEFAULT now());\nCREATE TABLE IF NOT EXISTS sessions(id_hash text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, oauth_state_hash text, pkce_ciphertext text);\nCREATE TABLE IF NOT EXISTS protections(user_id text REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('sender','domain')), value text NOT NULL, version bigint NOT NULL, PRIMARY KEY(user_id,kind,value));\nCREATE TABLE IF NOT EXISTS protection_versions(user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, version bigint NOT NULL DEFAULT 0);\nINSERT INTO protection_versions(user_id,version)\nSELECT user_id,MAX(version) FROM protections GROUP BY user_id\nON CONFLICT(user_id) DO UPDATE SET version=GREATEST(protection_versions.version,EXCLUDED.version);\nCREATE TABLE IF NOT EXISTS previews(id uuid PRIMARY KEY, session_hash text NOT NULL, user_id text REFERENCES users(id) ON DELETE CASCADE, action text NOT NULL CHECK(action IN ('trash','restore')), ids jsonb NOT NULL, excluded jsonb NOT NULL, rule_version bigint NOT NULL, confirm_text text, expires_at timestamptz NOT NULL, claimed_at timestamptz);\nCREATE TABLE IF NOT EXISTS jobs(id text NOT NULL, user_id text REFERENCES users(id) ON DELETE CASCADE, action text NOT NULL, status text NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id));\nCREATE TABLE IF NOT EXISTS job_items(user_id text NOT NULL, job_id text NOT NULL, message_id text NOT NULL, status text NOT NULL, reason text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,job_id,message_id), FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE CASCADE);\nCREATE INDEX IF NOT EXISTS job_items_unknown_idx ON job_items(user_id,status) WHERE status='unknown';\nCREATE TABLE IF NOT EXISTS audit(id uuid PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, event_type text NOT NULL, event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());\nCREATE TABLE IF NOT EXISTS token_envelopes(user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, ciphertext text NOT NULL, key_id text NOT NULL, scopes text[] NOT NULL DEFAULT '{}', expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());\nCREATE TABLE IF NOT EXISTS message_cache(user_id text REFERENCES users(id) ON DELETE CASCADE, message_id text NOT NULL, metadata jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,message_id));\nINSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;\nCREATE TABLE IF NOT EXISTS user_brand_overrides(brand_key text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, display_name text NOT NULL, merged_keys text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());\nCREATE TABLE IF NOT EXISTS user_category_overrides(user_id text REFERENCES users(id) ON DELETE CASCADE, message_id text NOT NULL, category text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,message_id));\nINSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;";
export declare class PostgresDatabase {
    readonly pool: Pool;
    constructor(connectionString: string);
    migrate(): Promise<void>;
    ready(): Promise<void>;
    close(): Promise<void>;
    transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}
export declare class PostgresTokenRepository {
    private db;
    constructor(db: PostgresDatabase);
    put(userId: string, ciphertext: string, keyId: string, scopes: string[], expiresAt?: number): Promise<void>;
    get(userId: string): Promise<any>;
    delete(userId: string): Promise<void>;
}
export declare class PostgresProtectionRepository {
    private db;
    constructor(db: PostgresDatabase);
    get(userId: string): Promise<{
        senders: Set<any>;
        domains: Set<any>;
        version: number;
    }>;
    replace(userId: string, senders: string[], domains: string[], expectedVersion: number): Promise<number | null>;
    add(userId: string, senders: string[], domains?: string[]): Promise<number>;
}
