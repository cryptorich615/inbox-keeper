import type{AuditRecord,JobRepository,MutationResult}from'./domain.js';import type{SqliteStore}from'./store.js';
export class DurableJobs implements JobRepository{
 constructor(private store:SqliteStore,private userId:string){}
 async get(id:string){return this.store.job(id,this.userId)}
 async put(id:string,r:MutationResult){this.store.putJob(id,this.userId,r);const storedId=this.store.storedJobId(id,this.userId),q=this.store.db.prepare('INSERT OR REPLACE INTO job_items VALUES(?,?,?,?)');const write=(messageId:string,status:string,reason:string)=>q.run(...([storedId,messageId,status,reason] as any));r.succeeded.forEach(x=>write(x,'succeeded',''));r.failed.forEach(x=>write(x.id,'failed',x.reason));r.skipped.forEach(x=>write(x.id,'skipped',x.reason));r.unknown?.forEach(x=>write(x.id,'unknown',x.reason))}
 async appendAudit(r:AuditRecord){this.store.appendAudit(this.userId,r)}
 async audit(){const rows=this.store.db.prepare('SELECT event_json event FROM audit WHERE user_id=? ORDER BY created_at DESC').all(this.userId)as Array<{event:string}>;return rows.map(x=>JSON.parse(x.event))}
 async clear(){this.store.deleteUser(this.userId)}
}
