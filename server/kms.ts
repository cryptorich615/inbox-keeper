export interface KeyEncryptionService{readonly keyId:string;wrap(plaintext:Uint8Array):Promise<string>;unwrap(ciphertext:string):Promise<Uint8Array>}
export class DisabledKms implements KeyEncryptionService{readonly keyId='disabled';private fail():never{throw new Error('Production KMS is not configured')}async wrap():Promise<never>{return this.fail()}async unwrap():Promise<never>{return this.fail()}}
/** Tests only. Never use in production. */
export class FakeTestKms implements KeyEncryptionService{readonly keyId='fake-test';async wrap(p:Uint8Array){return Buffer.from(p).toString('base64url')}async unwrap(c:string){return Buffer.from(c,'base64url')}}
export interface TokenEnvelope{version:1;keyId:string;wrappedDataKey:string;iv:string;tag:string;ciphertext:string}

import{createCipheriv,createDecipheriv,randomBytes}from'node:crypto';
export class TokenEnvelopeCipher{
 constructor(private kms:KeyEncryptionService){}
 get keyId(){return this.kms.keyId}
 async encrypt(value:unknown):Promise<string>{const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]),envelope:TokenEnvelope={version:1,keyId:this.kms.keyId,wrappedDataKey:await this.kms.wrap(key),iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:body.toString('base64url')};key.fill(0);return JSON.stringify(envelope)}
 async decrypt<T>(encoded:string):Promise<T>{let envelope:TokenEnvelope;try{envelope=JSON.parse(encoded)as TokenEnvelope}catch{throw new Error('Token envelope is invalid')}if(envelope.version!==1||envelope.keyId!==this.kms.keyId)throw new Error('Token envelope key is unavailable');const key=Buffer.from(await this.kms.unwrap(envelope.wrappedDataKey)),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64url'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'));try{return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]).toString('utf8'))as T}finally{key.fill(0)}}
}
