export declare function pkce(): {
    verifier: string;
    challenge: string;
};
export declare function opaqueState(): string;
export declare function safeEqual(a: string, b: string): boolean;
export declare class OAuthStateStore {
    private ttlMs;
    private now;
    private values;
    constructor(ttlMs?: number, now?: () => number);
    issue(): {
        state: string;
        verifier: string;
        challenge: string;
    };
    consume(state: string): string | null;
}
export declare class TokenCipher {
    private key;
    constructor(encodedKey: string);
    encrypt(text: string): string;
    decrypt(value: string): string;
}
export declare const READ_SCOPES: readonly ['openid', 'email', 'https://www.googleapis.com/auth/gmail.metadata'];
export declare const MODIFY_SCOPES: readonly ['https://www.googleapis.com/auth/gmail.modify'];
export declare function authorizationUrl(i: {
    clientId: string;
    redirectUri: string;
    state: string;
    challenge: string;
    cleanup: boolean;
}): string;
