import {OAuth2Client} from 'google-auth-library';
import type {IncomingMessage} from 'node:http';

export class GoogleOidcVerifier {
  constructor(private audience:string,private serviceAccount:string,private client=new OAuth2Client()){}
  async verify(req:IncomingMessage){
    const header=String(req.headers.authorization||'');
    if(!header.startsWith('Bearer '))throw new Error('Task authentication required');
    const ticket=await this.client.verifyIdToken({idToken:header.slice(7),audience:this.audience});
    const payload=ticket.getPayload();
    if(!payload||payload.email!==this.serviceAccount||payload.email_verified!==true)throw new Error('Task identity rejected');
    return payload;
  }
}
