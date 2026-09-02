// @vitest-environment node
import{describe,expect,it}from'vitest';import{createLiveGoogleRuntime}from'./live-runtime.js';import{FakeTestKms}from'./kms.js';import{SqliteStore}from'./store.js';
describe('live composition gate',()=>{it('refuses fake KMS',()=>{const store=new SqliteStore();expect(()=>createLiveGoogleRuntime({config:{clientId:'id',clientSecret:'secret',redirectUri:'https://app.example.test/cb'},kms:new FakeTestKms(),store})).toThrow('production KMS');store.close()})});
