import type { KeyEncryptionService } from './kms.js';
/** Localhost testing only. Production must use a managed KMS. */
export declare class LocalFileKms implements KeyEncryptionService {
    private readonly key;
    readonly keyId = "local-file-v1";
    private constructor();
    static fromFile(path: string): Promise<LocalFileKms>;
    wrap(plaintext: Uint8Array): Promise<string>;
    unwrap(encoded: string): Promise<Uint8Array>;
}
export declare function readLocalSecret(path: string): Promise<string>;
