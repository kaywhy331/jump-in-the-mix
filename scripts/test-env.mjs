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
//
// The command that `run` starts gets an EMPTY environment, not from the caller's: only the
// names allowlisted in scripts/test-env.config.json pass through (PATH, HOME and a few more),
// then the env file and the pins are added. No inherited npm, Node, dotenv, Prisma or Vitest
// setting can reach it, whatever its name. The pins fix every loader input the child reads:
// - dotenv/config (prisma.config.ts, vitest.config.ts, the database scripts) takes its file,
//   override and vault key from DOTENV_* variables; the names are read from the installed dotenv,
//   the file is pinned to the env file and every other control is set empty;
// - NODE_OPTIONS (which can preload code) is fixed to CI's value or empty;
// - npm's user and global config files are pinned to owned, empty files next to the env file.
// Before the spawn, the child's dotenv load is replayed and must change nothing, and the npm the
// child will find on its PATH is loaded with its own config loader: npm must read no project
// .npmrc, no setting from its config files, and hand its scripts an environment that still
// passes every check, for the command itself and for an npm started from one of its scripts.
import { spawn as spawnProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";
import pg from "pg";

const require = createRequire(import.meta.url);
// The dotenv copy the child's configs import (`dotenv/config` resolves to the same package).
const dotenv = require("dotenv");
// Resolve the connection-string parser and the parameter resolver that pg itself uses, so the
// guard checks the configuration the driver will actually connect with.
const requireFromPg = createRequire(require.resolve("pg"));
const { parse: parseConnectionString } = requireFromPg("pg-connection-string");
const ConnectionParameters = requireFromPg("./connection-parameters.js");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The one config this script owns: the inherited-variable allowlist and the pinned file paths.
export const CONFIG_FILE = join(dirname(fileURLToPath(import.meta.url)), "test-env.config.json");

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
// dotenv's controls and vault key. The names it actually reads are found at run time
// (dotenvLoaderInputs); any other DOTENV_* name is removed as well.
const DOTENV_VARIABLE = /^DOTENV_/u;
// Inputs of the loaders around the child's config files: jiti (Prisma's config loader) takes
// import aliases from JITI_*, and tsx takes a tsconfig path from TSX_*. Never in the child.
const CONFIG_LOADER_VARIABLE = /^(?:JITI|TSX)_/u;
// Node reads NODE_OPTIONS before any config file, and its --require and --import preload code; npm
// turns its node-options setting, from any of its config layers, into NODE_OPTIONS for scripts.
const NODE_OPTIONS = "NODE_OPTIONS";
// npm reads every npm_config_* variable, in any letter case, as a setting (npm's loadEnv).
const NPM_CONFIG_VARIABLE = /^npm_config_/iu;
const NPM_NODE_OPTIONS = /^npm_config_node[-_]options$/iu;
// The npm layers that are files; the helper's own files must set nothing, and no project file may exist.
const NPM_FILE_LAYERS = ["project", "user", "global"];
const NPM_CLI_SCRIPT = /[\\/]bin[\\/](np[mx])-cli\.js$/u;
const DATABASE_PLACEHOLDER = "{database}";
const FILE_KEYS = ["envFile", "npmUserConfig", "npmGlobalConfig"];

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
    workflow: join(root, ".github", "workflows", "ci.yml")
  };
}

const isDatabaseInput = (key) => PG_VARIABLE.test(key) || DATABASE_URL_INPUT.test(key);

function isLoaderInput(name) {
  return DOTENV_VARIABLE.test(name) || CONFIG_LOADER_VARIABLE.test(name) || NPM_CONFIG_VARIABLE.test(name) || name === NODE_OPTIONS;
}

