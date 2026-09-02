import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {lstat, readFile} from 'node:fs/promises';
import type {KeyEncryptionService} from './kms.js';

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64url');
  if (key.length !== 32) throw new Error('Local envelope key must be 32 bytes');
  return key;
}

async function readPrivateFile(path: string): Promise<string> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error('Local secret file must not be a symbolic link');
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('Local secret file permissions must be 0600');
  if (info.uid !== process.getuid?.()) throw new Error('Local secret file must be owned by the app user');
  return readFile(path, 'utf8');
}

/** Localhost testing only. Production must use a managed KMS. */
export class LocalFileKms implements KeyEncryptionService {
  readonly keyId = 'local-file-v1';
  private constructor(private readonly key: Buffer) {}
  static async fromFile(path: string) { return new LocalFileKms(decodeKey(await readPrivateFile(path))); }
  async wrap(plaintext: Uint8Array): Promise<string> {
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv),body=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return JSON.stringify({v:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),body:body.toString('base64url')});
  }
  async unwrap(encoded: string): Promise<Uint8Array> {
    const value=JSON.parse(encoded) as {v:number;iv:string;tag:string;body:string};
    if(value.v!==1)throw new Error('Unsupported local key envelope');
    const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(value.iv,'base64url'));
    decipher.setAuthTag(Buffer.from(value.tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(value.body,'base64url')),decipher.final()]);
  }
}

export async function readLocalSecret(path: string): Promise<string> { return (await readPrivateFile(path)).trim(); }
