import { need } from './receipt.mjs';
import { git } from './read-only.mjs';

// Deliberately small additive SQL language, not a general safety claim for SQL.
// Unknown syntax refuses before migration. Quoted identifiers and string values
// are retained as single tokens; comments cannot hide a second statement.
export function statements(sql) {
  const result = [], current = [];
  const token = /\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|"(?:[^"]|"")*"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[(),.;\[\]]/y;
  let position = 0;
  while (position < sql.length) {
    token.lastIndex = position;
    const match = token.exec(sql); need(match);
    const value = match[0]; position = token.lastIndex;
    if (/^\s|^--|^\/\*/.test(value)) { need(!value.startsWith('/*') || !value.slice(2,-2).includes('/*')); continue; }
    if (value === ';') { if (current.length) result.push(current.splice(0)); }
    else current.push(value);
  }
  if (current.length) result.push(current);
  need(result.length); return result;
}
const identifier = value => /^"(?:[^"]|"")+"$/.test(value ?? '') || /^[A-Za-z_][A-Za-z_0-9]*$/.test(value ?? '');
const unquote = value => value.startsWith('"') ? value.slice(1,-1).replaceAll('""','"') : value.toLowerCase();

export function additiveObjects(sql) {
  return statements(sql).map(tokens => {
    const upper = tokens.map(t => /^[A-Za-z_]/.test(t) ? t.toUpperCase() : t);
    // Defaults/functions, procedural bodies, data copies, partitions and
    // multi-action ALTERs need a separately reviewed catalog implementation.
    const forbidden = new Set(['DROP','DELETE','UPDATE','INSERT','TRUNCATE','SELECT','AS','LIKE','INHERITS',
      'PARTITION','ATTACH','DETACH','RENAME','REPLACE','CASCADE','DEFAULT','GENERATED','REFERENCES','CHECK']);
    need(!upper.some(t => forbidden.has(t)));
    let kind, name, table;
    if (upper[0] === 'CREATE' && upper[1] === 'TABLE') {
      need(identifier(tokens[2]) && tokens[3] === '(' && tokens.at(-1) === ')');
      kind = 'table'; name = unquote(tokens[2]);
    } else if (upper[0] === 'CREATE' && (upper[1] === 'INDEX' || upper[1] === 'UNIQUE' && upper[2] === 'INDEX')) {
      const offset = upper[1] === 'UNIQUE' ? 1 : 0;
      need(identifier(tokens[2+offset]) && upper[3+offset] === 'ON' && identifier(tokens[4+offset])
        && tokens[5+offset] === '(' && tokens.at(-1) === ')');
      need(tokens.slice(6+offset,-1).every((value,i) => i % 2 ? value === ',' : identifier(value)));
      kind = 'index'; name = unquote(tokens[2+offset]);
    } else if (upper[0] === 'ALTER' && upper[1] === 'TABLE') {
      need(identifier(tokens[2]) && upper[3] === 'ADD' && upper[4] === 'COLUMN' && identifier(tokens[5]));
      need(!upper.includes('NOT') && !tokens.includes(',') && !upper.slice(4).includes('ADD'));
      // Domains, serials and constraints can add implicit defaults/NOT NULL.
      // Only explicit nullable built-in column types belong to this subset.
      need(/^(?:TEXT|BYTEA|BOOLEAN|BOOL|INTEGER|INT|BIGINT|SMALLINT|REAL|DOUBLE PRECISION|NUMERIC|DECIMAL|VARCHAR|CHAR|TIMESTAMP|TIMESTAMPTZ|DATE|TIME|JSON|JSONB)(?: \( [0-9]+ \))?(?: \[ \])?(?: NULL)?$/.test(upper.slice(6).join(' ')));
      kind = 'column'; table = unquote(tokens[2]); name = unquote(tokens[5]);
    } else need(false);
    // No function expressions in this first catalog: type-length parentheses
    // are allowed only after these built-in type names (or CREATE TABLE name).
    for (let i = 0; i < tokens.length; i++) if (tokens[i] === '(') {
      need(i === 3 && kind === 'table' || kind === 'index' || ['VARCHAR','CHAR','NUMERIC','DECIMAL','TIMESTAMP','TIMESTAMPTZ'].includes(upper[i-1])
        || ['KEY','UNIQUE'].includes(upper[i-1]));
    }
    return { kind, name, ...(table ? { table } : {}) };
  });
}

export async function forwardOnly(context, previous, candidate, read = git) {
  need(previous.migrations.every((migration,index) => candidate.migrations[index]?.name === migration.name && candidate.migrations[index]?.checksum === migration.checksum));
  const added = candidate.migrations.slice(previous.migrations.length);
  need(added.length);
  const objects = [];
  for (const migration of added) objects.push(...additiveObjects(await read('show',`${context.candidate_sha}:prisma/migrations/${migration.name}/migration.sql`)));
  return objects;
}

export async function newObjects(client, objects, present) {
  for (const object of objects) {
    const found = object.kind === 'column'
      ? (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,[object.table,object.name])).rowCount > 0
      : (await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=$1 AND c.relkind=ANY($2::"char"[])`,[object.name,object.kind === 'index' ? ['i','I'] : ['r','p']])).rowCount > 0;
    need(found === present);
  }
}
