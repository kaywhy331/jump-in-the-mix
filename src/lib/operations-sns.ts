import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type OperationsSnsDestination = { kind: "sns"; arn: string; region: string };

export async function publishOperationsSns(destination: OperationsSnsDestination, payload: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), "jitm-ops-sns-"));
  try {
    const file = join(directory, "notice.json");
    await writeFile(file, JSON.stringify({ TopicArn: destination.arn, Subject: "Jump in the Mix operational alert", Message: JSON.stringify(payload) }), { mode: 0o600, flag: "wx" });
    const result = await promisify(execFile)("aws", ["sns", "publish", "--region", destination.region, "--cli-input-json", `file://${file}`, "--output", "json", "--no-cli-pager"], {
      timeout: 5000, maxBuffer: 64 * 1024,
      env: { ...process.env, AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true", AWS_MAX_ATTEMPTS: "1", AWS_PAGER: "" }
    });
    const receipt = JSON.parse(result.stdout) as { MessageId?: unknown };
    return { accepted: typeof receipt.MessageId === "string" && receipt.MessageId.length > 0 };
  } catch { return { accepted: false }; }
  finally { await rm(directory, { recursive: true, force: true }); }
}
