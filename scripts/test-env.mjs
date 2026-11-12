#!/usr/bin/env node
// One command for a disposable, loopback-only test database (JITM-12 §2.21). Start it only
// through the entry point scripts/test-env, which starts this file from a clean boundary:
//
//   scripts/test-env create <name>                    create jitm_design_<name> and write its env file
//   scripts/test-env run <name> -- <program> [args]   run one program with that env file only
//   scripts/test-env drop <name>                      drop jitm_design_<name> and remove its files
//
// The entry point never searches the caller's PATH and starts node twice under env -i: first
// with `launch-plan` (launchPlan below), which checks the arguments, resolves the toolchain from
// scripts/test-env.config.json and prepares the database's owned scratch HOME (empty again at
// every start) and toolchain bin folder; then for the command itself, with only that HOME, a PATH
// of that folder and the system's standard path, and the allowlisted names. launchBoundary
// refuses any other start. `run` takes plain argv: it resolves the program it is given to what it
// really is and refuses a shell outside the documented form, whatever its name (assertPlainCommand,
// assertResolvedCommand). The calling session is trusted, not hostile (docs/LOCAL_TESTING.md,
// "The trust boundary").
//
// The connection settings come from the CI `validate` job in .github/workflows/ci.yml,
// read with a YAML parser at run time; the env file starts from .env.example. The helper
// never reads .env, ~/.pgpass or any other credential store. Every database input it
// inherits (DATABASE_URL, the other *_DATABASE_URL and *_DB_URL names, every PG* variable)
// is cleared or set to the validated test database, and the final driver configuration is
// checked before any connection or child process is created.
//
// The command that `run` starts gets an EMPTY environment, not from the caller's: the owned HOME
// and the toolchain PATH, the names allowlisted in scripts/test-env.config.json (locale, terminal,
// TMPDIR, CI), then the env file and the pins. No inherited npm, Node, dotenv, Prisma or Vitest
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
import { createHash } from "node:crypto";
import { accessSync, closeSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
// The startup files a non-interactive shell reads: bash runs $BASH_ENV and a POSIX sh $ENV.
const SHELL_STARTUP_VARIABLES = new Set(["BASH_ENV", "ENV"]);
const DATABASE_PLACEHOLDER = "{database}";
const FILE_KEYS = ["envFile", "npmUserConfig", "npmGlobalConfig"];
// The clean boundary (scripts/test-env): these names are set by the entry point, never inherited.
const BOUNDARY_NAMES = ["HOME", "PATH"];
const BOUNDARY_FOLDERS = ["home", "bin"];
const NODE_PREFIX = "{nodePrefix}";
const PATH_BIN = "{bin}";
const PATH_STANDARD = "{standard}";
// The subcommand the entry point runs first, under env -i, to get its launch plan.
export const PLAN_COMMAND = "launch-plan";
const COMMANDS = new Set(["create", "run", "drop"]);
// The toolchain programs the bin folder holds, and the npm file each one leads to.
const TOOLCHAIN_LINKS = [["node", null], ["npm", "npm-cli.js"], ["npx", "npx-cli.js"]];
const UNSAFE_PATH = /[\r\n\0]/u;

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
  return DOTENV_VARIABLE.test(name) || CONFIG_LOADER_VARIABLE.test(name) || NPM_CONFIG_VARIABLE.test(name) || name === NODE_OPTIONS || SHELL_STARTUP_VARIABLES.has(name);
}

const insideTemplate = (template) => typeof template === "string" && template !== "" && !isAbsolute(template) && !template.split(/[\\/]/u).includes("..") && !UNSAFE_PATH.test(template);

// The boundary section: where the toolchain's node and npm are, the owned folders, and the PATH.
function parseBoundary(boundary, fileTemplates) {
  if (!isRecord(boundary)) refuse("test-env.config.json needs boundary: the toolchain, the scratch HOME, the bin folder and the PATH the entry point sets.");
  const { node, npm, path } = boundary;
  if (!insideTemplate(node) || node.includes(DATABASE_PLACEHOLDER) || node.includes("=")) refuse("boundary.node must be a relative path inside the repository: where a link to the toolchain's node may be.");
  if (typeof npm !== "string" || !npm.startsWith(`${NODE_PREFIX}/`) || npm.split(/[\\/]/u).includes("..") || UNSAFE_PATH.test(npm)) refuse(`boundary.npm must be a folder under ${NODE_PREFIX}, the node installation's prefix.`);
  const folders = {};
  for (const key of BOUNDARY_FOLDERS) {
    const template = boundary[key];
    if (!insideTemplate(template) || !template.includes(DATABASE_PLACEHOLDER)) refuse(`boundary.${key} must be a relative path inside the repository that contains ${DATABASE_PLACEHOLDER}.`);
    folders[key] = template;
  }
  if (new Set([...Object.values(folders), ...fileTemplates]).size !== BOUNDARY_FOLDERS.length + fileTemplates.length) refuse("boundary.home, boundary.bin and the files must name different paths.");
  if (!Array.isArray(path) || path[0] !== PATH_BIN || path.filter((entry) => entry === PATH_BIN).length !== 1) {
    refuse(`boundary.path must start with ${PATH_BIN}, once, so node, npm and npx resolve to the toolchain.`);
  }
  for (const entry of path) {
    if (entry === PATH_BIN || entry === PATH_STANDARD) continue;
    if (typeof entry !== "string" || !isAbsolute(entry) || entry.includes(":") || UNSAFE_PATH.test(entry)) refuse(`boundary.path entries are ${PATH_BIN}, ${PATH_STANDARD} or absolute folders; found ${JSON.stringify(entry)}.`);
  }
  return Object.freeze({ node, npm, ...folders, path: Object.freeze([...path]) });
}

