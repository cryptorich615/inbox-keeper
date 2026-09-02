import type{KeyEncryptionService}from'./kms.js';import{TokenEnvelopeCipher}from'./kms.js';import type{SqliteStore}from'./store.js';import{GoogleOAuthHttp,GmailHttpProvider,type GoogleConfig}from'./google-provider.js';import{GoogleTokenService}from'./token-service.js';

/** Composition root for a host that provides a production KMS implementation. */
export function createLiveGoogleRuntime(input:{config:GoogleConfig;kms:KeyEncryptionService;store:SqliteStore;http?:typeof fetch}){
 if(input.kms.keyId==='disabled'||input.kms.keyId==='fake-test')throw new Error('Live Gmail requires a production KMS');
 const oauth=new GoogleOAuthHttp(input.config,input.http),tokens=new GoogleTokenService(input.store,new TokenEnvelopeCipher(input.kms),oauth);
 return{oauth,tokens,providerFor:(userId:string)=>new GmailHttpProvider(()=>tokens.access(userId),input.http)};
}