// Checks the config this script owns. The allowlist may never name a database input, a loader
// input or NODE_ENV (next build fails under development); file paths stay inside the repository.
export function parseTestEnvConfig(value) {
  if (!isRecord(value)) refuse("test-env.config.json must hold an object.");
  const { inherit, files, npmConfigPins } = value;
  if (!isRecord(inherit) || !Array.isArray(inherit.all)) refuse("test-env.config.json needs inherit.all: the variables the child may inherit on every platform.");
  const lists = {};
  for (const [platform, names] of Object.entries(inherit)) {
    if (!Array.isArray(names)) refuse(`inherit.${platform} must be a list of variable names.`);
    for (const name of names) {
      if (typeof name !== "string" || !ENV_KEY.test(name)) refuse(`inherit.${platform} has an invalid variable name ${JSON.stringify(name)}.`);
      // Windows reads names in any letter case, so the upper-case form is checked as well.
      for (const form of new Set([name, name.toUpperCase()])) {
        if (isDatabaseInput(form) || isLoaderInput(form) || form === "NODE_ENV") {
          refuse(`inherit.${platform} names ${name}, which can change the database or what the child's loaders read; the child never inherits it.`);
        }
      }
    }
    lists[platform] = Object.freeze([...names]);
  }
  if (!isRecord(files)) refuse("test-env.config.json needs files: the env file and npm config file paths.");
  const templates = {};
  for (const key of FILE_KEYS) {
    const template = files[key];
    if (typeof template !== "string" || !template.includes(DATABASE_PLACEHOLDER) || isAbsolute(template) || template.split(/[\\/]/u).includes("..")) {
      refuse(`files.${key} must be a relative path inside the repository that contains ${DATABASE_PLACEHOLDER}.`);
    }
    templates[key] = template;
  }
  // npm refuses to load one file as both its user and its global config.
  if (new Set(Object.values(templates)).size !== FILE_KEYS.length) refuse("files must name three different paths.");
  if (!isRecord(npmConfigPins)) refuse("test-env.config.json needs npmConfigPins: the npm settings that name its config files.");
  const pins = {};
  for (const [name, fileKey] of Object.entries(npmConfigPins)) {
    if (!/^npm_config_[a-z0-9_]+$/u.test(name)) refuse(`npmConfigPins has an invalid npm variable ${JSON.stringify(name)}.`);
    if (!FILE_KEYS.includes(fileKey) || fileKey === "envFile") refuse(`npmConfigPins.${name} must name one of the npm config files.`);
    pins[name] = fileKey;
  }
  for (const required of ["npm_config_userconfig", "npm_config_globalconfig"]) {
    if (!pins[required]) refuse(`npmConfigPins must pin ${required}, or npm reads the caller's npmrc files.`);
  }
  return Object.freeze({ inherit: Object.freeze(lists), files: Object.freeze(templates), npmConfigPins: Object.freeze(pins) });
}

let ownConfig;
export function testEnvConfig() {
  if (!ownConfig) {
    let value;
    try { value = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch (error) { refuse(`Cannot read ${CONFIG_FILE}: ${error.message}`); }
    ownConfig = parseTestEnvConfig(value);
  }
  return ownConfig;
}

// The files the helper owns for one database, from the config's templates.
export function testEnvFiles(database, root = ROOT, config = testEnvConfig()) {
  assertDatabaseName(database);
  const paths = {};
  for (const [key, template] of Object.entries(config.files)) {
    const path = resolve(root, template.split(DATABASE_PLACEHOLDER).join(database));
    const inside = relative(root, path);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) refuse(`files.${key} resolves outside the repository.`);
    paths[key] = path;
  }
  return paths;
}

export function envFilePath(database, root = ROOT) {
  return testEnvFiles(database, root).envFile;
}

// The names the child may inherit on this platform. Windows compares names without letter case.
export function inheritedNames(platform = process.platform, config = testEnvConfig()) {
  return [...config.inherit.all, ...(config.inherit[platform] ?? [])];
}