// The run section: the shells `run` holds to the plain-argv rule and the options they must carry;
// the system's own list of shells and the shell exec falls back to for a text file with no #! line;
// and the wrappers (programs that start another program) that may not be handed a shell.
function parseRun(run) {
  if (!isRecord(run) || !Array.isArray(run.shells) || !Array.isArray(run.shellOptions)) refuse("test-env.config.json needs run.shells and run.shellOptions: the shells run checks and the options that keep their startup files unread.");
  for (const shell of run.shells) if (typeof shell !== "string" || !/^[a-z0-9]+$/u.test(shell)) refuse(`run.shells has an invalid program name ${JSON.stringify(shell)}.`);
  for (const option of run.shellOptions) if (typeof option !== "string" || !/^--[a-z]+$/u.test(option)) refuse(`run.shellOptions has an invalid option ${JSON.stringify(option)}.`);
  if (run.shellOptions.length === 0) refuse("run.shellOptions must name the options that stop a shell reading its startup files.");
  if (run.shellsFile !== undefined && run.shellsFile !== null && (typeof run.shellsFile !== "string" || !isAbsolute(run.shellsFile) || UNSAFE_PATH.test(run.shellsFile))) refuse("run.shellsFile must be the absolute path of the system's list of shells (/etc/shells), or null.");
  if (typeof run.fallbackShell !== "string" || !isAbsolute(run.fallbackShell) || UNSAFE_PATH.test(run.fallbackShell)) refuse("run.fallbackShell must be the absolute path of the shell exec runs a text file with no #! line with (/bin/sh).");
  if (!Array.isArray(run.wrappers) || run.wrappers.length === 0) refuse("test-env.config.json needs run.wrappers: the programs that start another program (env and the like), which run refuses when they are handed a shell.");
  for (const wrapper of run.wrappers) if (typeof wrapper !== "string" || !/^[a-z0-9][a-z0-9._+-]*\*?$/u.test(wrapper)) refuse(`run.wrappers has an invalid program name ${JSON.stringify(wrapper)}; a trailing * matches any ending.`);
  return Object.freeze({
    shells: Object.freeze([...run.shells]),
    shellsFile: run.shellsFile ?? null,
    fallbackShell: run.fallbackShell,
    shellOptions: Object.freeze([...run.shellOptions]),
    wrappers: Object.freeze([...run.wrappers])
  });
}

// Checks the config this script owns. The allowlist may never name a database input, a loader
// input, NODE_ENV (next build fails under development) or a name the entry point sets itself;
// file paths stay inside the repository.
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
        if (BOUNDARY_NAMES.includes(form)) refuse(`inherit.${platform} names ${name}, which the entry point sets itself (boundary); the child never inherits it.`);
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
  const boundary = parseBoundary(value.boundary, Object.values(templates));
  const run = parseRun(value.run);
  return Object.freeze({ inherit: Object.freeze(lists), files: Object.freeze(templates), npmConfigPins: Object.freeze(pins), boundary, run });
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
  for (const name of [...values.keys()]) if (isLoaderInput(name) || BOUNDARY_NAMES.includes(name)) values.delete(name);
  for (const name of isolation.keys()) values.delete(name);
  return { base: values, isolation, values: new Map([...values, ...isolation]), target, pins, files };
}

