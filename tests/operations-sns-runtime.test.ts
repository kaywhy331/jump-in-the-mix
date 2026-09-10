import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishOperationsSns } from "../src/lib/operations-sns";

describe("SNS command execution and private-file cleanup", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "jitm-sns-test-"));
    const bin = join(directory, "bin"); await mkdir(bin);
    await writeFile(join(bin, "aws"), `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);const file=args[args.indexOf('--cli-input-json')+1].slice(7);
fs.writeFileSync(process.env.SNS_TEST_RECORD,JSON.stringify({args,file,mode:fs.statSync(file).mode&511,payload:JSON.parse(fs.readFileSync(file))}));
if(process.env.SNS_TEST_MODE==='error'){console.error('PRIVATE_PROVIDER_DIAGNOSTIC');process.exit(1);}
console.log(process.env.SNS_TEST_MODE==='invalid'?'invalid-json':JSON.stringify(process.env.SNS_TEST_MODE==='missing'?{}:{MessageId:'synthetic-receipt'}));
`, { mode: 0o700 });
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`); vi.stubEnv("SNS_TEST_RECORD", join(directory, "record.json")); vi.stubEnv("SNS_TEST_MODE", "success");
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
  const destination = { kind: "sns" as const, arn: "arn:aws:sns:us-west-2:123456789012:synthetic-alerts", region: "us-west-2" };
  it.each(["success", "error", "invalid", "missing"])("requires a provider receipt and removes the private payload after %s", async mode => {
    vi.stubEnv("SNS_TEST_MODE", mode);
    expect(await publishOperationsSns(destination, { eventId: "stable-id", text: "Synthetic monitor test" })).toEqual({ accepted: mode === "success" });
    const record = JSON.parse(await readFile(join(directory, "record.json"), "utf8"));
    expect(record.mode).toBe(0o600); expect(record.payload.TopicArn).toBe(destination.arn);
    expect(JSON.stringify(record.args)).not.toContain("Synthetic monitor test");
    expect(JSON.parse(record.payload.Message).eventId).toBe("stable-id");
    await expect(access(record.file)).rejects.toThrow();
  });
});
