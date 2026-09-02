import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionRow, SqliteStore } from './store.js';
export declare function parseCookies(raw?: string): {
    [k: string]: string;
};
export declare function sessionCookie(id: string, secure: boolean): string;
export declare function requireSession(req: IncomingMessage, store: SqliteStore): SessionRow | null;
export declare function requireMutation(req: IncomingMessage, session: SessionRow, origin: string): void;
export declare function jsonBody(req: IncomingMessage, max?: number): Promise<any>;
export declare class PublicError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare function send(res: ServerResponse, status: number, body: unknown): void;