export function renderEnvFile({ base, isolation, database }) {
  const lines = [
    `# Generated by scripts/test-env.mjs for ${database}. Do not edit; regenerate or drop it with`,
    `#   scripts/test-env drop ${database}`,
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

// The clean boundary: the one entry point (scripts/test-env) and what it gives the helper.

// The per-database folders the entry point owns: the scratch HOME and the toolchain bin folder.
export function boundaryPaths(database, root = ROOT, config = testEnvConfig()) {
  assertDatabaseName(database);
  const paths = {};
  for (const key of BOUNDARY_FOLDERS) {
    const path = resolve(root, config.boundary[key].split(DATABASE_PLACEHOLDER).join(database));
    const inside = relative(root, path);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) refuse(`boundary.${key} resolves outside the repository.`);
    paths[key] = path;
  }
  return paths;
}

// The toolchain's node: the link boundary.node names when it exists, else the node on the system's
// standard path (`getconf PATH`, which the entry point passes in). Never the caller's PATH.
export function toolchainNode(standardPath, root = ROOT, config = testEnvConfig()) {
  const link = resolve(root, config.boundary.node);
  let candidate;
  try { lstatSync(link); candidate = link; } catch { candidate = findOnPath("node", { PATH: standardPath }, process.platform); }
  if (!candidate) refuse(`No node on the standard path ${JSON.stringify(standardPath)} and no link at ${config.boundary.node}. Link the node to use there (docs/LOCAL_TESTING.md, "Toolchain").`);
  let real;
  try { real = realpathSync(candidate); } catch (error) { refuse(`The toolchain's node ${candidate} does not resolve (${error.message}).`); }
  if (!statSync(real).isFile()) refuse(`The toolchain's node ${real} is not a file.`);
  // env(1) would read a program path with = as an assignment; the plan is read line by line.
  if (real.includes("=") || UNSAFE_PATH.test(real)) refuse(`The toolchain's node ${JSON.stringify(real)} has a character the launcher cannot pass on (= or a line break).`);
  return real;
}

// The toolchain's npm: the folder boundary.npm names under the node installation's own prefix.
export function toolchainNpm(node, config = testEnvConfig()) {
  const root = resolve(config.boundary.npm.split(NODE_PREFIX).join(dirname(dirname(node))));
  let name;
  try { ({ name } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))); } catch { /* checked below */ }
  const files = Object.fromEntries(TOOLCHAIN_LINKS.filter(([, file]) => file).map(([program, file]) => [program, join(root, "bin", file)]));
  if (name !== "npm" || Object.values(files).some((file) => !existsSync(file))) {
    refuse(`The toolchain's npm is not at ${root}, where boundary.npm in scripts/test-env.config.json places it for ${node}.`);
  }
  return { root, ...files };
}

// A folder the helper owns: a real directory (not a link), this user's, closed to everyone else.
export function assertOwnedFolder(path, label) {
  let stats;
  try { stats = lstatSync(path); } catch { refuse(`${label} ${path} does not exist; start the helper through scripts/test-env, which creates it.`); }
  if (!stats.isDirectory() || stats.isSymbolicLink()) refuse(`${label} ${path} is not a folder the helper created.`);
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) refuse(`${label} ${path} belongs to another user.`);
  if ((stats.mode & 0o077) !== 0) refuse(`${label} ${path} is open to other users (mode ${(stats.mode & 0o777).toString(8)}).`);
}

function ownedFolder(path, label) {
  let present = true;
  try { lstatSync(path); } catch { present = false; }
  if (!present) mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOwnedFolder(path, label);
}

