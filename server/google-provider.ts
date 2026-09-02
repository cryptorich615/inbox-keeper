import type { GoogleOAuthAdapter, GoogleTokens } from './google-adapter.js';
import type { MailProvider, NormalizedMessage, Page } from './domain.js';

export interface GoogleConfig { clientId:string; clientSecret:string; redirectUri:string }
type Fetch = typeof fetch;
async function safeJson(response:Response):Promise<Record<string,unknown>> { try{return await response.json() as Record<string,unknown>}catch{throw new Error('Google returned an invalid response')} }

export class GoogleOAuthHttp implements GoogleOAuthAdapter {
  constructor(private cfg:GoogleConfig,private http:Fetch=fetch){}
  async exchangeCode(input:{code:string;verifier:string;redirectUri:string}):Promise<GoogleTokens>{
    if(input.redirectUri!==this.cfg.redirectUri)throw new Error('OAuth redirect mismatch');
    const response=await this.http('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.cfg.clientId,client_secret:this.cfg.clientSecret,code:input.code,code_verifier:input.verifier,redirect_uri:input.redirectUri,grant_type:'authorization_code'})});
    if(!response.ok)throw new Error('Google authorization failed');const token=await safeJson(response);
    if(typeof token.access_token!=='string'||typeof token.id_token!=='string')throw new Error('Google authorization response was incomplete');
    // Verify identity through Google's authenticated endpoint. Tokens never appear in URLs or logs.
    const verify=await this.http('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${token.access_token}`}});if(!verify.ok)throw new Error('Google identity verification failed');const identity=await safeJson(verify);
    if(typeof identity.sub!=='string'||identity.email_verified===false)throw new Error('Google identity verification failed');
    return{accessToken:token.access_token,refreshToken:typeof token.refresh_token==='string'?token.refresh_token:undefined,expiresAt:Date.now()+Number(token.expires_in??3600)*1000,scopes:String(token.scope??'').split(' ').filter(Boolean),identity:{sub:identity.sub,email:typeof identity.email==='string'?identity.email:undefined}};
  }
  async refresh(refreshToken:string){const response=await this.http('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.cfg.clientId,client_secret:this.cfg.clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});if(!response.ok)throw new Error('Google session refresh failed');const token=await safeJson(response);if(typeof token.access_token!=='string')throw new Error('Google session refresh response was incomplete');return{accessToken:token.access_token,expiresAt:Date.now()+Number(token.expires_in??3600)*1000,scopes:typeof token.scope==='string'?token.scope.split(' ').filter(Boolean):undefined}}
  async revoke(token:string){const response=await this.http('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})});if(!response.ok)throw new Error('Google authorization revocation failed')}
}

export class GmailHttpProvider implements MailProvider {
  readonly kind='gmail' as const;constructor(private access:()=>Promise<string>,private http:Fetch=fetch){}
  private async call(path:string,init:RequestInit={}){const response=await this.http(`https://gmail.googleapis.com/gmail/v1/users/me${path}`,{...init,headers:{...init.headers,authorization:`Bearer ${await this.access()}`}});if(!response.ok)throw new Error(response.status===429||response.status>=500?'Gmail temporarily unavailable':'Gmail request rejected');return response}
  async listMetadata(pageToken?:string):Promise<Page<NormalizedMessage>>{const query=new URLSearchParams({maxResults:'500'});if(pageToken)query.set('pageToken',pageToken);const list=await safeJson(await this.call(`/messages?${query}`)),items:NormalizedMessage[]=[];for(const item of Array.isArray(list.messages)?list.messages:[])if(item&&typeof item==='object'&&typeof(item as{id?:unknown}).id==='string')items.push(await this.getOne((item as{id:string}).id));return{items,nextPageToken:typeof list.nextPageToken==='string'?list.nextPageToken:undefined}}
  async currentMetadata(ids:string[]){return Promise.all(ids.map(id=>this.getOne(id)))}
  private async getOne(id:string):Promise<NormalizedMessage>{const data=await safeJson(await this.call(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)),payload=data.payload as{headers?:Array<{name?:string;value?:string}>}|undefined,headers=Object.fromEntries((payload?.headers??[]).map(h=>[String(h.name).toLowerCase(),String(h.value)])),from=headers.from??'',match=/^(.*?)(?:\s*<([^>]+)>)?$/.exec(from),labels=Array.isArray(data.labelIds)?data.labelIds.map(String):[];return{id:String(data.id),threadId:String(data.threadId),fromName:(match?.[1]||from).replace(/^"|"$/g,'').trim(),fromAddress:(match?.[2]||from).toLowerCase(),subject:headers.subject||'(no subject)',receivedAt:new Date(Number(data.internalDate||0)).toISOString(),sizeEstimate:Number(data.sizeEstimate||0),labels,unread:labels.includes('UNREAD'),starred:labels.includes('STARRED'),hasAttachment:false}}
  async trash(id:string){await this.call(`/messages/${encodeURIComponent(id)}/trash`,{method:'POST'})}
  async restore(id:string){await this.call(`/messages/${encodeURIComponent(id)}/untrash`,{method:'POST'})}
}
