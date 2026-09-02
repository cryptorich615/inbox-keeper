import { OAuth2Client } from 'google-auth-library';
export class GoogleOidcVerifier {
    audience;
    serviceAccount;
    client;
    constructor(audience, serviceAccount, client = new OAuth2Client()) {
        this.audience = audience;
        this.serviceAccount = serviceAccount;
        this.client = client;
    }
    async verify(req) {
        const header = String(req.headers.authorization || '');
        if (!header.startsWith('Bearer '))
            throw new Error('Task authentication required');
        const ticket = await this.client.verifyIdToken({ idToken: header.slice(7), audience: this.audience });
        const payload = ticket.getPayload();
        if (!payload || payload.email !== this.serviceAccount || payload.email_verified !== true)
            throw new Error('Task identity rejected');
        return payload;
    }
}
