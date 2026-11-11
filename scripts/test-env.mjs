#!/usr/bin/env node
// One command for a disposable, loopback-only test database (JITM-12 §2.21).
//
//   npm run test:env -- <name>        create jitm_design_<name> and write its env file
//   node scripts/test-env.mjs run <name> -- <command...>
//                                     run a command with that env file only
//   npm run test:env:drop -- <name>   drop jitm_design_<name> and remove its env file
//
// The connection settings come from the CI `validate` job in .github/workflows/ci.yml,
// read with a YAML parser at run time; the env file starts from .env.example. The helper
// never reads .env, ~/.pgpass or any other credential store. Every database input it
// inherits (DATABASE_URL, the other *_DATABASE_URL and *_DB_URL names, every PG* variable)
// is cleared or set to the validated test database, and the final driver configuration is
// checked before any connection or child process is created.
import { spawn as spawnProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";
import pg from "pg";

const require = createRequire(import.meta.url);
// Resolve the connection-string parser and the parameter resolver that pg itself uses, so the
// guard checks the configuration the driver will actually connect with.
const requireFromPg = createRequire(require.resolve("pg"));
const { parse: parseConnectionString } = requireFromPg("pg-connection-string");
const ConnectionParameters = requireFromPg("./connection-parameters.js");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DATABASE_PREFIX = "jitm_design_";
export const DATABASE_NAME_PATTERN = /^jitm_design_[a-z0-9_]{1,40}$/;
// PostgreSQL's standard maintenance database; the repository's own fixture suites use it too.
// The helper only creates, drops and checks for the one validated database through it.
export const MAINTENANCE_DATABASE = "postgres";
const CI_JOB = "validate";
// The validate step that runs the unit and integration suites (`npm test`, not `npm run test:e2e`).
const CI_TEST_COMMAND = /(?:^|[\s;&|(])npm\s+(?:run\s+)?test(?=$|[\s;&|)])/mu;
const LOOPBACK_NAMES = new Map([["localhost", "127.0.0.1"], ["127.0.0.1", "127.0.0.1"], ["[::1]", "::1"], ["::1", "::1"]]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const ALLOWED_URL_QUERY = new Set(["schema"]);
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/u;
// Characters a double-quoted shell value would expand or end on; such values are refused.
const UNSAFE_VALUE = /["$`\\\r\n\0]/u;
const PG_VARIABLE = /^PG[A-Z0-9_]*$/u;
const DATABASE_URL_INPUT = /^(?:[A-Z0-9_]+_)?(?:DATABASE|DB)_URL$/u;
// Database URL inputs the repository reads; others matching DATABASE_URL_INPUT are found at run time.
const KNOWN_DATABASE_URL_INPUTS = ["DATABASE_URL", "NETLIFY_DB_URL", "RECOVERY_TEST_DATABASE_URL", "RESTORE_DATABASE_URL", "MIGRATION_DATABASE_URL", "BACKUP_DATABASE_URL"];
// pg resolves every connection key from PG<KEY> (see pg.defaults); these are read under other
// names (pg, pgpass) or by libpq tools, and can redirect a connection or supply credentials.
const SPECIAL_PG_VARIABLES = ["PGAPPNAME", "PGSSLMODE", "PGPASSFILE", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGSYSCONFDIR"];

export class GuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "GuardError";
  }
}

const refuse = (message) => { throw new GuardError(message); };
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function projectPaths(root = ROOT) {
  return {
    root,
    example: join(root, ".env.example"),
    workflow: join(root, ".github", "workflows", "ci.yml"),
    envDirectory: join(root, ".artifacts", "test-env")
  };
}

export function envFilePath(database, root = ROOT) {
  return join(projectPaths(root).envDirectory, `${assertDatabaseName(database)}.env`);
}

export function assertDatabaseName(database) {
  if (typeof database !== "string" || !DATABASE_NAME_PATTERN.test(database)) {
    refuse(`Refusing database name ${JSON.stringify(String(database))}: it must match ${DATABASE_NAME_PATTERN.source}.`);
  }
  return database;
}

// Accepts the suffix (`qa1`) or the full name (`jitm_design_qa1`).
export function resolveDatabaseName(name) {
  if (typeof name !== "string" || name === "") refuse("Name the test database, for example: npm run test:env -- qa1");
  return assertDatabaseName(name.startsWith(DATABASE_PREFIX) ? name : `${DATABASE_PREFIX}${name}`);
}

async function loadYamlParser() {
  try {
    const yaml = (await import("js-yaml")).default;
    // js-yaml 3 needs safeLoad for the safe schema; js-yaml 4's load is safe.
    return yaml.DEFAULT_FULL_SCHEMA ? yaml.safeLoad : yaml.load;
  } catch (error) {
    throw new GuardError(`The js-yaml parser is not installed (${error.message}). Run npm ci first.`);
  }
}

function scalarEnvironment(block, where, { strict }) {
  if (block === undefined) return { values: {}, skipped: [] };
  if (!isRecord(block)) refuse(`${where} must be a mapping.`);
  const values = {}, skipped = [];
  for (const [key, value] of Object.entries(block)) {
    if (!ENV_KEY.test(key)) refuse(`${where} has an invalid variable name ${JSON.stringify(key)}.`);
    if (!["string", "number", "boolean"].includes(typeof value)) refuse(`${where}.${key} must be a single literal value.`);
    const text = String(value);
    if (text.includes("${{")) {
      if (strict) refuse(`${where}.${key} uses a workflow expression; the local value is ambiguous.`);
      skipped.push(key);
      continue;
    }
    values[key] = text;
  }
  return { values, skipped };
}

// Reads the validate job's connection settings and checks them against its PostgreSQL service.
export async function readCiConfiguration(text) {
  const load = await loadYamlParser();
  let workflow;
  try { workflow = load(text); } catch (error) { refuse(`ci.yml is not valid YAML: ${error.message}`); }
  const job = workflow?.jobs?.[CI_JOB];
  if (!isRecord(job)) refuse(`ci.yml has no "${CI_JOB}" job.`);
  const where = `jobs.${CI_JOB}`;
  const jobEnvironment = scalarEnvironment(job.env, `${where}.env`, { strict: false });
  if (jobEnvironment.skipped.includes("DATABASE_URL")) refuse(`${where}.env.DATABASE_URL uses a workflow expression; the local value is ambiguous.`);
  const ciUrl = jobEnvironment.values.DATABASE_URL;
  if (!ciUrl) refuse(`${where}.env has no DATABASE_URL.`);

  const services = Object.entries(isRecord(job.services) ? job.services : {})
    .filter(([, service]) => isRecord(service) && /(?:^|\/)postgres(?:[:@][^/]*)?$/u.test(String(service.image ?? "")));
  if (services.length !== 1) refuse(`${where} must have exactly one PostgreSQL service; found ${services.length}.`);
  const [serviceName, service] = services[0];
  const serviceEnvironment = scalarEnvironment(service.env, `${where}.services.${serviceName}.env`, { strict: true }).values;
  const ports = Array.isArray(service.ports) ? service.ports : [];
  const mapping = ports.length === 1 ? /^(\d{1,5}):(\d{1,5})$/u.exec(String(ports[0])) : null;
  if (!mapping) refuse(`${where}.services.${serviceName}.ports must hold exactly one host:container mapping.`);

  let url;
  try { url = new URL(ciUrl); } catch { refuse(`${where}.env.DATABASE_URL is not a valid URL.`); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) refuse(`${where}.env.DATABASE_URL is not a PostgreSQL URL.`);
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_URL_QUERY.has(key)) refuse(`${where}.env.DATABASE_URL carries the "${key}" query parameter, which could redirect the connection.`);
  }
  const host = LOOPBACK_NAMES.get(url.hostname);
  if (!host) refuse(`${where}.env.DATABASE_URL names host ${JSON.stringify(url.hostname)}, which is not loopback.`);
  if (!url.port) refuse(`${where}.env.DATABASE_URL must name its port.`);
  if (url.port !== String(Number(mapping[1]))) refuse(`${where}.env.DATABASE_URL port does not match the ${serviceName} service's host port.`);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const ciDatabase = decodeURIComponent(url.pathname.slice(1));
  if (!user || user !== serviceEnvironment.POSTGRES_USER) refuse(`${where}.env.DATABASE_URL user does not match the ${serviceName} service's POSTGRES_USER.`);
  if (!password || password !== serviceEnvironment.POSTGRES_PASSWORD) refuse(`${where}.env.DATABASE_URL password does not match the ${serviceName} service's POSTGRES_PASSWORD.`);
  if (ciDatabase !== serviceEnvironment.POSTGRES_DB) refuse(`${where}.env.DATABASE_URL database does not match the ${serviceName} service's POSTGRES_DB.`);

  const steps = (Array.isArray(job.steps) ? job.steps : []).filter((step) => isRecord(step) && typeof step.run === "string" && CI_TEST_COMMAND.test(step.run));
  if (steps.length !== 1) refuse(`${where} must have exactly one step that runs "npm test"; found ${steps.length}.`);
  const stepEnvironment = scalarEnvironment(steps[0].env, `${where}.steps[${JSON.stringify(steps[0].name ?? "npm test")}].env`, { strict: false });

  return {
    host,
    port: Number(mapping[1]),
    user,
    password,
    schema: url.searchParams.get("schema"),
    jobEnvironment: jobEnvironment.values,
    stepEnvironment: stepEnvironment.values,
    skipped: [...jobEnvironment.skipped, ...stepEnvironment.skipped]
  };
}