// The child's starting environment: the allowlisted names the caller has set, and nothing else.
export function allowlistedEnvironment(env, platform = process.platform, config = testEnvConfig()) {
  const fold = platform === "win32" ? (name) => name.toUpperCase() : (name) => name;
  const allowed = new Set(inheritedNames(platform, config).map(fold));
  return Object.fromEntries(Object.entries(env).filter(([name, value]) => typeof value === "string" && allowed.has(fold(name))));
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

// Runs a synchronous function with process.env replaced, so a library's environment reads see
// `env` and nothing this process inherited.
function withProcessEnv(env, fn) {
  const inherited = process.env;
  process.env = env;
  try {
    return fn();
  } finally {
    process.env = inherited;
  }
}

// pg reads PG<KEY> for every connection key at construction; evaluate it against `env`, not
// against whatever this process inherited. Construction is synchronous, so the swap is local.
export function driverParameters(config, env) {
  return withProcessEnv({ ...env }, () => new ConnectionParameters(config));
}

// dotenv/config builds its options from lib/env-options (read from process.env once, at load) and
// lib/cli-options (read from the process arguments). Load a fresh copy of the first against `env`.
function dotenvEnvOptions(env) {
  const path = require.resolve("dotenv/lib/env-options");
  return withProcessEnv(env, () => {
    delete require.cache[path];
    try {
      return { ...require(path) };
    } finally {
      delete require.cache[path];
    }
  });
}

const dotenvCliOptions = (args) => ({ ...require("dotenv/lib/cli-options")(args) });

// The variables the installed dotenv reads, found by running its own code against a recording
// environment: lib/env-options at load, and config() with no file. `pathVariable` is the one that
// selects the file, found by giving every name a distinct marker.
export function dotenvLoaderInputs() {
  const read = new Set();
  const recorder = () => new Proxy({}, {
    get: (_target, key) => { if (typeof key === "string") read.add(key); return undefined; },
    has: (_target, key) => { if (typeof key === "string") read.add(key); return false; }
  });
  dotenvEnvOptions(recorder());
  withProcessEnv(recorder(), () => dotenv.config({ path: [], processEnv: recorder(), quiet: true }));
  const names = [...read].filter((name) => DOTENV_VARIABLE.test(name)).sort();
  const markers = Object.fromEntries(names.map((name) => [name, `marker:${name}`]));
  const options = dotenvEnvOptions(markers);
  const pathVariable = names.find((name) => options.path === markers[name]);
  return { names, pathVariable };
}

// The env file's path as dotenv and a shell both read it: forward slashes, so no backslash escapes.
const portablePath = (path) => path.split(sep).join("/");

// The loader inputs the child must see: dotenv pinned to the env file with every other control
// empty (dotenv treats any non-empty override, even "false", as true), and NODE_OPTIONS defined, so
// no env file a loader reads can add it. Its value is CI's, or empty.
export function loaderPins(envFile, ci) {
  const { names, pathVariable } = dotenvLoaderInputs();
  if (!pathVariable) refuse("The installed dotenv takes no file from the environment, so the child's dotenv/config cannot be pinned to the env file.");
  const pins = new Map(names.map((name) => [name, name === pathVariable ? portablePath(envFile) : ""]));
  pins.set(NODE_OPTIONS, ci.stepEnvironment[NODE_OPTIONS] ?? ci.jobEnvironment[NODE_OPTIONS] ?? "");
  return pins;
}

// npm's user and global config files, pinned to the helper's own empty files (the config names them).
export function npmConfigPins(files, config = testEnvConfig()) {
  return new Map(Object.entries(config.npmConfigPins).map(([name, fileKey]) => [name, portablePath(files[fileKey])]));
}

// Every pin the child gets: dotenv, NODE_OPTIONS and npm's config files.
export function childPins(files, ci, config = testEnvConfig()) {
  return new Map([...loaderPins(files.envFile, ci), ...npmConfigPins(files, config)]);
}

// Every loader input in `env` must be one of the pins, with the pinned value. In the environment npm
// hands to a script, npm adds its own settings as npm_config_*; those are checked against npm itself
// (assertNpmConfig), except node-options, which must never be there.
export function assertLoaderPins(env, pins, { npmExports = false } = {}) {
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !isLoaderInput(name) || pins.has(name)) continue;
    if (npmExports && NPM_CONFIG_VARIABLE.test(name) && !NPM_NODE_OPTIONS.test(name)) continue;
    refuse(`${name} is set; it could change what the child's loaders read. It must be absent.`);
  }
  for (const [name, value] of pins) {
    if (env[name] !== value) refuse(`${name} must be ${JSON.stringify(value)} so the child's loaders read only the env file; found ${JSON.stringify(env[name] ?? null)}.`);
  }
}

