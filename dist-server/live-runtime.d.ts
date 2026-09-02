import type { KeyEncryptionService } from './kms.js';
import type { SqliteStore } from './store.js';
import { GoogleOAuthHttp, GmailHttpProvider, type GoogleConfig } from './google-provider.js';
import { GoogleTokenService } from './token-service.js';
/** Composition root for a host that provides a production KMS implementation. */
export declare function createLiveGoogleRuntime(input: {
    config: GoogleConfig;
    kms: KeyEncryptionService;
    store: SqliteStore;
    http?: typeof fetch;
}): {
    oauth: GoogleOAuthHttp;
    tokens: GoogleTokenService;
    providerFor: (userId: string) => GmailHttpProvider;
};
