// Seed a genuinely stale, authenticated capture in only the backup subprocess.
// The parent freshness check keeps its real clock. Never imported by production.
import { settings } from '../jobs/settings.mjs';
if (process.env.QUALIFICATION_FAULT === 'stale-backup' && process.argv[1]?.endsWith('/backup-database.mjs')) {
  const RealDate=Date;
  const offset=2*settings.backupMaxAgeMs;
  globalThis.Date=class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [RealDate.now()-offset])); }
    static now() { return RealDate.now()-offset; }
  };
}
