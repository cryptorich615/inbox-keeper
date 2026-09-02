import { KeyManagementServiceClient } from '@google-cloud/kms';
/** Uses Application Default Credentials / Workload Identity. No key material is accepted. */
export class GoogleCloudKms {
    keyName;
    client;
    keyId;
    constructor(keyName, client = new KeyManagementServiceClient()) {
        this.keyName = keyName;
        this.client = client;
        if (!keyName.includes('/cryptoKeys/'))
            throw new Error('A full Cloud KMS CryptoKey resource name is required');
        this.keyId = keyName;
    }
    async wrap(plaintext) {
        const [response] = await this.client.encrypt({ name: this.keyName, plaintext: Buffer.from(plaintext) });
        if (!response.ciphertext)
            throw new Error('Cloud KMS encryption failed');
        return Buffer.from(response.ciphertext).toString('base64url');
    }
    async unwrap(ciphertext) {
        const [response] = await this.client.decrypt({ name: this.keyName, ciphertext: Buffer.from(ciphertext, 'base64url') });
        if (!response.plaintext)
            throw new Error('Cloud KMS decryption failed');
        return Buffer.from(response.plaintext);
    }
}