export function databaseUrl({ host, port, user, password, database, schema }) {
  const address = host.includes(":") ? `[${host}]` : host;
  const query = schema ? `?schema=${encodeURIComponent(schema)}` : "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${address}:${port}/${database}${query}`;
}

// pg reads PG<KEY> for every connection key at construction; evaluate it against `env`, not
// against whatever this process inherited. Construction is synchronous, so the swap is local.
export function driverParameters(config, env) {
  const inherited = process.env;
  process.env = { ...env };
  try {
    return new ConnectionParameters(config);
  } finally {
    process.env = inherited;
  }
}

function normalizedHost(host) {
  return typeof host === "string" ? host.replace(/^\[(.*)\]$/u, "$1") : host;
}

function assertDriverTarget(parameters, expected, label) {
  const host = normalizedHost(parameters.host);
  if (!LOOPBACK_HOSTS.has(host)) refuse(`${label} resolves to host ${JSON.stringify(String(parameters.host))}, which is not a loopback address.`);
  if (parameters.port !== expected.port) refuse(`${label} resolves to port ${parameters.port}, not the CI port ${expected.port}.`);
  if (parameters.user !== expected.user) refuse(`${label} resolves to a role other than the CI test role.`);
  if (typeof parameters.password !== "string" || parameters.password === "") refuse(`${label} has no password; the driver would fall back to a password file.`);
  if (parameters.database !== expected.database) refuse(`${label} resolves to database ${JSON.stringify(String(parameters.database))}, not ${expected.database}.`);
  if (parameters.options || parameters.replication) refuse(`${label} carries connection options or replication mode.`);
  return { host, port: parameters.port, user: parameters.user, password: parameters.password, database: parameters.database };
}

