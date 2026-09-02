import { OAuth2Client } from 'google-auth-library';
import type { IncomingMessage } from 'node:http';
export declare class GoogleOidcVerifier {
    private audience;
    private serviceAccount;
    private client;
    constructor(audience: string, serviceAccount: string, client?: OAuth2Client);
    verify(req: IncomingMessage): Promise<import("google-auth-library").TokenPayload>;
}