// Replays what dotenv/config does in the child, with dotenv's own option readers and populate:
// it must read only the env file, with no override and no vault key, and change nothing.
export function assertChildDotenvLoad(env, { envFile, fileText, args = [], expected }) {
  const fromArguments = dotenvCliOptions(args);
  if (JSON.stringify(fromArguments) !== JSON.stringify(dotenvCliOptions([]))) {
    refuse("The command passes dotenv options (dotenv_config_*), which would change the file the child loads.");
  }
  // Every name dotenv reads besides the file, including the vault key config() reads directly.
  const { names, pathVariable } = dotenvLoaderInputs();
  for (const name of names) {
    if (name !== pathVariable && env[name]) refuse(`${name} is set for the child's dotenv; it must be empty.`);
  }
  const fromEnvironment = dotenvEnvOptions({ ...env });
  for (const [option, value] of Object.entries(fromEnvironment)) {
    if (option !== "path" && value) refuse(`The child's dotenv would run with ${option}=${JSON.stringify(value)}; only the file may be set.`);
  }
  const options = { ...fromEnvironment, ...fromArguments };
  // An unset or empty path makes dotenv fall back to .env in the working directory.
  if (options.path !== portablePath(envFile)) refuse(`The child's dotenv would load ${JSON.stringify(String(options.path || ".env in the working directory"))}, not the env file.`);
  const loaded = { ...env };
  dotenv.populate(loaded, dotenv.parse(fileText), options);
  for (const name of new Set([...Object.keys(env), ...Object.keys(loaded)])) {
    if (loaded[name] !== env[name]) refuse(`The child's dotenv would change ${name} after validation.`);
  }
  return assertIsolatedEnvironment(loaded, expected);
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

export function buildEnvironment({ exampleText, ci, database, inherited = {}, root = ROOT, envFile }) {
  assertDatabaseName(database);
  const files = { ...testEnvFiles(database, root), ...(envFile ? { envFile } : {}) };
  const example = parseDotenv(exampleText);
  const values = new Map(Object.entries({ ...example, ...ci.jobEnvironment, ...ci.stepEnvironment }));
  const target = { host: ci.host, port: ci.port, user: ci.user, password: ci.password, database };
  const isolation = new Map([["DATABASE_URL", databaseUrl({ ...target, schema: ci.schema })]]);
  for (const name of databaseUrlInputNames(example, ci.jobEnvironment, ci.stepEnvironment, inherited)) if (name !== "DATABASE_URL") isolation.set(name, "");
  const pgValues = targetPgValues(target);
  for (const name of pgVariableNames(inherited)) isolation.set(name, pgValues[name] ?? "");
  const pins = childPins(files, ci);
  for (const [name, value] of pins) isolation.set(name, value);
  for (const name of [...values.keys()]) if (isLoaderInput(name)) values.delete(name);
  for (const name of isolation.keys()) values.delete(name);
  return { base: values, isolation, values: new Map([...values, ...isolation]), target, pins, files };
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
  lines.push("", "# Isolation: the test database, every other database input cleared, dotenv pinned to this file and npm to its own empty config files.");
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

// Strips every inherited database input so pg cannot pick one up.
export function withoutDatabaseInputs(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !isDatabaseInput(key)));
}

// npm: the effective configuration, read with the installed npm's own config loader.

const executableName = (program) => basename(String(program)).toLowerCase().replace(/\.(?:cmd|exe|bat|ps1)$/u, "");
const pathSeparator = (platform) => (platform === "win32" ? ";" : ":");

function environmentValue(env, name, platform) {
  if (platform !== "win32") return env[name];
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

// Finds `name` the way a spawn with this environment does: on the child's own PATH.
export function findOnPath(name, env, platform = process.platform) {
  const extensions = platform === "win32" ? ["", ...String(environmentValue(env, "PATHEXT", platform) ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)] : [""];
  for (const directory of String(environmentValue(env, "PATH", platform) ?? "").split(pathSeparator(platform))) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      try { if (statSync(candidate).isFile()) return candidate; } catch { /* not in this directory */ }
    }
  }
  return null;
}