// Validates DATABASE_URL as the driver will use it under `env`.
export function inspectDatabaseUrl(value, expected, env = {}) {
  if (typeof value !== "string" || value.trim() === "") refuse("DATABASE_URL is missing; refusing to fall back to a default database.");
  let url;
  try { url = new URL(value); } catch { refuse("DATABASE_URL is not a valid URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) refuse("DATABASE_URL is not a PostgreSQL URL.");
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_URL_QUERY.has(key)) refuse(`DATABASE_URL carries the "${key}" query parameter, which could redirect the connection.`);
  }
  let parsed;
  try { parsed = parseConnectionString(value); } catch { refuse("DATABASE_URL cannot be parsed by the PostgreSQL driver."); }
  if (!DATABASE_NAME_PATTERN.test(String(parsed.database))) refuse(`DATABASE_URL names database ${JSON.stringify(String(parsed.database))}, outside ${DATABASE_NAME_PATTERN.source}.`);
  return assertDriverTarget(driverParameters({ connectionString: value }, env), expected, "DATABASE_URL");
}

function targetPgValues(target) {
  return { PGHOST: target.host, PGPORT: String(target.port), PGUSER: target.user, PGPASSWORD: target.password, PGDATABASE: target.database };
}

// The final-environment check shared by create, run and drop.
export function assertIsolatedEnvironment(env, expected) {
  const target = inspectDatabaseUrl(env.DATABASE_URL, expected, env);
  const pgValues = targetPgValues(target);
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value === "") continue;
    if (name !== "DATABASE_URL" && DATABASE_URL_INPUT.test(name)) refuse(`${name} is set; it would point a suite at another database. It must be empty.`);
    if (PG_VARIABLE.test(name) && pgValues[name] !== String(value)) refuse(`${name} is set and could override the test connection. It must be empty or name the test database.`);
  }
  return target;
}

