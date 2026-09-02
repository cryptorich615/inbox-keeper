import type { KeyEncryptionService } from './kms.js';
/** Uses Application Default Credentials / Workload Identity. No key material is accepted. */
export declare class GoogleCloudKms implements KeyEncryptionService {
    private keyName;
    private client;
    readonly keyId: string;
    constructor(keyName: string, client?: import("@google-cloud/kms/build/src/v1/key_management_service_client.js").KeyManagementServiceClient);
    wrap(plaintext: Uint8Array): Promise<string>;
    unwrap(ciphertext: string): Promise<Uint8Array>;
}
