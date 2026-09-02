export interface GoogleTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scopes: string[];
    identity: {
        sub: string;
        email?: string;
    };
}
export interface GoogleOAuthAdapter {
    exchangeCode(input: {
        code: string;
        verifier: string;
        redirectUri: string;
    }): Promise<GoogleTokens>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        expiresAt: number;
        scopes?: string[];
    }>;
    revoke(token: string): Promise<void>;
}
export declare class DisabledGoogleOAuth implements GoogleOAuthAdapter {
    private fail;
    exchangeCode(_input: {
        code: string;
        verifier: string;
        redirectUri: string;
    }): Promise<never>;
    refresh(_token: string): Promise<never>;
    revoke(_token: string): Promise<never>;
}
export interface OutcomeReconciler {
    reconcile(messageId: string, expected: 'trashed' | 'restored'): Promise<'confirmed' | 'failed' | 'unknown'>;
}
