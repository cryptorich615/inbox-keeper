export class DisabledKms {
    keyId = 'disabled';
    fail() { throw new Error('Production KMS is not configured'); }
    async wrap() { return this.fail(); }
    async unwrap() { return this.fail(); }
}
/** Tests only. Never use in production. */
export class FakeTestKms {
    keyId = 'fake-test';
    async wrap(p) { return Buffer.from(p).toString('base64url'); }
    async unwrap(c) { return Buffer.from(c, 'base64url'); }
}
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export class TokenEnvelopeCipher {
    kms;
    constructor(kms) {
        this.kms = kms;
    }
    get keyId() { return this.kms.keyId; }
    async encrypt(value) { const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]), envelope = { version: 1, keyId: this.kms.keyId, wrappedDataKey: await this.kms.wrap(key), iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: body.toString('base64url') }; key.fill(0); return JSON.stringify(envelope); }
    async decrypt(encoded) { let envelope; try {
        envelope = JSON.parse(encoded);
    }
    catch {
        throw new Error('Token envelope is invalid');
    } if (envelope.version !== 1 || envelope.keyId !== this.kms.keyId)
        throw new Error('Token envelope key is unavailable'); const key = Buffer.from(await this.kms.unwrap(envelope.wrappedDataKey)), decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url')); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url')); try {
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8'));
    }
    finally {
        key.fill(0);
    } }
}
