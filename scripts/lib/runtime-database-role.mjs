import { quoteIdentifier } from './postgres-ops.mjs';

function names(role, schema) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role) || role.startsWith('pg_') || role === 'public') throw new Error('Use a dedicated runtime role name.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid application schema.');
}

// Only privilege metadata is read. No customer rows or credentials enter a receipt.
export async function inspectRuntimeRole(client, { role, schema = 'public' }) {
  names(role, schema);
  const identity = (await client.query(`SELECT
    r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolreplication OR r.rolbypassrls) AS restricted,
    r.oid=d.datdba AS database_owner, r.oid=n.nspowner AS schema_owner,
    (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships,
    has_database_privilege(r.oid,d.oid,'CREATE') AS database_create,
    has_schema_privilege(r.oid,n.oid,'CREATE') AS schema_create,
    has_database_privilege(r.oid,d.oid,'CONNECT') AND has_schema_privilege(r.oid,n.oid,'USAGE') AS connects,
    EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace=n.oid AND c.relowner=r.oid)
      OR EXISTS (SELECT 1 FROM pg_type t WHERE t.typnamespace=n.oid AND t.typowner=r.oid)
      OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace=n.oid AND p.proowner=r.oid) AS owns_objects,
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace=n.oid AND p.prosecdef AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS definer_access
    FROM pg_roles r CROSS JOIN pg_database d CROSS JOIN pg_namespace n
    WHERE r.rolname=$1 AND d.datname=current_database() AND n.nspname=$2`, [role, schema])).rows[0];
  if (!identity) throw new Error('Runtime role or application schema is missing.');
  const tables = (await client.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE has_table_privilege($1,c.oid,'SELECT'))::int AS readable,
    count(*) FILTER (WHERE has_table_privilege($1,c.oid,'INSERT') AND has_table_privilege($1,c.oid,'UPDATE') AND has_table_privilege($1,c.oid,'DELETE'))::int AS writable,
    coalesce(bool_or(has_table_privilege($1,c.oid,'TRUNCATE,REFERENCES,TRIGGER,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')),false) AS elevated
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$2 AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations'`, [role, schema])).rows[0];
  const history = (await client.query(`SELECT has_table_privilege($1,c.oid,'SELECT') AS readable,
    has_table_privilege($1,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,SELECT WITH GRANT OPTION') AS writable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relname='_prisma_migrations' AND c.relkind='r'`, [role, schema])).rows[0];
  const sequences = (await client.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE has_sequence_privilege($1,c.oid,'USAGE') AND has_sequence_privilege($1,c.oid,'SELECT'))::int AS usable,
    coalesce(bool_or(has_sequence_privilege($1,c.oid,'UPDATE,USAGE WITH GRANT OPTION,SELECT WITH GRANT OPTION')),false) AS elevated
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relkind='S'`, [role, schema])).rows[0];
  const boundary = identity.restricted && !identity.database_owner && !identity.schema_owner && !identity.memberships && !identity.database_create && !identity.schema_create && !identity.owns_objects && !identity.definer_access;
  return { role, schema, boundary, ready: Boolean(boundary && identity.connects && tables.total > 0 && tables.readable === tables.total && tables.writable === tables.total && !tables.elevated && history?.readable && !history.writable && sequences.total === sequences.usable && !sequences.elevated), identity, tables, history: history ?? null, sequences };
}

// The caller must be the schema/migration owner. Existing broader privileges are
// refused rather than silently treating an unknown account as safe to repurpose.
export async function grantRuntimeRole(client, { role, schema = 'public' }) {
  names(role, schema);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
    const owner = (await client.query(`SELECT current_user AS name, pg_has_role(current_user,d.datdba,'USAGE') AND pg_has_role(current_user,n.nspowner,'USAGE') AS allowed
      FROM pg_database d CROSS JOIN pg_namespace n WHERE d.datname=current_database() AND n.nspname=$1`, [schema])).rows[0];
    const before = await inspectRuntimeRole(client, { role, schema });
    if (!owner?.allowed || owner.name === role || !before.boundary || before.tables.elevated || before.sequences.elevated) throw new Error('Dedicated restricted role and migration owner are required.');
    const qRole = quoteIdentifier(role), qSchema = quoteIdentifier(schema);
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
    await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${qRole}`);
    await client.query(`GRANT USAGE ON SCHEMA ${qSchema} TO ${qRole}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${qSchema} TO ${qRole}`);
    await client.query(`REVOKE ALL PRIVILEGES ON TABLE ${qSchema}."_prisma_migrations" FROM ${qRole}`);
    await client.query(`GRANT SELECT ON TABLE ${qSchema}."_prisma_migrations" TO ${qRole}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${qSchema} TO ${qRole}`);
    // Default grants apply to objects created by this actual migration principal.
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${qSchema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${qRole}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${qSchema} GRANT USAGE, SELECT ON SEQUENCES TO ${qRole}`);
    const after = await inspectRuntimeRole(client, { role, schema });
    if (!after.ready) throw new Error('Runtime privileges did not meet the required boundary.');
    await client.query('COMMIT');
    return after;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