// The npm installation behind an npm or npx executable: <root>/bin/np[mx]-cli.js through links, or
// the node_modules/npm folder beside a Windows shim. Anything else is unknown.
export function npmRootOf(executable) {
  let real;
  try { real = realpathSync(executable); } catch { return null; }
  if (NPM_CLI_SCRIPT.test(real)) return dirname(dirname(real));
  for (const candidate of new Set([join(dirname(executable), "node_modules", "npm"), join(dirname(real), "node_modules", "npm")])) {
    if (existsSync(join(candidate, "bin", "npm-cli.js"))) return candidate;
  }
  return null;
}

// npm reads npm_config_<key> in any letter case and normalises the key (npm's loadEnv).
const npmKey = (name) => name.slice("npm_config_".length).replace(/(?!^)_/gu, "-").toLowerCase();

// The npm runs a command can start: the command's own npm (npm, npx, or node .../npm-cli.js) with
// its arguments, and the npm on the child's PATH with none, as a script or a shell starts it.
export function npmInvocations(command, env, { cwd, platform = process.platform }) {
  const invocations = [];
  const add = (executable, argv, label) => {
    const root = npmRootOf(executable);
    if (!root) refuse(`${label} is ${executable}, and the helper cannot find npm's own config loader behind it, so npm's effective configuration cannot be checked.`);
    invocations.push({ root, argv, label });
  };
  const [program, ...args] = command;
  const name = executableName(program);
  if (name === "npm" || name === "npx") {
    const executable = /[\\/]/u.test(program) ? resolve(cwd, program) : findOnPath(program, env, platform);
    // When it is not on the child's PATH, the spawn cannot start it either.
    if (executable) add(executable, name === "npx" ? ["exec", ...args] : args, `The command's ${name}`);
  } else if (name === "node" && NPM_CLI_SCRIPT.test(String(args[0] ?? ""))) {
    const script = resolve(cwd, args[0]);
    add(script, NPM_CLI_SCRIPT.exec(script)[1] === "npx" ? ["exec", ...args.slice(1)] : args.slice(1), "The command's npm");
  }
  const fromPath = findOnPath("npm", env, platform);
  if (fromPath) add(fromPath, [], "The npm on the child's PATH");
  return invocations;
}

// Loads npm's configuration as that npm will in the child, with its own @npmcli/config. A project
// .npmrc is refused before any file is read: no environment value can override what it sets, and it
// may hold registry tokens, so the helper never opens it.
export async function loadNpmConfig({ root, env, cwd, argv = [], platform = process.platform }) {
  const requireFromNpm = createRequire(join(root, "package.json"));
  let Config, definitions, shorthands, flatten;
  try {
    Config = requireFromNpm("@npmcli/config");
    ({ definitions, shorthands, flatten } = requireFromNpm("@npmcli/config/lib/definitions"));
  } catch (error) {
    refuse(`Cannot load npm's config loader from ${root} (${error.message}), so npm's effective configuration cannot be checked.`);
  }
  const options = () => ({ definitions, shorthands, flatten, npmPath: root, env: { ...env }, argv: [process.execPath, join(root, "bin", "npm-cli.js"), ...argv], cwd, platform, execPath: process.execPath });
  try {
    // npm's own prefix walk (the --prefix flag, else the nearest package.json, else a workspace root).
    const prefix = new Config(options());
    prefix.loadDefaults();
    prefix.loadCLI();
    prefix.loadEnv();
    await prefix.loadLocalPrefix();
    const projectFile = resolve(prefix.localPrefix, ".npmrc");
    if (existsSync(projectFile)) {
      refuse(`npm would read the project config ${projectFile} after these checks, and it outranks every config file the helper pins (node-options, script-shell and the rest). Move it out of ${prefix.localPrefix}; the helper does not open it.`);
    }
    const config = new Config(options());
    await config.load();
    return config;
  } catch (error) {
    if (error instanceof GuardError) throw error;
    refuse(`npm's config loader in ${root} failed (${error.message}), so npm's effective configuration cannot be checked.`);
  }
}

