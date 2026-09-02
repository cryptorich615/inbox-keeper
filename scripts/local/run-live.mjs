import {lstat,readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),dir=resolve(root,'.local-secrets');
const dirInfo=await stat(dir);
if(!dirInfo.isDirectory()||(dirInfo.mode&0o077)!==0||dirInfo.uid!==process.getuid())throw new Error('.local-secrets must be an app-owned 0700 directory');
async function privateFile(name){const path=resolve(dir,name),info=await lstat(path);if(info.isSymbolicLink()||!info.isFile()||(info.mode&0o077)!==0||info.uid!==process.getuid())throw new Error(`${name} must be an app-owned regular 0600 file`);return path}
let databaseFile,databaseLine;
try{databaseFile=await privateFile('database.env');databaseLine=(await readFile(databaseFile,'utf8')).trim();await privateFile('google-client-id');await privateFile('google-client-secret');await privateFile('envelope.key')}catch{console.error('Local live Gmail is not configured. Run the masked local OAuth setup first.');process.exit(1)}
if(!databaseLine.startsWith('DATABASE_URL=postgresql://'))throw new Error('Local database configuration is invalid');
Object.assign(process.env,{NODE_ENV:'development',GMAIL_LIVE_MODE:'enabled',GMAIL_LOCAL_TEST:'enabled',APP_ORIGIN:'http://127.0.0.1:8080',PORT:'8080',GMAIL_REDIRECT_URI:'http://127.0.0.1:8080/api/oauth/callback',DATABASE_URL:databaseLine.slice('DATABASE_URL='.length),GMAIL_CLIENT_ID_FILE:resolve(dir,'google-client-id'),GMAIL_CLIENT_SECRET_FILE:resolve(dir,'google-client-secret'),LOCAL_ENVELOPE_KEY_FILE:resolve(dir,'envelope.key')});
await import('../../dist-server/production-server.js');
