import 'dotenv/config';
import { Client } from 'pg';
import { grantRuntimeRole, inspectRuntimeRole } from './lib/runtime-database-role.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const role = args.find(arg => arg.startsWith('--role='))?.slice(7);
if (args.some(arg => arg !== '--apply' && !arg.startsWith('--role=')) || args.filter(arg => arg.startsWith('--role=')).length !== 1 || !role || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=<private connection> node scripts/configure-runtime-database.mjs --role=jitm_runtime [--apply]');
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 20000 });
  try {
    await client.connect();
    const result = await (apply ? grantRuntimeRole : inspectRuntimeRole)(client, { role });
    // Verification must inspect the credential in actual use, not a different
    // safe-looking role while the process remains connected as owner.
    const actual = (await client.query('SELECT current_user AS name')).rows[0].name;
    if (!apply && actual !== role) throw new Error('Verification must connect as the selected runtime role.');
    console.log(JSON.stringify(result));
    if (!result.ready) process.exitCode = 1;
  } catch { console.error('Runtime database qualification failed. Inspect the private connection and role grants.'); process.exitCode = 1; }
  finally { await client.end(); }
}
