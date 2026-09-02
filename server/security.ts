import{createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual}from'node:crypto';
const b64=(b:Buffer)=>b.toString('base64url');
export function pkce(){const verifier=b64(randomBytes(32));return{verifier,challenge:b64(createHash('sha256').update(verifier).digest())}}
export function opaqueState(){return b64(randomBytes(32))}
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export class OAuthStateStore{
  private values=new Map<string,{verifier:string;expiresAt:number}>();
  constructor(private ttlMs=10*60_000,private now=()=>Date.now()){}
  issue(){const state=opaqueState(),{verifier,challenge}=pkce();this.values.set(state,{verifier,expiresAt:this.now()+this.ttlMs});return{state,verifier,challenge}}
  consume(state:string){const value=this.values.get(state);this.values.delete(state);if(!value||value.expiresAt<=this.now())return null;return value.verifier}
}
export class TokenCipher{private key:Buffer;constructor(encodedKey:string){this.key=Buffer.from(encodedKey,'base64');if(this.key.length!==32)throw new Error('Token encryption key must be 32 bytes, base64 encoded.')}encrypt(text:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv),body=Buffer.concat([c.update(text,'utf8'),c.final()]);return[b64(iv),b64(c.getAuthTag()),b64(body)].join('.')}decrypt(value:string){const[i,t,b]=value.split('.').map(x=>Buffer.from(x,'base64url')),d=createDecipheriv('aes-256-gcm',this.key,i);d.setAuthTag(t);return Buffer.concat([d.update(b),d.final()]).toString('utf8')}}
export const READ_SCOPES=['openid','email','https://www.googleapis.com/auth/gmail.metadata']as const;export const MODIFY_SCOPES=['https://www.googleapis.com/auth/gmail.modify']as const;
export function authorizationUrl(i:{clientId:string;redirectUri:string;state:string;challenge:string;cleanup:boolean}){const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:i.clientId,redirect_uri:i.redirectUri,response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:[...READ_SCOPES,...(i.cleanup?MODIFY_SCOPES:[])].join(' '),state:i.state,code_challenge:i.challenge,code_challenge_method:'S256'}).toString();return u.toString()}
