// Seed a genuinely stale, authenticated capture in only the backup subprocess.
// The parent freshness check keeps its real clock. Never imported by production.
if (process.env.QUALIFICATION_FAULT === 'stale-backup' && process.argv[1]?.endsWith('/backup-database.mjs')) {
  const RealDate=Date;
  globalThis.Date=class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [RealDate.now()-3600000])); }
    static now() { return RealDate.now()-3600000; }
  };
}
