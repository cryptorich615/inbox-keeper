import {lstat,readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PostgresDatabase} from '../../dist-server/postgres.js';
import {LocalFileKms} from '../../dist-server/local-file-kms.js';
import {TokenEnvelopeCipher} from '../../dist-server/kms.js';
const root=resolve(import.meta.dirname,'../..'),dir=resolve(root,'.local-secrets');
const dirInfo=await stat(dir);
if(!dirInfo.isDirectory()||(dirInfo.mode&0o077)!==0||dirInfo.uid!==process.getuid?.())throw new Error('.local-secrets must be an owned 0700 directory');
const envPath=resolve(dir,'database.env'),info=await lstat(envPath);
if(info.isSymbolicLink()||!info.isFile()||(info.mode&0o077)!==0||info.uid!==process.getuid?.())throw new Error('database.env must be an owned regular 0600 file');
const line=(await readFile(envPath,'utf8')).trim();
if(!line.startsWith('DATABASE_URL='))throw new Error('database.env format is invalid');
const databaseUrl=line.slice('DATABASE_URL='.length);
for(const [name,pattern] of [['google-client-id',/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/],['google-client-secret',/^(?:GOCSPX-)?[A-Za-z0-9_-]{20,}$/]]){const path=resolve(dir,name),file=await lstat(path);if(file.isSymbolicLink()||!file.isFile()||(file.mode&0o077)!==0||file.uid!==process.getuid?.())throw new Error(`${name} must be an owned regular 0600 file`);const value=await readFile(path,'utf8');if(!pattern.test(value))throw new Error(`${name} format is invalid; rerun the masked OAuth setup`)}
const db=new PostgresDatabase(databaseUrl);await db.migrate();await db.ready();
const cipher=new TokenEnvelopeCipher(await LocalFileKms.fromFile(resolve(dir,'envelope.key'))),probe=await cipher.encrypt({ok:true});
if(!(await cipher.decrypt(probe)).ok)throw new Error('Local envelope-key verification failed');
await db.close();
console.log('Local PostgreSQL migration and envelope-key checks passed. OAuth remains disconnected.');
