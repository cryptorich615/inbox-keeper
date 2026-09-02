// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {MIGRATION_001,PostgresProtectionRepository,PROTECTION_VERSION_BACKFILL_SQL} from './postgres.js';

describe('Postgres legacy protection version contract',()=>{
  it('backfills with MAX without overwriting a newer state',()=>{
    expect(MIGRATION_001).toContain('SELECT user_id,MAX(version) FROM protections GROUP BY user_id');
    expect(MIGRATION_001).toContain('GREATEST(protection_versions.version,EXCLUDED.version)');
    expect(PROTECTION_VERSION_BACKFILL_SQL).toContain('COALESCE(MAX(version),0)');
    expect(PROTECTION_VERSION_BACKFILL_SQL).toContain('GREATEST(protection_versions.version,EXCLUDED.version)');
  });

  it('reads legacy v5, replaces to v6, rejects stale v5, adds to v7, and retains an empty-set version',async()=>{
    let rules=[{kind:'sender',value:'legacy@example.com',version:5}],state:number|null=null;
    const query=async(sql:string,params:unknown[]=[])=>{
      if(sql.startsWith('SELECT kind,value,version'))return{rows:rules};
      if(sql.startsWith('SELECT version FROM protection_versions'))return{rows:state===null?[]:[{version:state}]};
      if(sql.startsWith('SELECT pg_advisory'))return{rows:[]};
      if(sql===PROTECTION_VERSION_BACKFILL_SQL){const legacy=Math.max(0,...rules.map(r=>r.version));state=Math.max(state??0,legacy);return{rows:[]}}
      if(sql.startsWith('DELETE FROM protections')){rules=[];return{rows:[]}}
      if(sql.startsWith('INSERT INTO protections')){rules.push({kind:String(params[1]),value:String(params[2]),version:Number(params[3])});return{rows:[]}}
      if(sql.startsWith('UPDATE protection_versions')){state=Number(params[1]);return{rows:[]}}
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const db={pool:{query},transaction:async<T>(fn:(c:{query:typeof query})=>Promise<T>)=>fn({query})};
    const repo=new PostgresProtectionRepository(db as never);
    expect((await repo.get('u')).version).toBe(5);
    expect(await repo.replace('u',[],[],5)).toBe(6);
    expect((await repo.get('u')).version).toBe(6);
    expect(await repo.replace('u',['stale@example.com'],[],5)).toBeNull();
    expect((await repo.get('u')).senders.size).toBe(0);
    expect(await repo.add('u',['fresh@example.com'])).toBe(7);
    expect((await repo.get('u')).version).toBe(7);
  });
});
