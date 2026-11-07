import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Substitutes only the AWS command boundary; capture, encryption, manifest
// authentication and the catalog's head-object verification remain real.
export async function awsStub(args,directory) {
  assert.equal(args[0],'s3api'); assert.ok(directory);
  const flag=name=>args[args.indexOf(name)+1];
  const object=flag('--key'); assert.ok(/^[a-zA-Z0-9_./-]+$/.test(object) && !object.includes('..'));
  const path=join(directory,object);
  if (args[1] === 'put-object') {
    assert.equal(flag('--if-none-match'),'*'); assert.equal(flag('--server-side-encryption'),'AES256');
    const bytes=await readFile(flag('--body'));
    assert.equal(createHash('sha256').update(bytes).digest('base64'),flag('--checksum-sha256'));
    await mkdir(join(path,'..'),{recursive:true}); await writeFile(path,bytes,{flag:'wx',mode:0o600});
    return {};
  }
  assert.equal(args[1],'head-object'); assert.equal(flag('--checksum-mode'),'ENABLED');
  // Read persisted bytes again, never echo the requested checksum as proof.
  const bytes=await readFile(path);
  return {ContentLength:bytes.length,ChecksumSHA256:createHash('sha256').update(bytes).digest('base64'),ServerSideEncryption:'AES256'};
}
if (process.argv[1]?.endsWith('/aws-stub.mjs')) {
  try { console.log(JSON.stringify(await awsStub(process.argv.slice(2),process.env.QUALIFICATION_S3_DIRECTORY))); }
  catch { console.error('Synthetic object store refused operation'); process.exitCode=1; }
}
