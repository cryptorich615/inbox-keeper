import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('Inbox Keeper', () => {
  afterEach(()=>vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', { configurable:true, value:vi.fn().mockImplementation(() => ({ matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn() })) });
  });

  it('cycles and persists accessible theme preferences', async () => {
    const user = userEvent.setup();
    render(<App/>);
    const toggle = screen.getByRole('button', {name:/Theme: system/i});
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('inbox-keeper:v1')).toContain('"theme":"light"');
    await user.click(screen.getByRole('button', {name:/Theme: light/i}));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('starts with no messages selected', () => {
    render(<App/>);
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('keeps sender selection separate from sender navigation', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByLabelText(/Select sender ShopDrop/i));
    expect(screen.getByRole('region', {name:'Selected sender actions'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name:'Clean up your inbox'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:/View messages from ShopDrop/i}));
    expect(screen.getByRole('heading', {name:'ShopDrop'})).toBeInTheDocument();
    expect(screen.queryByRole('region', {name:'Selected sender actions'})).not.toBeInTheDocument();
  });

  it('selects multiple sender cards and scopes cleanup to all of their current non-Trash mail', async () => {
    const user=userEvent.setup(); render(<App/>);
    await user.selectOptions(screen.getByLabelText('Read status'),'unread');
    await user.click(screen.getByLabelText(/Select sender ShopDrop/i));
    expect(screen.getByLabelText('Select all visible senders')).toHaveAttribute('aria-checked','mixed');
    await user.click(screen.getByLabelText(/Select sender The Daily Brief/i));
    const actions=screen.getByRole('region',{name:'Selected sender actions'});
    expect(within(actions).getByText('2 senders')).toBeInTheDocument();
    expect(within(actions).getByText(/6 total matched/)).toBeInTheDocument();
    await user.click(within(actions).getByRole('button',{name:/Review cleanup/i}));
    const dialog=screen.getByRole('dialog');
    expect(within(dialog).getByText('Selected').nextElementSibling).toHaveTextContent('6');
    expect(within(dialog).getByText('Selected but hidden').nextElementSibling).toHaveTextContent('4');
    expect(within(dialog).getByRole('button',{name:/Move 6 to Trash/i})).toBeDisabled();
  });

  it('normalizes mixed-case live sender addresses for grouping and protection',async()=>{
    const message={id:'mixed-1',threadId:'t1',fromName:'Mixed Sender',fromAddress:'Mixed.User@Example.TEST',subject:'One',receivedAt:new Date().toISOString(),sizeEstimate:42,labels:['INBOX'],unread:false,starred:false,hasAttachment:false};
    const response=(body:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{const path=String(input);if(path==='/api/status')return response({mode:'cleanup',liveEnabled:true,provider:'gmail',scopes:[],csrfToken:'csrf'});if(path==='/api/sync')return response({messages:[message]});if(path==='/api/protections/senders'&&init?.method==='POST')return response({senders:['mixed.user@example.test'],domains:[],version:2});if(path==='/api/protections')return response({senders:[],domains:[],version:1});if(path==='/api/activity')return response({events:[]});return response({error:'unexpected'},404)}));
    const user=userEvent.setup();render(<App/>);
    await screen.findByLabelText(/Select sender Mixed Sender \(mixed\.user@example\.test\)/i);
    await user.click(screen.getByLabelText(/Select sender Mixed Sender/i));
    await user.click(screen.getByRole('button',{name:/Protect selected/i}));
    await user.click(screen.getByRole('button',{name:'Protected'}));
    expect(screen.getByText('mixed.user@example.test')).toBeInTheDocument();
  });

  it('bulk protects selected senders while preserving existing protections', async () => {
    const user=userEvent.setup(); render(<App/>);
    await user.click(screen.getByLabelText(/Select sender ShopDrop/i));
    await user.click(screen.getByLabelText(/Select sender MyBank Alerts/i));
    await user.click(screen.getByRole('button',{name:/Protect selected/i}));
    expect(await screen.findByText(/1 sender protected/i)).toBeInTheDocument();
    expect(screen.queryByRole('region',{name:'Selected sender actions'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Protected'}));
    expect(screen.getByText('offers@shopdrop.example')).toBeInTheDocument();
    expect(screen.getByText('alerts@mybank.example')).toBeInTheDocument();
  });

  it('clears stale sender selection on view changes', async () => {
    const user=userEvent.setup(); render(<App/>);
    await user.click(screen.getByLabelText(/Select sender ShopDrop/i));
    expect(screen.getByRole('region',{name:'Selected sender actions'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/Trash 0/i}));
    await user.click(screen.getByRole('button',{name:/Inbox 16/i}));
    expect(screen.getByLabelText(/Select sender ShopDrop/i)).not.toBeChecked();
  });

  it('shows exact bulk review and skips protected messages', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getAllByRole('button', {name:/MyBank Alerts/i})[0]);
    await user.click(screen.getByLabelText('Select all visible messages'));
    await user.click(screen.getByRole('button', {name:/Review cleanup/i}));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Selected').nextElementSibling).toHaveTextContent('2');
    expect(within(dialog).getByText('Protected skipped').nextElementSibling).toHaveTextContent('2');
    expect(within(dialog).getByText(/Move 0 to Trash/i)).toBeDisabled();
    expect(within(dialog).getByText(/Nothing will be permanently deleted/i)).toBeInTheDocument();
  });

  it('moves mail only to Trash and restores it', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getAllByRole('button', {name:/The Daily Brief/i})[0]);
    await user.click(screen.getByLabelText('Select all visible messages'));
    await user.click(screen.getByRole('button', {name:/Review cleanup/i}));
    await user.click(screen.getByRole('button', {name:/Move 3 to Trash/i}));
    expect(screen.getByText(/3 messages moved to Trash/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:/Trash 3/i}));
    expect(screen.getAllByRole('button', {name:/Restore/i}).length).toBe(3);
    await user.click(screen.getAllByRole('button', {name:/Restore/i})[0]);
    expect(screen.getByText(/1 message restored to Inbox/i)).toBeInTheDocument();
  });

  it('select all applies only to filtered visible messages', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getAllByRole('button', {name:/ShopDrop/i})[0]);
    await user.selectOptions(screen.getByLabelText('Read status'), 'unread');
    await user.click(screen.getByLabelText('Select all visible messages'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows a mixed select-all state when only some visible messages are selected',async()=>{
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/View messages from The Daily Brief/i}));
    await user.click(screen.getByLabelText(/Select Markets, rates/i));
    expect(screen.getByLabelText('Select all visible messages')).toHaveAttribute('aria-checked','mixed');
  });

  it('requires typed confirmation for large batches', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByRole('button', {name:/Review all messages/i}));
    await user.click(screen.getByLabelText('Select all visible messages'));
    await user.click(screen.getByRole('button', {name:/Review cleanup/i}));
    const typed = screen.getByRole('textbox', {name:/Cleanup confirmation/i});
    expect(typed).toBeInTheDocument();
    expect(screen.getByRole('button', {name:/Move 13 to Trash/i})).toBeDisabled();
    await user.type(typed, 'MOVE 13');
    expect(screen.getByRole('button', {name:/Move 13 to Trash/i})).toBeEnabled();
  });

  it('traps modal focus, closes with Escape, and returns focus', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getAllByRole('button', {name:/The Daily Brief/i})[0]);
    await user.click(screen.getByLabelText('Select all visible messages'));
    const review = screen.getByRole('button', {name:/Review cleanup/i});
    await user.click(review);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(review).toHaveFocus();
  });

  it('explains domain protection without offering a misleading sender unlock', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getAllByRole('button', {name:/Family/i})[0]);
    expect(screen.getByRole('button', {name:/is protected by domain family\.example/i})).toBeDisabled();
    expect(screen.queryByRole('button', {name:/Unprotect sender/i})).not.toBeInTheDocument();
  });

  it('warns when filters hide part of the current selection', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getAllByRole('button', {name:/ShopDrop/i})[0]);
    await user.click(screen.getByLabelText('Select all visible messages'));
    await user.selectOptions(screen.getByLabelText('Read status'), 'unread');
    expect(screen.getByText(/2 selected messages are hidden/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:/Review cleanup/i}));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Selected but hidden').nextElementSibling).toHaveTextContent('2');
    expect(within(dialog).getByText('Affected senders').nextElementSibling).toHaveTextContent('ShopDrop');
    expect(within(dialog).getByText('Affected domains').nextElementSibling).toHaveTextContent('shopdrop.example');
  });

  it('never falls back to fictional local mutation when a live outcome is unknown',async()=>{
    const message={id:'gmail-1',threadId:'t1',fromName:'Live Sender',fromAddress:'live@example.test',subject:'Live message',receivedAt:new Date().toISOString(),sizeEstimate:42,labels:['INBOX'],unread:false,starred:false,hasAttachment:false};
    const response=(body:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL)=>{const path=String(input);if(path==='/api/status')return response({mode:'cleanup',liveEnabled:true,provider:'gmail',scopes:['https://www.googleapis.com/auth/gmail.modify'],csrfToken:'csrf'});if(path==='/api/sync')return response({messages:[message]});if(path==='/api/protections')return response({senders:[],domains:[],version:1});if(path==='/api/activity')return response({events:[]});if(path==='/api/previews')return response({previewId:'p1',action:'trash',requestedCount:1,count:1,excludedCount:0,missingCount:0,confirmText:'MOVE 1',expiresInSeconds:600});if(path==='/api/jobs')return response({jobId:'j1',action:'trash',items:[{id:'gmail-1',status:'unknown',reason:'reconcile'}],succeeded:0,skipped:0,unknown:1});return response({error:'unexpected'},404)}));
    const user=userEvent.setup();render(<App/>);
    await screen.findByRole('button',{name:/Live Sender/i});
    await user.click(screen.getByRole('button',{name:/Live Sender/i}));
    await user.click(screen.getByLabelText('Select all visible messages'));
    await user.click(screen.getByRole('button',{name:/Review cleanup/i}));
    await user.type(screen.getByRole('textbox',{name:/Cleanup confirmation/i}),'MOVE 1');
    await user.click(screen.getByRole('button',{name:/Move 1 to Trash/i}));
    await waitFor(()=>expect(screen.getByText(/1 outcome is being reconciled/i)).toBeInTheDocument());
    expect(screen.getByRole('button',{name:/Trash 0/i})).toBeInTheDocument();
  });

  it('hydrates server protections and activity, then requires the exact server preview result',async()=>{
    const messages=[
      {id:'g1',threadId:'t1',fromName:'Live Sender',fromAddress:'live@example.test',subject:'One',receivedAt:new Date().toISOString(),sizeEstimate:42,labels:['INBOX'],unread:false,starred:false,hasAttachment:false},
      {id:'g2',threadId:'t2',fromName:'Live Sender',fromAddress:'live@example.test',subject:'Two',receivedAt:new Date().toISOString(),sizeEstimate:43,labels:['INBOX'],unread:false,starred:false,hasAttachment:false},
    ];
    const response=(body:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL)=>{const path=String(input);if(path==='/api/status')return response({mode:'cleanup',liveEnabled:true,provider:'gmail',scopes:['https://www.googleapis.com/auth/gmail.modify'],csrfToken:'csrf'});if(path==='/api/sync')return response({messages});if(path==='/api/protections')return response({senders:['saved@example.test'],domains:['saved.test'],version:2});if(path==='/api/activity')return response({events:[{id:'a1',eventType:'cleanup',createdAt:'2026-01-01T00:00:00Z',event:{jobId:'j0',action:'trash',items:[],succeeded:3,skipped:1,unknown:0}}]});if(path==='/api/previews')return response({previewId:'p2',action:'trash',requestedCount:2,count:1,excludedCount:1,missingCount:0,confirmText:'MOVE 1',expiresInSeconds:600});return response({error:'unexpected'},404)}));
    const user=userEvent.setup();render(<App/>);
    await screen.findByRole('button',{name:/Live Sender/i});
    await user.click(screen.getByRole('button',{name:'Protected'}));
    expect(screen.getByText('saved@example.test')).toBeInTheDocument();
    expect(screen.getByText('saved.test')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Activity'}));
    expect(screen.getByText(/3 messages/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/Inbox 2/i}));
    await user.click(screen.getByRole('button',{name:/Live Sender/i}));
    await user.click(screen.getByLabelText('Select all visible messages'));
    await user.click(screen.getByRole('button',{name:/Review cleanup/i}));
    const dialog=await screen.findByRole('dialog');
    expect(within(dialog).getByText('Server requested').nextElementSibling).toHaveTextContent('2');
    expect(within(dialog).getByText('Server eligible').nextElementSibling).toHaveTextContent('1');
    expect(within(dialog).getByText('Server protected exclusions').nextElementSibling).toHaveTextContent('1');
    expect(within(dialog).getByRole('button',{name:/Move 1 to Trash/i})).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox',{name:/Cleanup confirmation/i}),'MOVE 1');
    expect(within(dialog).getByRole('button',{name:/Move 1 to Trash/i})).toBeEnabled();
  });

  it('fails closed after a protection save error',async()=>{
    const message={id:'g1',threadId:'t1',fromName:'Live Sender',fromAddress:'live@example.test',subject:'One',receivedAt:new Date().toISOString(),sizeEstimate:42,labels:['INBOX'],unread:false,starred:false,hasAttachment:false};
    const response=(body:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{const path=String(input);if(path==='/api/status')return response({mode:'cleanup',liveEnabled:true,provider:'gmail',scopes:[],csrfToken:'csrf'});if(path==='/api/sync')return response({messages:[message]});if(path==='/api/protections'&&init?.method==='PUT')return response({error:'Protection store unavailable'},503);if(path==='/api/protections')return response({senders:[],domains:[],version:1});if(path==='/api/activity')return response({events:[]});return response({error:'unexpected'},404)}));
    const user=userEvent.setup();render(<App/>);
    await screen.findByRole('button',{name:/Live Sender/i});
    await user.click(screen.getByRole('button',{name:/Live Sender/i}));
    await user.click(screen.getByRole('button',{name:/Protect sender live@example.test/i}));
    await screen.findByText(/Protection store unavailable/i);
    await user.click(screen.getByLabelText('Select all visible messages'));
    expect(screen.getByRole('button',{name:/Review cleanup/i})).toBeDisabled();
    expect(screen.getByRole('button',{name:/Protect sender live@example.test/i})).toBeInTheDocument();
  });

  it('reloads latest protections and requires retry after a stale whole-set save',async()=>{
    const message={id:'g1',threadId:'t1',fromName:'Live Sender',fromAddress:'live@example.test',subject:'One',receivedAt:new Date().toISOString(),sizeEstimate:42,labels:['INBOX'],unread:false,starred:false,hasAttachment:false};
    const response=(body:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));let protectionGets=0;
    vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{const path=String(input);if(path==='/api/status')return response({mode:'cleanup',liveEnabled:true,provider:'gmail',scopes:[],csrfToken:'csrf'});if(path==='/api/sync')return response({messages:[message]});if(path==='/api/protections'&&init?.method==='PUT')return response({error:'Protected mail changed in another session'},409);if(path==='/api/protections')return response(protectionGets++===0?{senders:[],domains:[],version:1}:{senders:['live@example.test'],domains:['new.example'],version:2});if(path==='/api/activity')return response({events:[]});return response({error:'unexpected'},404)}));
    const user=userEvent.setup();render(<App/>);
    await screen.findByRole('button',{name:/View messages from Live Sender/i});
    await user.click(screen.getByRole('button',{name:/View messages from Live Sender/i}));
    await user.click(screen.getByRole('button',{name:/Protect sender live@example.test/i}));
    expect(await screen.findByText(/Latest rules were reloaded.*retry/i)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Unprotect sender live@example.test/i})).toBeInTheDocument();
  });
});