// An owned folder made empty again: after the same checks, whatever an earlier command left in it
// is removed, so nothing one run writes there (an rc file, an npmrc, a tool) is there for the next.
function freshFolder(path, label) {
  let present = true;
  try { lstatSync(path); } catch { present = false; }
  if (present) {
    assertOwnedFolder(path, label);
    rmSync(path, { recursive: true, force: true });
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOwnedFolder(path, label);
}

// An owned folder that holds only `names`: every other entry is removed (a link is removed, never followed).
function prunedFolder(path, label, names) {
  ownedFolder(path, label);
  for (const entry of readdirSync(path)) if (!names.includes(entry)) rmSync(join(path, entry), { recursive: true, force: true });
}

// Points `link` at `target`; a link that already does is kept, anything else is replaced at once.
function linkTo(target, link) {
  try { if (readlinkSync(link) === target) return; } catch { /* absent, or not a link */ }
  const temporary = `${link}.${process.pid}.tmp`;
  rmSync(temporary, { force: true });
  symlinkSync(target, temporary);
  renameSync(temporary, link);
}

function commandDatabase(argv) {
  const [command, name] = argv;
  return COMMANDS.has(command) ? resolveDatabaseName(name) : null;
}

// Step one of the entry point, run under `env -i PATH=<standard path>`: check the arguments, find
// the toolchain, and prepare the database's scratch HOME and bin folder. Every start makes the HOME
// empty again and leaves only the node, npm and npx links in the bin folder, so no rc file, npmrc
// or tool an earlier command left there reaches this one. Returns null for an unknown command (the
// caller prints usage). Nothing here reads the caller's environment: it has none.
export function launchPlan({ argv, env, execPath, execArgv = [], root = ROOT, platform = process.platform, config = testEnvConfig() }) {
  if (platform === "win32") refuse("scripts/test-env is a POSIX launcher; on Windows, run it inside WSL.");
  if (execArgv.length) refuse(`node was started with ${execArgv.join(" ")}; the entry point starts it with no options.`);
  const extra = Object.keys(env).filter((name) => name !== "PATH");
  if (extra.length) refuse(`The launch plan runs under env -i with only the standard PATH; it found ${extra.join(", ")}.`);
  const standard = String(env.PATH ?? "");
  if (!standard || standard.split(":").some((entry) => !isAbsolute(entry)) || UNSAFE_PATH.test(standard)) refuse(`The standard path ${JSON.stringify(standard)} must name absolute folders.`);
  const database = commandDatabase(argv);
  if (!database) return null;
  const node = toolchainNode(standard, root, config);
  if (realpathSync(execPath) !== node) refuse(`The launcher started ${execPath}, not the toolchain's node ${node}.`);
  const npm = toolchainNpm(node, config);
  const { home, bin } = boundaryPaths(database, root, config);
  for (const path of [home, bin]) if (UNSAFE_PATH.test(path) || path.includes(":")) refuse(`The repository path ${JSON.stringify(path)} has a character the launcher cannot pass on (: or a line break).`);
  freshFolder(home, "The scratch HOME");
  prunedFolder(bin, "The toolchain folder", TOOLCHAIN_LINKS.map(([program]) => program));
  for (const [program] of TOOLCHAIN_LINKS) linkTo(program === "node" ? node : npm[program], join(bin, program));
  const path = config.boundary.path.map((entry) => (entry === PATH_BIN ? bin : entry === PATH_STANDARD ? standard : entry)).join(":");
  return { database, node, home, bin, path, inherit: inheritedNames(platform, config) };
}

// The plan as the launcher reads it: one NAME=value line each, then one INHERIT=<name> per allowed name.
export function renderLaunchPlan(plan) {
  return [`NODE=${plan.node}`, `HOME=${plan.home}`, `PATH=${plan.path}`, ...plan.inherit.map((name) => `INHERIT=${name}`)].join("\n");
}

// Step two: this process must have been started by the entry point. Its environment holds only
// the allowlisted names, HOME is the database's scratch home and PATH starts with its toolchain
// folder, whose links lead to the node running this file and that node's own npm. A direct
// `node scripts/test-env.mjs …` from a shell is refused. Returns null for an unknown command.
export function launchBoundary({ argv, env, execPath, execArgv = [], root = ROOT, platform = process.platform, config = testEnvConfig() }) {
  const database = commandDatabase(argv);
  if (!database) return null;
  const start = "start it through scripts/test-env (docs/LOCAL_TESTING.md)";
  if (platform === "win32") refuse("scripts/test-env is a POSIX launcher; on Windows, run it inside WSL.");
  if (execArgv.length) refuse(`node was started with ${execArgv.join(" ")}; ${start}.`);
  const allowed = new Set([...inheritedNames(platform, config), ...BOUNDARY_NAMES]);
  const extra = Object.keys(env).filter((name) => !allowed.has(name)).sort();
  if (extra.length) refuse(`The helper's own environment holds ${extra.length} name(s) the boundary does not allow (${extra.slice(0, 6).join(", ")}${extra.length > 6 ? ", …" : ""}); ${start}, which starts it from an empty environment.`);
  const { home, bin } = boundaryPaths(database, root, config);
  if (env.HOME !== home) refuse(`HOME is ${JSON.stringify(env.HOME ?? null)}, not the scratch home ${home}; ${start}.`);
  assertOwnedFolder(home, "The scratch HOME");
  assertOwnedFolder(bin, "The toolchain folder");
  const entries = String(env.PATH ?? "").split(":");
  if (entries[0] !== bin || entries.some((entry) => !isAbsolute(entry))) refuse(`PATH must start with the toolchain folder ${bin} and name only absolute folders; ${start}.`);
  const node = realpathSync(execPath);
  const npm = toolchainNpm(node, config);
  for (const [program] of TOOLCHAIN_LINKS) {
    const target = program === "node" ? node : realpathSync(npm[program]);
    let actual = null;
    try { actual = realpathSync(join(bin, program)); } catch { /* missing */ }
    if (actual !== target) refuse(`${join(bin, program)} does not lead to the toolchain's ${program} ${target}; ${start}.`);
  }
  return { database, node, home, bin, path: env.PATH };
}

// Plain argv only (docs/LOCAL_TESTING.md, "Plain argv only"). `run` checks the command twice, both
// times before any child process:
// - by name, first (assertPlainCommand): a program named like a shell (run.shells) must take the
//   documented form, run.shellOptions (--noprofile --norc) before any single-letter option and a
//   command (-c) or a script, and must not be interactive, a login shell or read commands from
//   standard input: those forms read startup files (~/.bashrc, ~/.profile, /etc/profile) or the
//   terminal after the checks.
// - by what the program really is, last, against the child's own environment
//   (assertResolvedCommand): every file the spawn could start under that name, through every link
//   and every #! line, as exec and the kernel follow them. A file that is a shell, whatever name
//   or path it was called by, takes the same documented form; a script whose #! line (or exec's
//   fallback for a text file with none) starts a shell is refused; a wrapper (run.wrappers: env,
//   nice, timeout, ...) that is handed a shell is refused; a program run cannot find or read is
//   refused. Other programs start as they are, with no shell between them and the helper.
const SHELL_REFUSED_LETTERS = { i: "an interactive shell", l: "a login shell", s: "a shell that reads commands from standard input" };
const SHELL_REFUSED_LONG = /^--(?:login|interactive|rcfile|init-file)(?:=|$)/u;
const SHELL_REFUSED_SETTINGS = new Set(["interactive", "login"]);
// A shell installed under a versioned name, such as ksh93, zsh5 or bash-5.2.
const SHELL_VERSION = /^-?\d[\d.]*$/u;
// The first block of a file: enough for a #! line and to tell a binary (a NUL byte) from text.
const HEADER_BYTES = 4096;

const shellUsage = (config) => `Name the program directly, or start a shell with ${config.run.shellOptions.join(" ")} -c '<command>' (bash takes them; dash, the sh of Debian and Ubuntu, does not)`;

// The documented form, for a program known to be a shell. `name` is how the messages name it.
function assertShellForm(name, args, config) {
  const usage = shellUsage(config);
  const seen = new Set();
  let short = false, commandString = false, operand = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--" || arg === "-") { operand = index + 1 < args.length; break; }
    if (arg.startsWith("--")) {
      if (SHELL_REFUSED_LONG.test(arg)) refuse(`run refuses ${name} ${arg}: it makes the shell read startup files after the checks. ${usage}.`);
      if (short) refuse(`run refuses ${name} ${arg} after a single-letter option: ${name} reads long options only before them. ${usage}.`);
      seen.add(arg);
      continue;
    }
    if (/^[-+][A-Za-z]+$/u.test(arg)) {
      short = true;
      if (arg[0] === "-") {
        for (const letter of arg.slice(1)) {
          if (SHELL_REFUSED_LETTERS[letter]) refuse(`run refuses ${name} ${arg}: ${SHELL_REFUSED_LETTERS[letter]} reads startup files or the terminal after the checks. ${usage}.`);
        }
        if (arg.includes("c")) commandString = true;
      }
      // -o and -O take the next word: a setting such as `-o interactive` is refused too.
      if (/[oO]$/u.test(arg)) {
        index += 1;
        if (SHELL_REFUSED_SETTINGS.has(String(args[index] ?? "").toLowerCase().replace(/[_-]/gu, ""))) refuse(`run refuses ${name} ${arg} ${args[index]}. ${usage}.`);
      }
      continue;
    }
    operand = true;
    break;
  }
  const missing = config.run.shellOptions.filter((option) => !seen.has(option));
  if (missing.length) refuse(`run refuses ${name} without ${missing.join(" ")}: it would read its startup files. ${usage}.`);
  if (!commandString && !operand) refuse(`run refuses ${name} with no -c and no script: it would read commands from the terminal. ${usage}.`);
}

