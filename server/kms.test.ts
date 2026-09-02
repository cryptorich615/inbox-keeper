// @vitest-environment node
import{describe,expect,it}from'vitest';import{FakeTestKms,TokenEnvelopeCipher}from'./kms.js';
describe('token envelope',()=>{it('round trips only with the test fake',async()=>{const cipher=new TokenEnvelopeCipher(new FakeTestKms()),encoded=await cipher.encrypt({refreshToken:'not-a-real-token'});expect(encoded).not.toContain('not-a-real-token');expect(await cipher.decrypt(encoded)).toEqual({refreshToken:'not-a-real-token'})})});
