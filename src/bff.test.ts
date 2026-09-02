// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest';

const reply=(status:number,body:unknown)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));

describe('BFF bootstrap',()=>{
  beforeEach(()=>{vi.resetModules();vi.unstubAllGlobals()});

  it('preserves an authenticated session after an OAuth redirect',async()=>{
    const fetchMock=vi.fn((..._args:unknown[])=>reply(200,{mode:'readonly',liveEnabled:true,provider:'gmail',scopes:['https://www.googleapis.com/auth/gmail.metadata'],csrfToken:'csrf'}));
    vi.stubGlobal('fetch',fetchMock);
    const {bootstrap}=await import('./bff');
    await expect(bootstrap()).resolves.toMatchObject({mode:'readonly'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/status');
  });

  it('creates a session only when status returns 401',async()=>{
    const fetchMock=vi.fn()
      .mockImplementationOnce(()=>reply(401,{error:'Session required'}))
      .mockImplementationOnce(()=>reply(201,{mode:'disconnected',csrfToken:'first'}))
      .mockImplementationOnce(()=>reply(200,{mode:'disconnected',liveEnabled:true,provider:'gmail',scopes:[],csrfToken:'second'}));
    vi.stubGlobal('fetch',fetchMock);
    const {bootstrap}=await import('./bff');
    await expect(bootstrap()).resolves.toMatchObject({mode:'disconnected'});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/session');
  });
});
