import type { MailProvider, NormalizedMessage, Page } from './domain.js';
export declare class MockGmailProvider implements MailProvider {
    readonly kind: 'mock';
    private messages;
    readonly failures: Set<string>;
    constructor(messages?: NormalizedMessage[]);
    listMetadata(): Promise<Page<NormalizedMessage>>;
    currentMetadata(ids: string[]): Promise<NormalizedMessage[]>;
    trash(id: string): Promise<void>;
    restore(id: string): Promise<void>;
    private require;
    private maybeFail;
}
export declare class DisabledGmailProvider implements MailProvider {
    readonly kind: 'gmail';
    private fail;
    listMetadata(): Promise<never>;
    currentMetadata(): Promise<never>;
    trash(): Promise<never>;
    restore(): Promise<never>;
}
