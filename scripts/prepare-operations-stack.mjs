import { readFile, writeFile } from "node:fs/promises";
const index = process.argv.indexOf("--output"), output = index >= 0 ? process.argv[index + 1] : undefined;
if (!output) throw Error("Provide --output for the reviewable CloudFormation template. This command does not deploy it.");
const template = JSON.parse(await readFile("infra/operations/uptime-stack.json", "utf8"));
template.Resources.Uptime.Properties.Code.ZipFile = await readFile("infra/operations/uptime.py", "utf8");
await writeFile(output, `${JSON.stringify(template, null, 2)}\n`, { mode: 0o600 });
console.log("Prepared independent monitoring template. Deployment sends an SNS subscription confirmation to the configured recipient.");
