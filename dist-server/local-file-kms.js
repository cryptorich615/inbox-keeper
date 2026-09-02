import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
function decodeKey(value) {
    const key = Buffer.from(value.trim(), 'base64url');
    if (key.length !== 32)
        throw new Error('Local envelope key must be 32 bytes');
    return key;
}
async function readPrivateFile(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink())
        throw new Error('Local secret file must not be a symbolic link');
    if (!info.isFile() || (info.mode & 0o077) !== 0)
        throw new Error('Local secret file permissions must be 0600');
    if (info.uid !== process.getuid?.())
        throw new Error('Local secret file must be owned by the app user');
    return readFile(path, 'utf8');
}
/** Localhost testing only. Production must use a managed KMS. */
export class LocalFileKms {
    key;
    keyId = 'local-file-v1';
    constructor(key) {
        this.key = key;
    }
    static async fromFile(path) { return new LocalFileKms(decodeKey(await readPrivateFile(path))); }
    async wrap(plaintext) {
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv), body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), body: body.toString('base64url') });
    }
    async unwrap(encoded) {
        const value = JSON.parse(encoded);
        if (value.v !== 1)
            throw new Error('Unsupported local key envelope');
        const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(value.body, 'base64url')), decipher.final()]);
    }
}
export async function readLocalSecret(path) { return (await readPrivateFile(path)).trim(); }
