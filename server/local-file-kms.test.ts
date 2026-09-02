import {mkdtemp,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {LocalFileKms} from './local-file-kms.js';

describe('LocalFileKms',()=>{
  it('wraps and unwraps using a private key file',async()=>{const dir=await mkdtemp(join(tmpdir(),'inbox-kms-')),path=join(dir,'key');await writeFile(path,randomBytes(32).toString('base64url'),{mode:0o600});const kms=await LocalFileKms.fromFile(path),plain=randomBytes(32),wrapped=await kms.wrap(plain);expect(Buffer.from(await kms.unwrap(wrapped))).toEqual(plain)});
  it('rejects group-readable keys',async()=>{const dir=await mkdtemp(join(tmpdir(),'inbox-kms-')),path=join(dir,'key');await writeFile(path,randomBytes(32).toString('base64url'));await chmod(path,0o640);await expect(LocalFileKms.fromFile(path)).rejects.toThrow(/0600/)})
});
