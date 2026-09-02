export interface KeyEncryptionService {
    readonly keyId: string;
    wrap(plaintext: Uint8Array): Promise<string>;
    unwrap(ciphertext: string): Promise<Uint8Array>;
}
export declare class DisabledKms implements KeyEncryptionService {
    readonly keyId = "disabled";
    private fail;
    wrap(): Promise<never>;
    unwrap(): Promise<never>;
}
/** Tests only. Never use in production. */
export declare class FakeTestKms implements KeyEncryptionService {
    readonly keyId = "fake-test";
    wrap(p: Uint8Array): Promise<string>;
    unwrap(c: string): Promise<Buffer<ArrayBuffer>>;
}
export interface TokenEnvelope {
    version: 1;
    keyId: string;
    wrappedDataKey: string;
    iv: string;
    tag: string;
    ciphertext: string;
}
export declare class TokenEnvelopeCipher {
    private kms;
    constructor(kms: KeyEncryptionService);
    get keyId(): string;
    encrypt(value: unknown): Promise<string>;
    decrypt<T>(encoded: string): Promise<T>;
}