// npm's effective configuration must leave the pins alone: its user and global config are the
// helper's files, no config file sets anything, the environment gives it nothing but those pins, and
// nothing sets node-options (npm would replace NODE_OPTIONS with it for every script).
export function assertNpmConfig(config, pins, { label, environmentPinsOnly = true }) {
  const npmPins = [...pins].filter(([name]) => NPM_CONFIG_VARIABLE.test(name));
  for (const [name, value] of npmPins) {
    const key = npmKey(name);
    const effective = config.get(key);
    if (typeof effective !== "string" || resolve(effective) !== resolve(value)) {
      refuse(`${label}: npm's ${key} would be ${JSON.stringify(effective ?? null)} (from npm's ${config.find(key)} config), not the helper's file ${value}.`);
    }
  }
  for (const where of NPM_FILE_LAYERS) {
    const layer = config.data.get(where);
    const keys = Object.keys(layer.raw ?? {});
    if (keys.length) refuse(`${label}: npm's ${where} config ${layer.source} sets ${keys.join(", ")}; the helper's npm config files must set nothing.`);
  }
  if (environmentPinsOnly) {
    const allowed = new Set(npmPins.map(([name]) => npmKey(name)));
    const extra = Object.keys(config.data.get("env").raw ?? {}).filter((key) => !allowed.has(key));
    if (extra.length) refuse(`${label}: the environment gives npm the settings ${extra.join(", ")}; only the helper's config files may be set.`);
  }
  if (config.get("node-options")) {
    refuse(`${label}: npm's node-options is set (from npm's ${config.find("node-options")} config); npm would replace the pinned NODE_OPTIONS with it for every script.`);
  }
}

// Before the spawn, every npm the child can start is loaded with its own config loader, and the
// environment it hands to its scripts must pass `checkScriptEnvironment`. So is an npm that one of
// those scripts starts in turn: in the package folder, with node_modules/.bin first on its PATH.
export async function assertNpmBoundary(env, { command, cwd, platform = process.platform, pins, checkScriptEnvironment }) {
  const checked = [];
  for (const { root, argv, label } of npmInvocations(command, env, { cwd, platform })) {
    const config = await loadNpmConfig({ root, env, cwd, argv, platform });
    assertNpmConfig(config, pins, { label });
    checkScriptEnvironment(config.env, label);
    checked.push({ label, root, localPrefix: config.localPrefix });

    const nestedLabel = `${label}, then npm from a script in ${config.localPrefix}`;
    const scriptPath = [join(config.localPrefix, "node_modules", ".bin"), environmentValue(config.env, "PATH", platform) ?? ""].join(pathSeparator(platform));
    const nestedExecutable = findOnPath("npm", { PATH: scriptPath, PATHEXT: environmentValue(config.env, "PATHEXT", platform) }, platform);
    if (!nestedExecutable) continue;
    const nestedRoot = npmRootOf(nestedExecutable);
    if (!nestedRoot) refuse(`${nestedLabel}: npm is ${nestedExecutable}, and the helper cannot find npm's own config loader behind it.`);
    const nested = await loadNpmConfig({ root: nestedRoot, env: config.env, cwd: config.localPrefix, argv: [], platform });
    // A script's environment already carries npm's own exported settings.
    assertNpmConfig(nested, pins, { label: nestedLabel, environmentPinsOnly: false });
    checkScriptEnvironment(nested.env, nestedLabel);
    checked.push({ label: nestedLabel, root: nestedRoot, localPrefix: nested.localPrefix });
  }
  return checked;
}