const isShellName = (name, config) => config.run.shells.some((shell) => name === shell || (name.startsWith(shell) && SHELL_VERSION.test(name.slice(shell.length))));
const isWrapperName = (name, config) => config.run.wrappers.some((wrapper) => (wrapper.endsWith("*") ? name.startsWith(wrapper.slice(0, -1)) : name === wrapper));

// The check by name: R3's rule, for every name in run.shells.
export function assertPlainCommand(command, config = testEnvConfig()) {
  const [program, ...args] = command;
  if (typeof program !== "string" || program === "") refuse("Name the program to run.");
  const name = basename(program);
  if (name.startsWith("-")) refuse(`${program} names a login shell; run starts a plain program.`);
  if (isShellName(name, config)) assertShellForm(name, args, config);
}

function isExecutable(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Every file a spawn of `program` could start: the path itself when it names a folder (or when a #!
// line names it: the kernel never searches PATH), else every executable match on the child's PATH.
// exec takes the first match it may run; run checks them all. An empty PATH entry is the working
// directory, as for exec.
function programFiles(program, context, { asPath = false } = {}) {
  const { env, cwd, platform } = context;
  if (asPath || (platform === "win32" ? /[\\/]/u : /\//u).test(program)) {
    const file = resolve(cwd, program);
    return isExecutable(file) ? [file] : [];
  }
  const extensions = platform === "win32" ? ["", ...String(environmentValue(env, "PATHEXT", platform) ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)] : [""];
  const files = [];
  for (const directory of String(environmentValue(env, "PATH", platform) ?? "").split(pathSeparator(platform))) {
    for (const extension of extensions) {
      const file = join(resolve(cwd, directory || "."), `${program}${extension}`);
      if (!files.includes(file) && isExecutable(file)) files.push(file);
    }
  }
  return files;
}

// The files this system's shells and wrappers are, through their links, found the way run finds a
// program: each run.shells and run.wrappers name on the child's PATH, and for shells each entry of
// the system's shell list (run.shellsFile) and the fallback shell (run.fallbackShell).
function knownFiles(context, kind) {
  const cache = kind === "shell" ? "shellFiles" : "wrapperFiles";
  if (context[cache]) return context[cache];
  const { config } = context;
  const paths = [];
  for (const name of kind === "shell" ? config.run.shells : config.run.wrappers.filter((wrapper) => !wrapper.endsWith("*"))) paths.push(...programFiles(name, context));
  if (kind === "shell") {
    paths.push(config.run.fallbackShell);
    if (config.run.shellsFile) {
      let text = "";
      try { text = readFileSync(config.run.shellsFile, "utf8"); } catch { /* this system keeps no shell list */ }
      for (const line of text.split("\n")) {
        const entry = line.trim();
        if (entry && !entry.startsWith("#") && isAbsolute(entry)) paths.push(entry);
      }
    }
  }
  const files = new Map();
  for (const path of paths) {
    try {
      const real = realpathSync(path);
      const stats = statSync(real);
      if (stats.isFile() && !files.has(real)) files.set(real, stats);
    } catch { /* not installed here */ }
  }
  context[cache] = files;
  return files;
}

function fileHash(path, context) {
  if (!context.hashes.has(path)) context.hashes.set(path, createHash("sha256").update(readFileSync(path)).digest("hex"));
  return context.hashes.get(path);
}

// What a file is: the shell or wrapper it is, or null. By the name it was called by or its real
// name, as the same file as one of the system's (a link, or a hard link), or as a copy of one.
function identity(kind, calledName, real, stats, context) {
  const named = kind === "shell" ? isShellName : isWrapperName;
  if (named(calledName, context.config)) return calledName;
  const realName = basename(real);
  if (named(realName, context.config)) return realName;
  const known = knownFiles(context, kind);
  for (const [file, fileStats] of known) if (file === real || (fileStats.dev === stats.dev && fileStats.ino === stats.ino)) return basename(file);
  for (const [file, fileStats] of known) {
    try {
      if (fileStats.size === stats.size && fileHash(file, context) === fileHash(real, context)) return basename(file);
    } catch { /* unreadable: not compared */ }
  }
  return null;
}

// How the kernel starts a file: through the interpreter its #! line names, with the rest of that
// line as one optional argument; as a binary (a NUL byte in its first block); or, for text with no
// usable #! line, with the fallback shell, as exec does when the kernel refuses the file (ENOEXEC).
function fileHeader(real) {
  let head;
  try {
    const descriptor = openSync(real, "r");
    try {
      const buffer = Buffer.alloc(HEADER_BYTES);
      head = buffer.subarray(0, readSync(descriptor, buffer, 0, buffer.length, 0)).toString("latin1");
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    return { kind: "unreadable", reason: error.code ?? error.message };
  }
  if (head.startsWith("#!")) {
    const line = head.slice(2).split("\n", 1)[0].replace(/^[ \t]+/u, "").replace(/[ \t\r]+$/u, "");
    const match = /^([^ \t]+)(?:[ \t]+(.+))?$/u.exec(line);
    if (match) return { kind: "script", interpreter: match[1], argument: match[2] ?? null };
  }
  return head.includes("\0") ? { kind: "binary" } : { kind: "text" };
}

// Each program the spawn of `command` can end up running, for every file its name leads to:
// { kind: "shell" | "wrapper" | "program" | "unreadable", ... } with the arguments it gets, and the
// script whose #! line (or exec's fallback) started it. `wrapped` is how many of those arguments a
// wrapper reads as its own: all of them when the command names it, only the #! line's word when a
// #! line names it (the script and its arguments go to the program that line starts). Returns null
// when the name leads to no file.
function startedPrograms(command, context, { asPath = false, wrapped = Infinity, chain = [] } = {}) {
  const [program, ...args] = command;
  const files = programFiles(program, context, { asPath });
  if (files.length === 0) return null;
  const started = [];
  for (const file of files) {
    let real, stats;
    try {
      real = realpathSync(file);
      stats = statSync(real);
    } catch (error) {
      started.push({ kind: "unreadable", program, file, reason: error.code ?? error.message });
      continue;
    }
    const shell = identity("shell", basename(program), real, stats, context);
    if (shell) {
      started.push({ kind: "shell", shell, program, file, real, args });
      continue;
    }
    if (chain.includes(real)) {
      started.push({ kind: "unreadable", program, file, reason: "its #! lines start it again" });
      continue;
    }
    const header = fileHeader(real);
    if (header.kind === "unreadable") {
      started.push({ kind: "unreadable", program, file, reason: header.reason });
      continue;
    }
    if (header.kind === "script" || header.kind === "text") {
      const [interpreter, ...extra] = header.kind === "script" ? [header.interpreter, ...(header.argument === null ? [] : [header.argument])] : [context.config.run.fallbackShell];
      const inner = startedPrograms([interpreter, ...extra, file, ...args], context, { asPath: true, wrapped: extra.length, chain: [...chain, real] });
      if (!inner) {
        started.push({ kind: "unreadable", program, file, reason: `its interpreter ${interpreter} is not an executable file` });
        continue;
      }
      const line = header.kind === "script" ? `#!${[interpreter, ...extra].join(" ")}` : null;
      for (const entry of inner) started.push({ ...entry, script: entry.script ?? { program, file, line } });
      continue;
    }
    const wrapper = identity("wrapper", basename(program), real, stats, context);
    if (wrapper) {
      started.push({ kind: "wrapper", wrapper, program, file, real, args: args.slice(0, wrapped) });
      continue;
    }
    started.push({ kind: "program", program, file, real });
  }
  return started;
}

// The words a wrapper's argument can hand on as a program or a folder: split at white space, =
// and :, with quotes and backslashes removed (env -S splits its string so, and \_ is a space
// there), plus the rest of a single-letter option cluster, as in -Sbash.
function wrapperWords(argument) {
  const words = new Set();
  for (const piece of String(argument).replace(/\\_/gu, " ").split(/[\s=:]+/u)) {
    const word = piece.replace(/["'\\]/gu, "");
    if (!word) continue;
    words.add(word);
    if (/^-[^-]/u.test(word)) for (let index = 2; index < word.length; index += 1) words.add(word.slice(index));
  }
  return [...words];
}

function isFolder(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

// The shell a wrapper's own arguments hand it, or null. run does not parse each wrapper's options:
// any word that names a shell, or leads to one (on the child's PATH, from the working directory or
// from any folder those arguments name, as env --chdir and env PATH=... would), counts.
function wrapperShell(entry, context, scanned) {
  const words = entry.args.flatMap((argument) => {
    if (argument.includes("${")) refuse(`run refuses ${entry.program} ${argument}: the wrapper ${entry.wrapper} would expand that variable, which run cannot see. ${shellUsage(context.config)}.`);
    return wrapperWords(argument);
  });
  const folders = [...new Set(words.filter((word) => isAbsolute(word) && isFolder(word)))];
  const places = [context, ...folders.map((folder) => ({ ...context, cwd: folder, env: { ...context.env, PATH: folder } }))];
  for (const word of words) {
    if (isShellName(basename(word), context.config)) return { word, shell: basename(word) };
    for (const place of places) {
      for (const started of startedPrograms([word], place) ?? []) {
        const key = started.real ?? started.file;
        if (scanned.has(key)) continue;
        scanned.add(key);
        if (started.kind === "shell") return { word, shell: started.shell };
        if (started.kind === "wrapper") {
          const inner = wrapperShell(started, place, scanned);
          if (inner) return { word, shell: inner.shell };
        }
      }
    }
  }
  return null;
}

// The check by what the program really is, with the environment and working directory the child
// gets (run passes them). Returns what it found, for the messages and the tests.
export function assertResolvedCommand(command, { env = {}, cwd = process.cwd(), platform = process.platform, config = testEnvConfig() } = {}) {
  const [program] = command;
  if (typeof program !== "string" || program === "") refuse("Name the program to run.");
  const context = { env, cwd, platform, config, hashes: new Map() };
  const started = startedPrograms(command, context);
  if (!started) refuse(`run cannot find ${program}${/\//u.test(program) ? " as an executable file" : ` on the child's PATH (${environmentValue(env, "PATH", platform) ?? ""})`}, so it cannot check what it starts.`);
  const called = basename(program);
  for (const entry of started) {
    if (entry.kind === "unreadable") refuse(`run cannot tell what ${program} starts: ${entry.file} (${entry.reason}).`);
    if (entry.kind === "shell" && entry.script) {
      const how = entry.script.line ? `its #! line (${entry.script.line}) starts ${entry.shell}` : `it has no #! line, so exec runs it with ${config.run.fallbackShell} (${entry.shell})`;
      refuse(`run refuses ${program}: ${how}, a shell, which run starts only in the documented form. Start the script as bash ${config.run.shellOptions.join(" ")} ${program}.`);
    }
    if (entry.kind === "shell") assertShellForm(entry.shell === called ? called : `${called} (${entry.shell}, ${entry.real})`, entry.args, config);
    if (entry.kind === "wrapper") {
      const found = wrapperShell(entry, context, new Set());
      if (found) {
        const via = entry.script ? `its #! line (${entry.script.line}) runs ${entry.wrapper}, which` : entry.wrapper === called ? called : `${called} (${entry.wrapper})`;
        refuse(`run refuses ${program}: ${via} would start ${found.word}${found.shell === basename(found.word) ? "" : ` (${found.shell})`}, a shell, through a wrapper. Start the shell itself in the documented form. ${shellUsage(config)}.`);
      }
    }
  }
  return started;
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
      refuse(`${database} already exists. Drop it with scripts/test-env drop ${database}, then create it again.`);
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
    `Run:      scripts/test-env run ${database} -- <program> [arguments]`,
    `Drop it:  scripts/test-env drop ${database}`
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
  for (const folder of Object.values(boundaryPaths(database, io.root))) io.removeFolder(folder);
  io.stdout(`Dropped ${database}: absent from pg_database on ${ci.host}:${ci.port}. Removed its env file, npm config files, scratch HOME and toolchain folder.`);
  return 0;
}

async function run(io, [name, ...rest]) {
  const database = resolveDatabaseName(name);
  const command = rest[0] === "--" ? rest.slice(1) : rest;
  if (command.length === 0) refuse(`Name the command to run, for example: scripts/test-env run ${database} -- npm test`);
  assertPlainCommand(command);
  // HOME and PATH come only from the boundary the entry point prepared and launchBoundary checked.
  const { boundary } = io;
  if (!boundary || boundary.database !== database) refuse(`run starts a command only through scripts/test-env, which prepares the scratch HOME and the toolchain PATH for ${database}.`);
  const paths = projectPaths(io.root);
  const ci = await readCiConfiguration(io.readText(paths.workflow));
  const files = testEnvFiles(database, io.root);
  const path = files.envFile;
  if (!io.fileExists(path)) refuse(`${database} has no env file. Create it with scripts/test-env create ${database}`);
  const fileText = io.readText(path);
  const fileValues = parseDotenv(fileText);
  const pins = childPins(files, ci);
  // A file written before the pins existed lacks them; any loader input it does carry must match.
  for (const [name, value] of Object.entries(fileValues)) {
    if (isLoaderInput(name) && pins.get(name) !== value) refuse(`The env file sets ${name}, which would change what the child's loaders read. Drop and create ${database} again.`);
    if (BOUNDARY_NAMES.includes(name)) refuse(`The env file sets ${name}, which the entry point sets. Drop and create ${database} again.`);
  }
  // The child starts EMPTY: the allowlisted names the caller has set (scripts/test-env.config.json),
  // the env file, the pins, then the boundary's HOME and PATH. Nothing else the caller exports
  // reaches it, whatever its name; its HOME and PATH are never the caller's.
  const childEnvironment = { ...allowlistedEnvironment(io.env, io.platform), ...fileValues, ...Object.fromEntries(pins), HOME: boundary.home, PATH: boundary.path };
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
  // Last, with the child's own PATH and working directory: what the program really is (DB-06).
  assertResolvedCommand(command, { env: childEnvironment, cwd: io.cwd, platform: io.platform });
  return io.spawn(command[0], command.slice(1), { cwd: io.cwd, env: childEnvironment });
}

const USAGE = [
  "Usage (through the entry point; docs/LOCAL_TESTING.md):",
  "  scripts/test-env create <name>                    create jitm_design_<name> and its env file",
  "  scripts/test-env run <name> -- <program> [args]   run one program with only that env file",
  "  scripts/test-env drop <name>                      drop jitm_design_<name> and its files"
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
    removeFolder: (path) => rmSync(path, { recursive: true, force: true }),
    // Set by the script entry below from launchBoundary; `run` refuses without it.
    boundary: null,
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

// Step one of the entry point: print the launch plan, or refuse.
function planMain(argv) {
  try {
    const plan = launchPlan({ argv, env: process.env, execPath: process.execPath, execArgv: process.execArgv });
    if (!plan) {
      console.error(USAGE);
      return 2;
    }
    process.stdout.write(`${renderLaunchPlan(plan)}\n`);
    return 0;
  } catch (error) {
    console.error(`test-env refused: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  if (argv[0] === PLAN_COMMAND) {
    process.exitCode = planMain(argv.slice(1));
  } else {
    let boundary = null, refused = false;
    try {
      boundary = launchBoundary({ argv, env: process.env, execPath: process.execPath, execArgv: process.execArgv });
    } catch (error) {
      console.error(`test-env refused: ${error.message}`);
      refused = true;
    }
    if (refused) {
      process.exitCode = 1;
    } else {
      // create clears the inherited names in the env file and run strips them from the child; this
      // process itself drops them before any driver object exists.
      const inherited = { ...process.env };
      for (const key of Object.keys(process.env)) if (isDatabaseInput(key) || isLoaderInput(key)) delete process.env[key];
      process.exitCode = await main(argv, { env: inherited, boundary });
    }
  }
}
