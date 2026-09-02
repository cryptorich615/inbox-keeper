import type{GoogleOAuthAdapter,GoogleTokens}from'./google-adapter.js';
import type{SqliteStore}from'./store.js';
import{TokenEnvelopeCipher}from'./kms.js';

export interface StoredGoogleTokens{refreshToken:string;accessToken:string;expiresAt:number;scopes:string[];email?:string}
export class GoogleTokenService{
 private refreshes=new Map<string,Promise<string>>();
 constructor(private store:SqliteStore,private cipher:TokenEnvelopeCipher,private oauth:GoogleOAuthAdapter){}
 async save(userId:string,tokens:GoogleTokens){if(!tokens.refreshToken)throw new Error('Google did not issue offline authorization');const value:StoredGoogleTokens={refreshToken:tokens.refreshToken,accessToken:tokens.accessToken,expiresAt:tokens.expiresAt,scopes:tokens.scopes,email:tokens.identity.email};this.store.putToken(userId,await this.cipher.encrypt(value),this.cipher.keyId)}
 async load(userId:string){const row=this.store.token(userId);return row?this.cipher.decrypt<StoredGoogleTokens>(row.ciphertext):null}
 async access(userId:string){const value=await this.load(userId);if(!value)throw new Error('Gmail is not connected');if(value.expiresAt>Date.now()+60_000)return value.accessToken;const existing=this.refreshes.get(userId);if(existing)return existing;const refreshing=this.doRefresh(userId,value).finally(()=>this.refreshes.delete(userId));this.refreshes.set(userId,refreshing);return refreshing}
 private async doRefresh(userId:string,value:StoredGoogleTokens){const next=await this.oauth.refresh(value.refreshToken),updated={...value,accessToken:next.accessToken,expiresAt:next.expiresAt,scopes:next.scopes??value.scopes};this.store.putToken(userId,await this.cipher.encrypt(updated),this.cipher.keyId);return next.accessToken}
 async disconnect(userId:string){const value=await this.load(userId);try{if(value)await this.oauth.revoke(value.refreshToken)}finally{this.store.deleteToken(userId)}}
}