// The npm config files the helper owns: present, so npm has nothing to fall back to, and empty.
const npmConfigText = (database, role) => `# Generated by scripts/test-env.mjs: npm's ${role} config while testing against ${database}.\n# Deliberately empty, so npm reads no setting from your home or global npmrc. Do not edit.\n`;

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
  const files = testEnvFiles(database, io.root);
  const path = files.envFile;
  const environment = buildEnvironment({ exampleText: io.readText(paths.example), ci, database, inherited: io.env, root: io.root });
  const text = renderEnvFile({ ...environment, database });
  const values = Object.fromEntries(environment.values);
  assertIsolatedEnvironment(values, expectedTarget(ci, database));
  assertLoaderPins(values, environment.pins);
  const maintenance = maintenanceConfig(ci);

  const client = await io.connect(maintenance);
  try {
    if (await databaseExists(client, database)) {
      refuse(`${database} already exists. Drop it with npm run test:env:drop -- ${database}, then create it again.`);
    }
    await client.query(`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE template0`);
    const written = [];
    try {
      io.writeEnvFile(path, text);
      written.push(path);
      for (const [file, role] of [[files.npmUserConfig, "user"], [files.npmGlobalConfig, "global"]]) {
        io.writeEnvFile(file, npmConfigText(database, role));
        written.push(file);
      }
    } catch (error) {
      for (const file of written) io.removeFile(file);
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
    `Env file: ${shown} (npm reads only ${relative(process.cwd(), files.npmUserConfig) || files.npmUserConfig} and its global twin)`,
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
  const files = testEnvFiles(database, io.root);
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
  for (const file of [files.envFile, files.npmUserConfig, files.npmGlobalConfig]) io.removeFile(file);
  io.stdout(`Dropped ${database}: absent from pg_database on ${ci.host}:${ci.port}. Removed its env file and npm config files.`);
  return 0;
}

async function run(io, [name, ...rest]) {
  const database = resolveDatabaseName(name);
  const command = rest[0] === "--" ? rest.slice(1) : rest;
  if (command.length === 0) refuse(`Name the command to run, for example: node scripts/test-env.mjs run ${database} -- npm test`);
  const paths = projectPaths(io.root);
  const ci = await readCiConfiguration(io.readText(paths.workflow));
  const files = testEnvFiles(database, io.root);
  const path = files.envFile;
  if (!io.fileExists(path)) refuse(`${database} has no env file. Create it with npm run test:env -- ${database}`);
  const fileText = io.readText(path);
  const fileValues = parseDotenv(fileText);
  const pins = childPins(files, ci);
  // A file written before the pins existed lacks them; any loader input it does carry must match.
  for (const [name, value] of Object.entries(fileValues)) {
    if (isLoaderInput(name) && pins.get(name) !== value) refuse(`The env file sets ${name}, which would change what the child's loaders read. Drop and create ${database} again.`);
  }
  // The child starts EMPTY: the allowlisted names the caller has set (scripts/test-env.config.json),
  // then the env file, then the pins. Nothing else the caller exports reaches it, whatever its name.
  const childEnvironment = { ...allowlistedEnvironment(io.env, io.platform), ...fileValues, ...Object.fromEntries(pins) };
  const expected = expectedTarget(ci, database);
  assertIsolatedEnvironment(childEnvironment, expected);
  assertLoaderPins(childEnvironment, pins);
  assertChildDotenvLoad(childEnvironment, { envFile: path, fileText, args: command, expected });
  // What npm will hand its scripts, read with npm's own config loader: it must pass the same checks.
  await assertNpmBoundary(childEnvironment, {
    command,
    cwd: io.cwd,
    platform: io.platform,
    pins,
    checkScriptEnvironment: (scriptEnvironment, label) => {
      try {
        assertIsolatedEnvironment(scriptEnvironment, expected);
        assertLoaderPins(scriptEnvironment, pins, { npmExports: true });
        assertChildDotenvLoad(scriptEnvironment, { envFile: path, fileText, args: [], expected });
      } catch (error) {
        if (error instanceof GuardError) refuse(`${label}: ${error.message}`);
        throw error;
      }
    }
  });
  return io.spawn(command[0], command.slice(1), { cwd: io.cwd, env: childEnvironment });
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
    cwd: process.cwd(),
    platform: process.platform,
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
  for (const key of Object.keys(process.env)) if (isDatabaseInput(key) || isLoaderInput(key)) delete process.env[key];
  process.exitCode = await main(process.argv.slice(2), { env: inherited });
}
