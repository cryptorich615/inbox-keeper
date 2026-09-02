import type { GoogleOAuthAdapter, GoogleTokens } from './google-adapter.js';
import type { SqliteStore } from './store.js';
import { TokenEnvelopeCipher } from './kms.js';
export interface StoredGoogleTokens {
    refreshToken: string;
    accessToken: string;
    expiresAt: number;
    scopes: string[];
    email?: string;
}
export declare class GoogleTokenService {
    private store;
    private cipher;
    private oauth;
    private refreshes;
    constructor(store: SqliteStore, cipher: TokenEnvelopeCipher, oauth: GoogleOAuthAdapter);
    save(userId: string, tokens: GoogleTokens): Promise<void>;
    load(userId: string): Promise<StoredGoogleTokens | null>;
    access(userId: string): Promise<string>;
    private doRefresh;
    disconnect(userId: string): Promise<void>;
}
