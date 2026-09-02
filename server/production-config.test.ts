import {describe,expect,it} from 'vitest';
import {loadProductionConfig} from './production-config.js';
const valid={NODE_ENV:'production',GMAIL_LIVE_MODE:'enabled',APP_ORIGIN:'https://staging.example.test',GMAIL_REDIRECT_URI:'https://staging.example.test/api/oauth/callback',DATABASE_URL:'postgresql://db.example.test/app',GMAIL_CLIENT_ID:'public-client-id',GMAIL_CLIENT_SECRET_RESOURCE:'projects/example/secrets/oauth/versions/latest',GCP_KMS_KEY_NAME:'projects/example/locations/us/keyRings/r/cryptoKeys/k',CLOUD_TASKS_AUDIENCE:'https://staging.example.test',CLOUD_TASKS_SERVICE_ACCOUNT:'tasks@example.iam.gserviceaccount.com'};
const local={NODE_ENV:'development',GMAIL_LIVE_MODE:'enabled',GMAIL_LOCAL_TEST:'enabled',APP_ORIGIN:'http://127.0.0.1:8080',GMAIL_REDIRECT_URI:'http://127.0.0.1:8080/api/oauth/callback',DATABASE_URL:'postgresql://user@127.0.0.1/app',GMAIL_CLIENT_ID_FILE:'/private/id',GMAIL_CLIENT_SECRET_FILE:'/private/secret',LOCAL_ENVELOPE_KEY_FILE:'/private/key'};
describe('production config',()=>{
 it('accepts exact secure references',()=>expect(loadProductionConfig(valid)).toMatchObject({localTest:false,appOrigin:'https://staging.example.test',port:8080}));
 it('accepts only exact loopback local-live references',()=>expect(loadProductionConfig(local)).toMatchObject({localTest:true,appOrigin:'http://127.0.0.1:8080',port:8080}));
 it('rejects local wildcard and hostname drift',()=>{expect(()=>loadProductionConfig({...local,APP_ORIGIN:'http://0.0.0.0:8080'})).toThrow(/127/);expect(()=>loadProductionConfig({...local,APP_ORIGIN:'http://localhost:8080'})).toThrow(/127/)});
 it('rejects local port and database network drift',()=>{expect(()=>loadProductionConfig({...local,PORT:'8081'})).toThrow(/port/);expect(()=>loadProductionConfig({...local,DATABASE_URL:'postgresql://user@db.example.test/app'})).toThrow(/127/);expect(()=>loadProductionConfig({...local,DATABASE_URL:'postgresql://user@127.0.0.1:5433/app'})).toThrow(/5432/)});
 it('rejects callback drift',()=>expect(()=>loadProductionConfig({...valid,GMAIL_REDIRECT_URI:'https://evil.test/api/oauth/callback'})).toThrow(/exactly match/));
 it('rejects missing secret references',()=>expect(()=>loadProductionConfig({...valid,GMAIL_CLIENT_SECRET_RESOURCE:''})).toThrow(/GMAIL_CLIENT_SECRET_RESOURCE/));
 it('rejects non-production and in-memory data',()=>{expect(()=>loadProductionConfig({...valid,NODE_ENV:'development'})).toThrow();expect(()=>loadProductionConfig({...valid,DATABASE_URL:':memory:'})).toThrow()});
});
