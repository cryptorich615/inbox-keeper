import { TokenEnvelopeCipher } from './kms.js';
import { GoogleOAuthHttp, GmailHttpProvider } from './google-provider.js';
import { GoogleTokenService } from './token-service.js';
/** Composition root for a host that provides a production KMS implementation. */
export function createLiveGoogleRuntime(input) {
    if (input.kms.keyId === 'disabled' || input.kms.keyId === 'fake-test')
        throw new Error('Live Gmail requires a production KMS');
    const oauth = new GoogleOAuthHttp(input.config, input.http), tokens = new GoogleTokenService(input.store, new TokenEnvelopeCipher(input.kms), oauth);
    return { oauth, tokens, providerFor: (userId) => new GmailHttpProvider(() => tokens.access(userId), input.http) };
}
