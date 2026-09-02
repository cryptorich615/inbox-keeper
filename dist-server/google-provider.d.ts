import type { GoogleOAuthAdapter, GoogleTokens } from './google-adapter.js';
import type { MailProvider, NormalizedMessage, Page } from './domain.js';
export interface GoogleConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
type Fetch = typeof fetch;
export declare class GoogleOAuthHttp implements GoogleOAuthAdapter {
    private cfg;
    private http;
    constructor(cfg: GoogleConfig, http?: Fetch);
    exchangeCode(input: {
        code: string;
        verifier: string;
        redirectUri: string;
    }): Promise<GoogleTokens>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        expiresAt: number;
        scopes: string[] | undefined;
    }>;
    revoke(token: string): Promise<void>;
}
export declare class GmailHttpProvider implements MailProvider {
    private access;
    private http;
    readonly kind: 'gmail';
    constructor(access: () => Promise<string>, http?: Fetch);
    private call;
    listMetadata(pageToken?: string): Promise<Page<NormalizedMessage>>;
    currentMetadata(ids: string[]): Promise<NormalizedMessage[]>;
    private getOne;
    trash(id: string): Promise<void>;
    restore(id: string): Promise<void>;
}
export {};