export function pgVariableNames(inherited = {}) {
  const names = new Set([...Object.keys(targetPgValues({})), ...SPECIAL_PG_VARIABLES]);
  for (const key of Object.keys(pg.defaults)) if (/^[A-Za-z_]+$/u.test(key)) names.add(`PG${key.toUpperCase()}`);
  for (const key of Object.keys(inherited)) if (PG_VARIABLE.test(key)) names.add(key);
  return [...names].sort();
}

export function databaseUrlInputNames(...sources) {
  const names = new Set(KNOWN_DATABASE_URL_INPUTS);
  for (const source of sources) for (const key of Object.keys(source ?? {})) if (DATABASE_URL_INPUT.test(key)) names.add(key);
  return [...names].sort();
}

export function buildEnvironment({ exampleText, ci, database, inherited = {} }) {
  assertDatabaseName(database);
  const example = parseDotenv(exampleText);
  const values = new Map(Object.entries({ ...example, ...ci.jobEnvironment, ...ci.stepEnvironment }));
  const target = { host: ci.host, port: ci.port, user: ci.user, password: ci.password, database };
  const isolation = new Map([["DATABASE_URL", databaseUrl({ ...target, schema: ci.schema })]]);
  for (const name of databaseUrlInputNames(example, ci.jobEnvironment, ci.stepEnvironment, inherited)) if (name !== "DATABASE_URL") isolation.set(name, "");
  const pgValues = targetPgValues(target);
  for (const name of pgVariableNames(inherited)) isolation.set(name, pgValues[name] ?? "");
  for (const name of isolation.keys()) values.delete(name);
  return { base: values, isolation, values: new Map([...values, ...isolation]), target };
}

export function renderEnvFile({ base, isolation, database }) {
  const lines = [
    `# Generated by scripts/test-env.mjs for ${database}. Do not edit; regenerate or drop it with`,
    `#   npm run test:env:drop -- ${database}`,
    "# Load it into a shell with: set -a; . <this file>; set +a",
    "# Sources: .env.example, then the CI validate job's env and its npm test step's env."
  ];
  const section = (entries) => {
    for (const [key, value] of entries) {
      if (!ENV_KEY.test(key)) refuse(`Refusing variable name ${JSON.stringify(key)}.`);
      if (UNSAFE_VALUE.test(value)) refuse(`${key} contains a double quote, $, backtick, backslash or line break, which the env file cannot carry literally.`);
      lines.push(`${key}="${value}"`);
    }
  };
  section(base);
  lines.push("", "# Isolation: the test database, and every other database input cleared.");
  section(isolation);
  return `${lines.join("\n")}\n`;
}

// The maintenance connection is separate from the test database: it reaches only the maintenance
// database, and only to create, drop or look up the one validated name.
function maintenanceConfig(ci) {
  const config = { host: ci.host, port: ci.port, user: ci.user, password: ci.password, database: MAINTENANCE_DATABASE };
  assertDriverTarget(driverParameters(config, {}), { port: ci.port, user: ci.user, database: MAINTENANCE_DATABASE }, "The maintenance connection");
  return config;
}

function expectedTarget(ci, database) {
  return { host: ci.host, port: ci.port, user: ci.user, database };
}

const quoteIdentifier = (name) => `"${assertDatabaseName(name)}"`;

