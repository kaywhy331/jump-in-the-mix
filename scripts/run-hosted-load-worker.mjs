import { spawn } from 'node:child_process';
import { isolatedLoadEnvironment, readPrivateLoadJson } from './lib/hosted-load-plan.mjs';

async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw new Error('Private fixture worker configuration required.');
  const config = await readPrivateLoadJson(file);
  if (config.expectedCommit && process.env.RENDER_GIT_COMMIT !== config.expectedCommit) throw new Error('Fixture worker build differs from reviewed release.');
  const env = isolatedLoadEnvironment(config);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker/index.ts'], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  const done = new Promise(resolve => { child.once('exit', resolve); child.once('error', () => resolve(1)); });
  let kill;
  const stop = () => { child.kill('SIGTERM'); kill ??= setTimeout(() => child.kill('SIGKILL'), 5000); };
  const expires = setTimeout(stop, Math.max(1, Date.parse(config.expiresAt) - Date.now() - 5000));
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const result = await done; clearTimeout(expires); clearTimeout(kill);
  process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  if (result !== 0) process.exitCode = 1;
}
main().catch(() => { console.error('Isolated fixture worker failed; inspect its private configuration.'); process.exitCode = 1; });
