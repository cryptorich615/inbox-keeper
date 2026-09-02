import {KeyManagementServiceClient} from '@google-cloud/kms';
import type {KeyEncryptionService} from './kms.js';

/** Uses Application Default Credentials / Workload Identity. No key material is accepted. */
export class GoogleCloudKms implements KeyEncryptionService {
  readonly keyId: string;
  constructor(private keyName: string, private client = new KeyManagementServiceClient()) {
    if (!keyName.includes('/cryptoKeys/')) throw new Error('A full Cloud KMS CryptoKey resource name is required');
    this.keyId = keyName;
  }
  async wrap(plaintext: Uint8Array): Promise<string> {
    const [response] = await this.client.encrypt({name: this.keyName, plaintext: Buffer.from(plaintext)});
    if (!response.ciphertext) throw new Error('Cloud KMS encryption failed');
    return Buffer.from(response.ciphertext as Uint8Array).toString('base64url');
  }
  async unwrap(ciphertext: string): Promise<Uint8Array> {
    const [response] = await this.client.decrypt({name: this.keyName, ciphertext: Buffer.from(ciphertext, 'base64url')});
    if (!response.plaintext) throw new Error('Cloud KMS decryption failed');
    return Buffer.from(response.plaintext as Uint8Array);
  }
}