// Strips every inherited database input so neither pg nor a child process can pick one up.
export function withoutDatabaseInputs(env) {
  const clean = {};
  for (const [key, value] of Object.entries(env)) {
    if (PG_VARIABLE.test(key) || DATABASE_URL_INPUT.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

async function defaultConnect(config) {
  const client = (() => {
    const inherited = process.env;
    process.env = withoutDatabaseInputs(inherited);
    try { return new pg.Client(config); } finally { process.env = inherited; }
  })();
  assertDriverTarget(client.connectionParameters, { port: config.port, user: config.user, database: MAINTENANCE_DATABASE }, "The maintenance connection");
  await client.connect();
  return client;
}

function defaultSpawn(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(command, args, { ...options, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
}

function defaultWriteEnvFile(path, text) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}

async function databaseExists(client, database) {
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [assertDatabaseName(database)]);
  return result.rows.length > 0;
}

async function create(io, [name, ...extra]) {
  if (extra.length) refuse(`Unexpected arguments after the name: ${extra.join(" ")}`);
  const database = resolveDatabaseName(name);
  const paths = projectPaths(io.root);
  const ci = await readCiConfiguration(io.readText(paths.workflow));
  const environment = buildEnvironment({ exampleText: io.readText(paths.example), ci, database, inherited: io.env });
  const text = renderEnvFile({ ...environment, database });
  assertIsolatedEnvironment(Object.fromEntries(environment.values), expectedTarget(ci, database));
  const path = envFilePath(database, io.root);
  const maintenance = maintenanceConfig(ci);

  const client = await io.connect(maintenance);
  try {
    if (await databaseExists(client, database)) {
      refuse(`${database} already exists. Drop it with npm run test:env:drop -- ${database}, then create it again.`);
    }
    await client.query(`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE template0`);
    try {
      io.writeEnvFile(path, text);
    } catch (error) {
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
      throw error;
    }
  } finally {
    await client.end();
  }
  for (const key of ci.skipped) io.stderr(`Not reproduced locally (workflow expression): ${key}`);
  const shown = relative(process.cwd(), path) || path;
  io.stdout([
    `Created ${database} on ${ci.host}:${ci.port} as the CI test role.`,
    `Env file: ${shown}`,
    `Load it:  set -a; . ${shown}; set +a`,
    `Or run:   node scripts/test-env.mjs run ${database} -- <command>`,
    `Drop it:  npm run test:env:drop -- ${database}`
  ].join("\n"));
  return 0;
}

async function drop(io, [name, ...extra]) {
  if (extra.length) refuse(`Unexpected arguments after the name: ${extra.join(" ")}`);
  const database = resolveDatabaseName(name);
  const paths = projectPaths(io.root);
  const ci = await readCiConfiguration(io.readText(paths.workflow));
  const path = envFilePath(database, io.root);
  const maintenance = maintenanceConfig(ci);

  const client = await io.connect(maintenance);
  let present;
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    present = await databaseExists(client, database);
  } finally {
    await client.end();
  }
  if (present) throw new Error(`${database} still exists after DROP DATABASE.`);
  io.removeFile(path);
  io.stdout(`Dropped ${database}: absent from pg_database on ${ci.host}:${ci.port}. Removed its env file.`);
  return 0;
}

async function run(io, [name, ...rest]) {
  const database = resolveDatabaseName(name);
  const command = rest[0] === "--" ? rest.slice(1) : rest;
  if (command.length === 0) refuse(`Name the command to run, for example: node scripts/test-env.mjs run ${database} -- npm test`);
  const paths = projectPaths(io.root);
  const ci = await readCiConfiguration(io.readText(paths.workflow));
  const path = envFilePath(database, io.root);
  if (!io.fileExists(path)) refuse(`${database} has no env file. Create it with npm run test:env -- ${database}`);
  const fileValues = parseDotenv(io.readText(path));
  const childEnvironment = withoutDatabaseInputs(io.env);
  // An inherited NODE_ENV (development) breaks next build; the tools choose their own.
  delete childEnvironment.NODE_ENV;
  Object.assign(childEnvironment, fileValues);
  assertIsolatedEnvironment(childEnvironment, expectedTarget(ci, database));
  return io.spawn(command[0], command.slice(1), { cwd: process.cwd(), env: childEnvironment });
}

const USAGE = [
  "Usage:",
  "  npm run test:env -- <name>                            create jitm_design_<name> and its env file",
  "  node scripts/test-env.mjs run <name> -- <command...>  run a command with only that env file",
  "  npm run test:env:drop -- <name>                       drop jitm_design_<name> and its env file"
].join("\n");

export async function main(argv, dependencies = {}) {
  const io = {
    root: ROOT,
    env: process.env,
    readText: (path) => readFileSync(path, "utf8"),
    fileExists: (path) => existsSync(path),
    writeEnvFile: defaultWriteEnvFile,
    removeFile: (path) => rmSync(path, { force: true }),
    connect: defaultConnect,
    spawn: defaultSpawn,
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
    ...dependencies
  };
  const [command, ...args] = argv;
  try {
    if (command === "create") return await create(io, args);
    if (command === "drop") return await drop(io, args);
    if (command === "run") return await run(io, args);
    io.stderr(USAGE);
    return 2;
  } catch (error) {
    if (error instanceof GuardError) {
      io.stderr(`test-env refused: ${error.message}`);
      return 1;
    }
    io.stderr(`test-env failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // create clears the inherited names in the env file and run strips them from the child; this
  // process itself drops them before any driver object exists.
  const inherited = { ...process.env };
  for (const key of Object.keys(process.env)) if (PG_VARIABLE.test(key) || DATABASE_URL_INPUT.test(key)) delete process.env[key];
  process.exitCode = await main(process.argv.slice(2), { env: inherited });
}
