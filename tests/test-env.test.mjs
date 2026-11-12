import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// R2 helpers are read through the namespace, so the R2 cases also load (and fail) against the R1 helper.
import * as helper from "../scripts/test-env.mjs";
import {
  assertChildDotenvLoad,
  assertDatabaseName,
  assertIsolatedEnvironment,
  buildEnvironment,
  databaseUrl,
  dotenvLoaderInputs,
  driverParameters,
  envFilePath,
  inspectDatabaseUrl,
  loaderPins,
  main,
  MAINTENANCE_DATABASE,
  pgVariableNames,
  projectPaths,
  readCiConfiguration,
  renderEnvFile,
  resolveDatabaseName
} from "../scripts/test-env.mjs";

// Synthetic fixture values: none of them is the CI role, password or port.
const role = "fixture_role", secret = "fixture-secret", port = 6543;
const fixtureUrl = (query = "?schema=public", host = "localhost", database = "jitm_design_fixture") => `postgresql://${role}:${secret}@${host}:${port}/${database}${query}`;
const ciFixture = ({
  url = fixtureUrl(),
  serviceUser = role,
  servicePassword = secret,
  serviceDatabase = "jitm_design_fixture",
  ports = [`${port}:5432`],
  secondService = false,
  testSteps = ["npm test 2>&1 | tee test.log"],
  extraJobEnv = {},
  stepEnv = { RECOVERY_TEST_DATABASE_URL: fixtureUrl(), RUN_FIXTURE_TESTS: "true" }
} = {}) => {
  const env = { DATABASE_URL: url, APP_URL: "http://127.0.0.1:3000", ...extraJobEnv };
  const lines = [
    "name: CI",
    "env:",
    "  DATABASE_URL: postgresql://top:level@outside.example.test:5432/elsewhere",
    "jobs:",
    "  validate:",
    "    runs-on: ubuntu-latest",
    "    env:",
    ...Object.entries(env).map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`),
    "    services:",
    "      postgres:",
    "        image: postgres:16-alpine",
    "        env:",
    `          POSTGRES_DB: ${serviceDatabase}`,
    `          POSTGRES_USER: ${serviceUser}`,
    `          POSTGRES_PASSWORD: ${servicePassword}`,
    "        ports:",
    ...ports.map(mapping => `          - ${mapping}`),
    ...(secondService ? ["      replica:", "        image: postgres:16", "        ports:", "          - 5433:5432"] : []),
    "    steps:",
    "      - run: npm run test:e2e -- --config playwright.ci.config.ts",
    ...testSteps.flatMap(command => [
      "      - name: Unit and integration tests",
      "        env:",
      ...Object.entries(stepEnv).map(([key, value]) => `          ${key}: ${JSON.stringify(value)}`),
      `        run: ${command}`
    ])
  ];
  return `${lines.join("\n")}\n`;
};
const exampleFixture = (extra = "") => `# fixture\nAPP_URL=http://localhost:3000\nEMAIL_FROM='Jump in the Mix <hello@localhost>'\nDATABASE_URL=postgresql://jitm:GENERATE_ME@localhost:5432/jitm?schema=public\nRESTORE_DATABASE_URL=\nDEMO_MODE=true\n${extra}`;
const expected = (database = "jitm_design_fixture") => ({ host: "127.0.0.1", port, user: role, database });
const goodUrl = (database = "jitm_design_fixture", query = "?schema=public") => fixtureUrl(query, "127.0.0.1", database);

const root = "/fixture-repo";
const paths = projectPaths(root);

// R3: the boundary the entry point hands the helper (launchBoundary's result). The harness root is
// not on disk, so this one is only data; prepareBoundary below builds a real one.
function harnessBoundary(database = "jitm_design_fixture") {
  const folders = helper.boundaryPaths?.(database, root) ?? { home: join(root, ".artifacts", "test-env", `${database}.home`), bin: join(root, ".artifacts", "test-env", `${database}.bin`) };
  return { database, ...folders, path: [folders.bin, "/usr/bin", "/bin"].join(":") };
}

// The system's standard utility path, as the entry point reads it.
const standardPath = process.platform === "win32" ? "" : spawnSync("/bin/sh", ["-c", "command -p getconf PATH"], { encoding: "utf8", env: {} }).stdout.trim();

// A real boundary for a fixture root, made by the helper's own launch plan: the toolchain link
// points at the node running these tests, so it works where node is not on the standard path.
// Against a helper without the entry point (R2), there is none.
function prepareBoundary(fixtureRoot, name = "fixture") {
  if (!helper.launchPlan) return null;
  const link = join(fixtureRoot, helper.testEnvConfig().boundary.node);
  mkdirSync(dirname(link), { recursive: true, mode: 0o700 });
  rmSync(link, { force: true });
  symlinkSync(process.execPath, link);
  return helper.launchPlan({ argv: ["run", name], env: { PATH: standardPath }, execPath: process.execPath, root: fixtureRoot });
}

function harness({ ci = ciFixture(), example = exampleFixture(), env = {}, files = {}, exists = false, spawnCode = 0, boundary = harnessBoundary() } = {}) {
  const reads = [];
  const queries = [];
  const client = {
    query: vi.fn(async (text, values) => { queries.push(text); return { rows: text.startsWith("SELECT") && (exists || queries.some(q => q.startsWith("CREATE"))) && !queries.some(q => q.startsWith("DROP")) ? [{ "?column?": 1 }] : [] }; }),
    end: vi.fn(async () => {})
  };
  const dependencies = {
    root,
    env,
    readText: vi.fn(path => {
      reads.push(path);
      if (path === paths.workflow) return ci;
      if (path === paths.example) return example;
      if (path in files) return files[path];
      throw new Error(`unexpected read ${path}`);
    }),
    fileExists: vi.fn(path => path in files),
    writeEnvFile: vi.fn(),
    removeFile: vi.fn(),
    removeFolder: vi.fn(),
    boundary,
    connect: vi.fn(async () => client),
    spawn: vi.fn(async () => spawnCode),
    stdout: vi.fn(),
    stderr: vi.fn()
  };
  return { dependencies, client, reads, queries, errors: () => dependencies.stderr.mock.calls.map(call => call[0]).join("\n") };
}

async function envFileFor(database = "jitm_design_fixture", overrides = {}) {
  const ci = await readCiConfiguration(ciFixture());
  // Written for the harness root, as create writes it, so the dotenv file pin names this file.
  const environment = buildEnvironment({ exampleText: exampleFixture(), ci, database, envFile: envFilePath(database, root), root });
  const values = new Map([...environment.values, ...Object.entries(overrides)]);
  for (const [key, value] of Object.entries(overrides)) if (value === undefined) values.delete(key);
  return [...values].map(([key, value]) => `${key}="${value}"`).join("\n");
}

describe("the jitm_design_ name rule", () => {
  it.each(["jitm_design_a", "jitm_design_qa_1", `jitm_design_${"a".repeat(40)}`, "jitm_design_m5s2land_check"])("accepts %s", name => {
    expect(assertDatabaseName(name)).toBe(name);
  });

  it.each(["jitm", "postgres", "template1", "jitm_design_", 'jitm_design_a"b', "jitm_design_a'b", "jitm_design_a/b", "jitm_design_../x", `jitm_design_${"a".repeat(41)}`, "jitm_design_Upper", "jitm_design_a;drop", "jitm_design_a b", "jitm_design_a$b", "jitm_design_a`b`", "xjitm_design_a", "jitm_designer"])("refuses %j", name => {
    expect(() => assertDatabaseName(name)).toThrow(/must match/u);
  });

  it("takes a suffix or the full name", () => {
    expect(resolveDatabaseName("qa1")).toBe("jitm_design_qa1");
    expect(resolveDatabaseName("jitm_design_qa1")).toBe("jitm_design_qa1");
    expect(() => resolveDatabaseName("")).toThrow();
    expect(() => resolveDatabaseName("a/b")).toThrow(/must match/u);
  });

  it("keeps env files inside the ignored artifact folder", () => {
    expect(envFilePath("jitm_design_qa1", root)).toBe(join(root, ".artifacts", "test-env", "jitm_design_qa1.env"));
    expect(() => envFilePath("../escape", root)).toThrow(/must match/u);
  });
});

describe("the CI validate job as the source of the connection settings", () => {
  it("reads the real workflow's role, password and port from its validate job and PostgreSQL service", async () => {
    const text = readFileSync(projectPaths().workflow, "utf8");
    const ci = await readCiConfiguration(text);
    // Cross-check against the service block, parsed independently, instead of literals.
    const yaml = (await import("js-yaml")).default;
    const job = (yaml.DEFAULT_FULL_SCHEMA ? yaml.safeLoad : yaml.load)(text).jobs.validate;
    const service = Object.values(job.services).find(entry => String(entry.image).startsWith("postgres"));
    expect(ci.user).toBe(service.env.POSTGRES_USER);
    expect(ci.password).toBe(service.env.POSTGRES_PASSWORD);
    expect(String(ci.port)).toBe(String(service.ports[0]).split(":")[0]);
    expect(["127.0.0.1", "::1"]).toContain(ci.host);
    expect(Object.keys(ci.stepEnvironment)).toContain("RECOVERY_TEST_DATABASE_URL");
    expect(ci.jobEnvironment.DATABASE_URL).toBe(job.env.DATABASE_URL);
  });

  it("ignores the workflow-level env block", async () => {
    const ci = await readCiConfiguration(ciFixture());
    expect(ci).toMatchObject({ host: "127.0.0.1", port, user: role, password: secret, schema: "public" });
  });

  it.each([
    ["no validate job", "name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n", /no "validate" job/u],
    ["a missing DATABASE_URL", ciFixture({ url: "" }), /no DATABASE_URL/u],
    ["an expression for DATABASE_URL", ciFixture({ url: "${{ secrets.DATABASE_URL }}" }), /workflow expression/u],
    ["a non-loopback host", ciFixture({ url: fixtureUrl("?schema=public", "db.example.test") }), /not loopback/u],
    ["a query host override", ciFixture({ url: fixtureUrl("?host=outside.example.test") }), /"host" query parameter/u],
    ["a hostaddr override", ciFixture({ url: fixtureUrl("?hostaddr=10.0.0.1") }), /"hostaddr" query parameter/u],
    ["a service override", ciFixture({ url: fixtureUrl("?service=prod") }), /"service" query parameter/u],
    ["a port the service does not publish", ciFixture({ ports: ["7654:5432"] }), /port does not match/u],
    ["two port mappings", ciFixture({ ports: [`${port}:5432`, "7654:5432"] }), /exactly one host:container mapping/u],
    ["a role the service does not create", ciFixture({ serviceUser: "someone_else" }), /POSTGRES_USER/u],
    ["a password the service does not set", ciFixture({ servicePassword: "other" }), /POSTGRES_PASSWORD/u],
    ["a database the service does not create", ciFixture({ serviceDatabase: "jitm_design_other" }), /POSTGRES_DB/u],
    ["two PostgreSQL services", ciFixture({ secondService: true }), /exactly one PostgreSQL service/u],
    ["no npm test step", ciFixture({ testSteps: [] }), /exactly one step that runs "npm test"; found 0/u],
    ["two npm test steps", ciFixture({ testSteps: ["npm test", "npm run test"] }), /found 2/u]
  ])("refuses %s", async (_label, text, message) => {
    await expect(readCiConfiguration(text)).rejects.toThrow(message);
  });

  it("leaves out other workflow expressions and reports them", async () => {
    const ci = await readCiConfiguration(ciFixture({ extraJobEnv: { TOKEN: "${{ secrets.TOKEN }}" } }));
    expect(ci.jobEnvironment).not.toHaveProperty("TOKEN");
    expect(ci.skipped).toEqual(["TOKEN"]);
  });
});

describe("the final driver configuration", () => {
  it("accepts the loopback test database", () => {
    expect(inspectDatabaseUrl(goodUrl(), expected())).toMatchObject({ host: "127.0.0.1", port, user: role, database: "jitm_design_fixture" });
    expect(inspectDatabaseUrl(`postgresql://${role}:${secret}@[::1]:${port}/jitm_design_fixture`, expected())).toMatchObject({ host: "::1" });
  });

  it.each([
    ["a missing URL", undefined, /missing/u],
    ["an empty URL", "", /missing/u],
    ["a non-loopback host", fixtureUrl("", "outside.example.test"), /not a loopback address/u],
    ["the name localhost, which DNS resolves", fixtureUrl("", "localhost"), /not a loopback address/u],
    ["a query host override", goodUrl("jitm_design_fixture", "?host=outside.example.test"), /"host" query parameter/u],
    ["a hostaddr override", goodUrl("jitm_design_fixture", "?hostaddr=10.0.0.1"), /"hostaddr" query parameter/u],
    ["a service override", goodUrl("jitm_design_fixture", "?service=production"), /"service" query parameter/u],
    ["a port override", goodUrl("jitm_design_fixture", "?port=5999"), /"port" query parameter/u],
    ["a unix socket", `postgresql://${role}:${secret}@%2Ftmp:${port}/jitm_design_fixture`, /loopback/u],
    ["another port", `postgresql://${role}:${secret}@127.0.0.1:5999/jitm_design_fixture`, /port 5999/u],
    ["another role", `postgresql://intruder:${secret}@127.0.0.1:${port}/jitm_design_fixture`, /role/u],
    ["no password", `postgresql://${role}@127.0.0.1:${port}/jitm_design_fixture`, /password/u],
    ["the default database", goodUrl("jitm"), /outside/u],
    ["the maintenance database", goodUrl("postgres"), /outside/u],
    ["another test database", goodUrl("jitm_design_other"), /not jitm_design_fixture/u],
    ["a non-PostgreSQL URL", `mysql://${role}:${secret}@127.0.0.1:${port}/jitm_design_fixture`, /not a PostgreSQL URL/u]
  ])("refuses %s", (_label, value, message) => {
    expect(() => inspectDatabaseUrl(value, expected())).toThrow(message);
  });

  it("evaluates the driver against the given environment without changing this process", () => {
    const before = process.env;
    const parameters = driverParameters({ connectionString: `postgresql://${role}@127.0.0.1:${port}/jitm_design_fixture` }, { PGPASSWORD: "from-env" });
    expect(parameters.password).toBe("from-env");
    expect(process.env).toBe(before);
  });

  it.each([
    ["RECOVERY_TEST_DATABASE_URL", { RECOVERY_TEST_DATABASE_URL: goodUrl() }],
    ["NETLIFY_DB_URL", { NETLIFY_DB_URL: fixtureUrl("", "outside.example.test") }],
    ["RESTORE_DATABASE_URL", { RESTORE_DATABASE_URL: goodUrl("jitm_design_other") }],
    ["an unknown database URL input", { ANALYTICS_DATABASE_URL: fixtureUrl("", "outside.example.test") }],
    ["PGHOST elsewhere", { PGHOST: "outside.example.test" }],
    ["PGHOSTADDR", { PGHOSTADDR: "10.0.0.1" }],
    ["PGSERVICE", { PGSERVICE: "production" }],
    ["PGPASSFILE", { PGPASSFILE: "/home/someone/.pgpass" }],
    ["PGDATABASE elsewhere", { PGDATABASE: "jitm" }],
    ["PGOPTIONS", { PGOPTIONS: "-c search_path=other" }]
  ])("refuses an environment with %s set", (_label, extra) => {
    // PGOPTIONS reaches the driver itself, so the driver-level check refuses it first.
    expect(() => assertIsolatedEnvironment({ DATABASE_URL: goodUrl(), ...extra }, expected())).toThrow(/must be empty|connection options/u);
  });

  it("accepts PG variables that name the test database itself", () => {
    const env = { DATABASE_URL: goodUrl(), PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: role, PGPASSWORD: secret, PGDATABASE: "jitm_design_fixture", PGSERVICE: "", RECOVERY_TEST_DATABASE_URL: "" };
    expect(assertIsolatedEnvironment(env, expected()).database).toBe("jitm_design_fixture");
  });

  it("enumerates the driver's PG variables at run time, plus the libpq overrides", () => {
    const names = pgVariableNames({ PGTZ: "UTC" });
    for (const name of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGOPTIONS", "PGCONNECT_TIMEOUT", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGSSLMODE", "PGAPPNAME", "PGTZ"]) {
      expect(names).toContain(name);
    }
  });
});

describe("the env file", () => {
  it("layers .env.example, the CI job env and the CI test-step env under the isolation block", async () => {
    const ci = await readCiConfiguration(ciFixture());
    const environment = buildEnvironment({ exampleText: exampleFixture(), ci, database: "jitm_design_fixture", inherited: { PGTZ: "UTC", OTHER_DB_URL: "x" } });
    const values = Object.fromEntries(environment.values);
    expect(values.APP_URL).toBe("http://127.0.0.1:3000");
    expect(values.EMAIL_FROM).toBe("Jump in the Mix <hello@localhost>");
    expect(values.RUN_FIXTURE_TESTS).toBe("true");
    expect(values.DATABASE_URL).toBe(databaseUrl({ host: "127.0.0.1", port, user: role, password: secret, database: "jitm_design_fixture", schema: "public" }));
    expect(values).toMatchObject({ RECOVERY_TEST_DATABASE_URL: "", NETLIFY_DB_URL: "", RESTORE_DATABASE_URL: "", OTHER_DB_URL: "", PGTZ: "", PGSERVICE: "", PGHOSTADDR: "", PGHOST: "127.0.0.1", PGDATABASE: "jitm_design_fixture" });
    expect(assertIsolatedEnvironment(values, expected()).database).toBe("jitm_design_fixture");
  });

  it.each([['a double quote', 'say "hi"'], ["a dollar", "cost $HOME"], ["a backtick", "run `id`"], ["a backslash", "a\\nb"]])("refuses a value with %s", (_label, value) => {
    expect(() => renderEnvFile({ base: new Map([["EMAIL_FROM", value]]), isolation: new Map(), database: "jitm_design_fixture" })).toThrow(/cannot carry literally/u);
  });

  const bash = process.platform === "win32" ? null : spawnSync("bash", ["-c", "true"]).status === 0 ? "bash" : null;
  const directory = mkdtempSync(join(tmpdir(), "jitm-test-env-"));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  const sourced = (file, keys) => {
    const script = 'set -a; . "$1"; set +a; exec "$2" -e "process.stdout.write(JSON.stringify(Object.fromEntries(process.argv.slice(1).map(k => [k, process.env[k] ?? null]))))" -- "${@:3}"';
    const result = spawnSync(bash, ["-c", script, "bash", file, process.execPath, ...keys], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
  };

  it.skipIf(!bash)("round-trips through a shell exactly as dotenv reads it", async () => {
    const ci = await readCiConfiguration(ciFixture());
    const environment = buildEnvironment({ exampleText: exampleFixture("NOTICE=\"Kept 30 days; it's #1 & <ok>!\"\n"), ci, database: "jitm_design_fixture" });
    const file = join(directory, "jitm_design_fixture.env");
    const text = renderEnvFile({ ...environment, database: "jitm_design_fixture" });
    writeFileSync(file, text, { mode: 0o600 });
    const values = Object.fromEntries(environment.values);
    expect(sourced(file, Object.keys(values))).toEqual(values);
    expect(parseDotenv(text)).toEqual(values);
  });

  it.skipIf(!bash)("lets a shell source .env.example with every value as dotenv reads it", () => {
    const file = projectPaths().example;
    const values = parseDotenv(readFileSync(file, "utf8"));
    expect(values).not.toHaveProperty("NODE_ENV");
    expect(sourced(file, Object.keys(values))).toEqual(values);
  });

  it.skipIf(!bash)("keeps spaces, quotes, dollars and backticks literal in single-quoted values like EMAIL_FROM", () => {
    const file = join(directory, "quoted.env");
    const value = 'Jump "in" the $HOME `id` <hello@localhost>';
    writeFileSync(file, `EMAIL_FROM='${value}'\n`);
    expect(sourced(file, ["EMAIL_FROM"])).toEqual({ EMAIL_FROM: value });
    expect(parseDotenv(readFileSync(file, "utf8")).EMAIL_FROM).toBe(value);
    expect(readFileSync(projectPaths().example, "utf8")).toMatch(/^EMAIL_FROM='[^']*'$/mu);
  });
});

describe("create", () => {
  it("creates only the validated database through the maintenance connection and writes its env file", async () => {
    const poisoned = "postgresql://prod:prod@db.example.test:5432/jitm";
    const run = harness({ env: { DATABASE_URL: poisoned, NETLIFY_DB_URL: poisoned, RECOVERY_TEST_DATABASE_URL: poisoned, PGHOST: "db.example.test", PGSERVICE: "production" } });
    expect(await main(["create", "qa1"], run.dependencies)).toBe(0);
    expect(run.dependencies.connect).toHaveBeenCalledTimes(1);
    const config = run.dependencies.connect.mock.calls[0][0];
    expect(config).toEqual({ host: "127.0.0.1", port, user: role, password: secret, database: MAINTENANCE_DATABASE });
    expect(run.queries).toEqual(["SELECT 1 FROM pg_database WHERE datname = $1", 'CREATE DATABASE "jitm_design_qa1" TEMPLATE template0']);
    expect(run.client.end).toHaveBeenCalledTimes(1);
    const [path, text] = run.dependencies.writeEnvFile.mock.calls[0];
    expect(path).toBe(envFilePath("jitm_design_qa1", root));
    const values = parseDotenv(text);
    expect(values.DATABASE_URL).toBe(goodUrl("jitm_design_qa1"));
    expect(values).toMatchObject({ NETLIFY_DB_URL: "", RECOVERY_TEST_DATABASE_URL: "", PGSERVICE: "", PGHOST: "127.0.0.1" });
    expect(text).not.toContain("db.example.test");
    // E-155: only .env.example and ci.yml are read; never .env, ~/.pgpass or another credential store.
    expect(run.reads.sort()).toEqual([paths.example, paths.workflow].sort());
  });

  const refusals = [
    ["a name outside the pattern", { argv: ["create", 'a"b'] }, /must match/u],
    ["a slash in the name", { argv: ["create", "a/b"] }, /must match/u],
    ["a name that is too long", { argv: ["create", "a".repeat(41)] }, /must match/u],
    ["a missing name", { argv: ["create"] }, /Name the test database/u],
    ["extra arguments", { argv: ["create", "qa1", "extra"] }, /Unexpected arguments/u],
    ["a missing CI URL", { ci: ciFixture({ url: "" }) }, /no DATABASE_URL/u],
    ["a query host override in CI", { ci: ciFixture({ url: fixtureUrl("?host=outside.example.test") }) }, /"host" query parameter/u],
    ["a hostaddr override in CI", { ci: ciFixture({ url: fixtureUrl("?hostaddr=10.0.0.1") }) }, /"hostaddr"/u],
    ["a service override in CI", { ci: ciFixture({ url: fixtureUrl("?service=prod") }) }, /"service"/u],
    ["a non-loopback CI host", { ci: ciFixture({ url: fixtureUrl("?schema=public", "db.example.test") }) }, /not loopback/u],
    ["a quote in a value", { example: exampleFixture('PUBLIC_OPERATOR_NAME=\'Jo "JJ" Doe\'\n') }, /cannot carry literally/u],
    ["a dollar in a value", { example: exampleFixture("PUBLIC_OPERATOR_NAME='$HOME'\n") }, /cannot carry literally/u],
    ["a backtick in a value", { example: exampleFixture("PUBLIC_OPERATOR_NAME='`id`'\n") }, /cannot carry literally/u]
  ];
  it.each(refusals)("refuses %s with no connection and no file", async (_label, { argv = ["create", "qa1"], ci, example }, message) => {
    const run = harness({ ci, example });
    expect(await main(argv, run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(message);
    expect(run.dependencies.connect).not.toHaveBeenCalled();
    expect(run.dependencies.writeEnvFile).not.toHaveBeenCalled();
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
  });

  it("clears a recovery URL that .env.example might carry", async () => {
    const run = harness({ example: exampleFixture(`RECOVERY_TEST_DATABASE_URL=${fixtureUrl()}\n`) });
    expect(await main(["create", "qa1"], run.dependencies)).toBe(0);
    expect(parseDotenv(run.dependencies.writeEnvFile.mock.calls[0][1]).RECOVERY_TEST_DATABASE_URL).toBe("");
  });

  it("refuses to reuse an existing database", async () => {
    const run = harness({ exists: true });
    expect(await main(["create", "qa1"], run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(/already exists/u);
    expect(run.queries.some(query => query.startsWith("CREATE"))).toBe(false);
    expect(run.dependencies.writeEnvFile).not.toHaveBeenCalled();
    expect(run.client.end).toHaveBeenCalledTimes(1);
  });

  it("drops the new database again when the env file cannot be written", async () => {
    const run = harness();
    run.dependencies.writeEnvFile.mockImplementation(() => { throw new Error("disk full"); });
    expect(await main(["create", "qa1"], run.dependencies)).toBe(1);
    expect(run.queries.at(-1)).toBe('DROP DATABASE IF EXISTS "jitm_design_qa1" WITH (FORCE)');
  });
});

describe("drop", () => {
  it("drops only the validated database, confirms it is absent and removes the env file", async () => {
    const run = harness({ env: { DATABASE_URL: "postgresql://prod:prod@db.example.test:5432/jitm" } });
    expect(await main(["drop", "jitm_design_qa1"], run.dependencies)).toBe(0);
    expect(run.dependencies.connect.mock.calls[0][0]).toMatchObject({ host: "127.0.0.1", database: MAINTENANCE_DATABASE });
    expect(run.queries).toEqual(['DROP DATABASE IF EXISTS "jitm_design_qa1" WITH (FORCE)', "SELECT 1 FROM pg_database WHERE datname = $1"]);
    expect(run.dependencies.removeFile).toHaveBeenCalledWith(envFilePath("jitm_design_qa1", root));
    expect(run.reads).toEqual([paths.workflow]);
  });

  it.each([['a"b'], ["a/b"], ["A"], ["a".repeat(41)], ["jitm_design_"]])("refuses the name %j with no connection", async name => {
    const run = harness();
    expect(await main(["drop", name], run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(/must match/u);
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it.each([["jitm"], ["postgres"]])("treats %j as a suffix, so the bare database is never named", async name => {
    const run = harness();
    expect(await main(["drop", name], run.dependencies)).toBe(0);
    expect(run.queries[0]).toBe(`DROP DATABASE IF EXISTS "jitm_design_${name}" WITH (FORCE)`);
  });

  it("refuses a non-loopback CI host with no connection", async () => {
    const run = harness({ ci: ciFixture({ url: fixtureUrl("?schema=public", "db.example.test") }) });
    expect(await main(["drop", "qa1"], run.dependencies)).toBe(1);
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });
});

describe("run", () => {
  const file = envFilePath("jitm_design_fixture", root);

  it("runs the command with the env file only, without inherited database inputs or NODE_ENV", async () => {
    const run = harness({
      env: { PATH: "/usr/bin", HOME: "/home/fixture", NODE_ENV: "development", DATABASE_URL: "postgresql://prod:prod@db.example.test:5432/jitm", RECOVERY_TEST_DATABASE_URL: goodUrl(), PGHOST: "db.example.test", PGSERVICE: "production", BACKUP_DATABASE_URL: "x" },
      files: { [file]: await envFileFor() },
      spawnCode: 7
    });
    expect(await main(["run", "fixture", "--", "npm", "test"], run.dependencies)).toBe(7);
    expect(run.dependencies.spawn).toHaveBeenCalledTimes(1);
    const [command, args, { env }] = run.dependencies.spawn.mock.calls[0];
    expect([command, args]).toEqual(["npm", ["test"]]);
    // R3: HOME and PATH are the boundary's, never the caller's.
    const boundary = harnessBoundary();
    expect(env).toMatchObject({ PATH: boundary.path, HOME: boundary.home, DATABASE_URL: goodUrl(), RECOVERY_TEST_DATABASE_URL: "", PGHOST: "127.0.0.1", PGSERVICE: "", BACKUP_DATABASE_URL: "" });
    expect(env).not.toHaveProperty("NODE_ENV");
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing env file", null, /has no env file/u],
    ["a missing DATABASE_URL", { DATABASE_URL: undefined }, /DATABASE_URL is missing/u],
    ["a poisoned DATABASE_URL", { DATABASE_URL: "postgresql://prod:prod@db.example.test:5432/jitm" }, /not a loopback address|outside/u],
    ["a query host override", { DATABASE_URL: goodUrl("jitm_design_fixture", "?host=outside.example.test") }, /"host" query parameter/u],
    ["a hostaddr override", { DATABASE_URL: goodUrl("jitm_design_fixture", "?hostaddr=10.0.0.1") }, /"hostaddr" query parameter/u],
    ["a service override", { DATABASE_URL: goodUrl("jitm_design_fixture", "?service=production") }, /"service" query parameter/u],
    ["a non-loopback host", { DATABASE_URL: fixtureUrl("", "outside.example.test") }, /not a loopback address/u],
    ["another database's URL", { DATABASE_URL: goodUrl("jitm_design_other") }, /not jitm_design_fixture/u],
    ["the recovery opt-in", { RECOVERY_TEST_DATABASE_URL: goodUrl() }, /RECOVERY_TEST_DATABASE_URL is set/u],
    ["PGSERVICE", { PGSERVICE: "production" }, /PGSERVICE is set/u],
    ["PGHOSTADDR", { PGHOSTADDR: "10.0.0.1" }, /PGHOSTADDR is set/u]
  ])("refuses %s with no child process", async (_label, overrides, message) => {
    const files = overrides ? { [file]: await envFileFor("jitm_design_fixture", overrides) } : {};
    const run = harness({ files });
    expect(await main(["run", "fixture", "--", "npm", "test"], run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(message);
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it("refuses a bad name or a missing command with no child process", async () => {
    for (const argv of [["run", "a/b", "--", "npm", "test"], ["run", "fixture"], ["run", "fixture", "--"]]) {
      const run = harness({ files: { [file]: await envFileFor() } });
      expect(await main(argv, run.dependencies)).toBe(1);
      expect(run.dependencies.spawn).not.toHaveBeenCalled();
    }
  });
});

describe("usage", () => {
  it("prints usage for an unknown command", async () => {
    const run = harness();
    expect(await main(["list"], run.dependencies)).toBe(2);
    expect(run.errors()).toMatch(/Usage/u);
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });
});

// DB-01 (JITM-TESTENV-01-QA): prisma.config.ts, vitest.config.ts and the database scripts import
// dotenv/config in the child, and Next loads .env files during a build. Nothing those loaders read
// may change the database the helper validated. The probes below load the repository's real config
// files in a real child process, with a patched socket counter, and open no database connection.
describe("DB-01: nothing the child loads can change the validated database", () => {
  const requireFromTests = createRequire(import.meta.url);
  const repository = projectPaths().root;
  const work = mkdtempSync(join(tmpdir(), "jitm-test-env-db01-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const fixtureRoot = join(work, "repo");
  const childDirectory = join(work, "cwd");
  const outside = database => `postgresql://prod:prod@outside.example.test:5432/${database}`;
  const poisonFile = join(work, "poison.env");
  const optInFile = join(work, "recovery-opt-in.env");
  const optInPreload = join(work, "recovery-opt-in.cjs");
  const ciText = ciFixture();
  const envFile = envFilePath("jitm_design_fixture", fixtureRoot);
  const guarded = { url: goodUrl(), recovery: "", connections: 0 };
  let boundary = null;

  beforeAll(async () => {
    boundary = prepareBoundary(fixtureRoot);
    writeFileSync(poisonFile, `DATABASE_URL=${outside("jitm")}\nRECOVERY_TEST_DATABASE_URL=${outside("recovery")}\n`);
    writeFileSync(optInFile, `RECOVERY_TEST_DATABASE_URL=${outside("recovery_opt_in")}\n`);
    writeFileSync(optInPreload, `process.env.RECOVERY_TEST_DATABASE_URL = ${JSON.stringify(outside("recovery_preload"))};\n`);
    mkdirSync(childDirectory);
    writeFileSync(join(childDirectory, ".env"), `DATABASE_URL=${outside("dotenv_cwd")}\nRECOVERY_TEST_DATABASE_URL=${outside("recovery_cwd")}\nDOTENV_CONFIG_OVERRIDE=true\n`);
    const ci = await readCiConfiguration(ciText);
    const environment = buildEnvironment({ exampleText: exampleFixture(), ci, database: "jitm_design_fixture", envFile, root: fixtureRoot });
    mkdirSync(dirname(envFile), { recursive: true });
    writeFileSync(envFile, renderEnvFile({ ...environment, database: "jitm_design_fixture" }), { mode: 0o600 });
  });

  // `run` against a real fixture root; connect throws and spawn only records the child environment.
  function realRun(env) {
    const reads = [];
    const dependencies = {
      root: fixtureRoot,
      env,
      readText: vi.fn(path => {
        reads.push(path);
        if (path === projectPaths(fixtureRoot).workflow) return ciText;
        if (path === envFile) return readFileSync(path, "utf8");
        throw new Error(`unexpected read ${path}`);
      }),
      fileExists: vi.fn(path => existsSync(path)),
      writeEnvFile: vi.fn(),
      removeFile: vi.fn(),
      boundary,
      connect: vi.fn(async () => { throw new Error("no connection may be opened"); }),
      spawn: vi.fn(async () => 0),
      stdout: vi.fn(),
      stderr: vi.fn()
    };
    return { dependencies, reads, errors: () => dependencies.stderr.mock.calls.map(call => call[0]).join("\n") };
  }

  async function childEnvironment(ambient) {
    const run = realRun(ambient);
    expect(await main(["run", "fixture", "--", "npm", "test"], run.dependencies)).toBe(0);
    expect(run.dependencies.connect).not.toHaveBeenCalled();
    expect(run.dependencies.spawn).toHaveBeenCalledTimes(1);
    expect(run.reads.sort()).toEqual([envFile, projectPaths(fixtureRoot).workflow].sort());
    return run.dependencies.spawn.mock.calls[0][2].env;
  }

  // Loads one of the child's own config paths in a real child process and reports the database it
  // resolves, the recovery opt-in, and how many sockets were opened.
  const probeSource = [
    'import net from "node:net";',
    'import { pathToFileURL } from "node:url";',
    "let connections = 0;",
    "const connect = net.Socket.prototype.connect;",
    "net.Socket.prototype.connect = function (...args) { connections += 1; return connect.apply(this, args); };",
    "const [kind, target, loader] = process.argv.slice(1);",
    "let url;",
    'if (kind === "prisma") {',
    "  const { loadConfigFromFile } = await import(pathToFileURL(loader).href);",
    "  const result = await loadConfigFromFile({ configFile: target, configRoot: process.cwd() });",
    "  if (result.error) throw new Error(JSON.stringify(result.error));",
    "  url = result.config.datasource?.url;",
    '} else if (kind === "next") {',
    "  const loaded = await import(pathToFileURL(loader).href);",
    "  (loaded.loadEnvConfig ?? loaded.default.loadEnvConfig)(process.cwd(), false, { info() {}, error() {} });",
    "  url = process.env.DATABASE_URL;",
    "} else {",
    "  await import(pathToFileURL(target).href);",
    "  url = process.env.DATABASE_URL;",
    "}",
    "process.stdout.write(`\\nPROBE ${JSON.stringify({ url, recovery: process.env.RECOVERY_TEST_DATABASE_URL ?? null, connections })}\\n`);"
  ].join("\n");
  const probes = {
    prisma: [join(repository, "prisma.config.ts"), requireFromTests.resolve("@prisma/config")],
    vitest: [join(repository, "vitest.config.ts"), "-"],
    next: ["-", requireFromTests.resolve("@next/env")]
  };
  function probe(kind, env) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probeSource, kind, ...probes[kind]], { cwd: childDirectory, env, encoding: "utf8", timeout: 60_000 });
    const line = result.stdout.split("\n").find(entry => entry.startsWith("PROBE "));
    if (result.status !== 0 || !line) throw new Error(`The ${kind} probe failed (${result.status}): ${result.stderr}`);
    return JSON.parse(line.slice("PROBE ".length));
  }
  const PATH = process.env.PATH ?? "";

  it("reads dotenv's loader inputs from the installed package at run time", () => {
    const { names, pathVariable } = dotenvLoaderInputs();
    // Cross-check against the installed sources, read independently of the helper.
    const source = module => readFileSync(requireFromTests.resolve(module), "utf8");
    const mentioned = new Set([source("dotenv/lib/env-options"), source("dotenv")].flatMap(text => text.match(/\bDOTENV_[A-Z_]+\b/gu) ?? []));
    for (const name of source("dotenv/lib/env-options").match(/\bDOTENV_[A-Z_]+\b/gu)) expect(names).toContain(name);
    for (const name of names) expect(mentioned.has(name)).toBe(true);
    expect(names).toEqual(expect.arrayContaining(["DOTENV_CONFIG_PATH", "DOTENV_CONFIG_OVERRIDE", "DOTENV_KEY"]));
    expect(pathVariable).toBe("DOTENV_CONFIG_PATH");
  });

  it("writes the pins into the env file: dotenv pinned to it, every other control and NODE_OPTIONS empty", async () => {
    const run = harness();
    expect(await main(["create", "qa1"], run.dependencies)).toBe(0);
    const values = parseDotenv(run.dependencies.writeEnvFile.mock.calls[0][1]);
    const { names, pathVariable } = dotenvLoaderInputs();
    for (const name of names) expect(values[name]).toBe(name === pathVariable ? envFilePath("jitm_design_qa1", root) : "");
    expect(values.NODE_OPTIONS).toBe("");
  });

  it.each(["true", "false"])("neutralises an ambient DOTENV_CONFIG_PATH to a poisoned file with DOTENV_CONFIG_OVERRIDE=%s", async override => {
    const ambient = { PATH, DOTENV_CONFIG_PATH: poisonFile, DOTENV_CONFIG_OVERRIDE: override };
    // Without the pins the poisoned file replaces a validated DATABASE_URL; dotenv reads "false" as on.
    expect(probe("prisma", { ...ambient, DATABASE_URL: goodUrl(), RECOVERY_TEST_DATABASE_URL: "" })).toEqual({ url: outside("jitm"), recovery: outside("recovery"), connections: 0 });
    const env = await childEnvironment(ambient);
    expect(env).toMatchObject({ DOTENV_CONFIG_PATH: envFile, DOTENV_CONFIG_OVERRIDE: "" });
    for (const kind of ["prisma", "vitest", "next"]) expect(probe(kind, env)).toEqual(guarded);
  }, 120_000);

  it("neutralises a poisoned .env in the child's working directory", async () => {
    // Without the helper, the .env fills the unset recovery opt-in and a missing DATABASE_URL.
    expect(probe("vitest", { PATH, DATABASE_URL: goodUrl() })).toEqual({ url: goodUrl(), recovery: outside("recovery_cwd"), connections: 0 });
    expect(probe("prisma", { PATH })).toMatchObject({ url: outside("dotenv_cwd") });
    expect(probe("next", { PATH, DATABASE_URL: goodUrl() })).toMatchObject({ recovery: outside("recovery_cwd") });
    const env = await childEnvironment({ PATH });
    for (const kind of ["prisma", "vitest", "next"]) expect(probe(kind, env)).toEqual(guarded);
  }, 120_000);

  it.each([
    ["a file dotenv loads with override on", () => ({ DOTENV_CONFIG_PATH: optInFile, DOTENV_CONFIG_OVERRIDE: "true" }), "recovery_opt_in"],
    ["a file NODE_OPTIONS preloads", () => ({ NODE_OPTIONS: `--require=${optInPreload}` }), "recovery_preload"],
    ["a file npm's node-options preloads", () => ({ NODE_OPTIONS: `--require=${optInPreload}`, npm_config_node_options: `--require=${optInPreload}` }), "recovery_preload"]
  ])("keeps the recovery opt-in off when %s turns it back on", async (_label, inputs, database) => {
    const ambient = { PATH, ...inputs() };
    expect(probe("vitest", { ...ambient, DATABASE_URL: goodUrl(), RECOVERY_TEST_DATABASE_URL: "" })).toEqual({ url: goodUrl(), recovery: outside(database), connections: 0 });
    const env = await childEnvironment(ambient);
    expect(env).not.toHaveProperty("npm_config_node_options");
    expect(env.NODE_OPTIONS).toBe("");
    expect(probe("vitest", env)).toEqual(guarded);
  }, 120_000);

  it("removes every other inherited loader input from the child", async () => {
    const file = envFilePath("jitm_design_fixture", root);
    const run = harness({
      env: { PATH: "/usr/bin", NODE_OPTIONS: "--require=/elsewhere/a.cjs", NPM_CONFIG_NODE_OPTIONS: "--import=/elsewhere/b.mjs", JITI_ALIAS: "{}", TSX_TSCONFIG_PATH: "/elsewhere/tsconfig.json", DOTENV_PRIVATE_KEY: "x", DOTENV_CONFIG_ENCODING: "latin1", DOTENV_CONFIG_DEBUG: "true", DOTENV_KEY: "dotenv://:key@elsewhere.example.test/vault/.env.vault" },
      files: { [file]: await envFileFor() }
    });
    expect(await main(["run", "fixture", "--", "npm", "test"], run.dependencies)).toBe(0);
    const { env } = run.dependencies.spawn.mock.calls[0][2];
    const pins = loaderPins(file, await readCiConfiguration(ciFixture()));
    expect(Object.keys(env).filter(name => /^(?:DOTENV_|JITI_|TSX_|NODE_OPTIONS$|npm_config_node[-_]options$)/iu.test(name)).sort()).toEqual([...pins.keys()].sort());
    for (const [name, value] of pins) expect(env[name]).toBe(value);
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it.each([
    ["an env file that points dotenv elsewhere", { DOTENV_CONFIG_PATH: "/elsewhere/poison.env" }, /sets DOTENV_CONFIG_PATH/u],
    ["an env file that turns dotenv's override on with \"false\"", { DOTENV_CONFIG_OVERRIDE: "false" }, /sets DOTENV_CONFIG_OVERRIDE/u],
    ["an env file with a dotenv vault key", { DOTENV_KEY: "dotenv://:key@elsewhere.example.test/vault/.env.vault" }, /sets DOTENV_KEY/u],
    ["an env file that preloads code", { NODE_OPTIONS: "--require=/elsewhere/poison.cjs" }, /sets NODE_OPTIONS/u],
    ["an env file with a config-loader input", { TSX_TSCONFIG_PATH: "/elsewhere/tsconfig.json" }, /sets TSX_TSCONFIG_PATH/u]
  ])("refuses %s with no connection and no child process", async (_label, overrides, message) => {
    const run = harness({ files: { [envFilePath("jitm_design_fixture", root)]: await envFileFor("jitm_design_fixture", overrides) } });
    expect(await main(["run", "fixture", "--", "npm", "test"], run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(message);
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it("refuses a command that passes dotenv options, with no connection and no child process", async () => {
    const run = harness({ files: { [envFilePath("jitm_design_fixture", root)]: await envFileFor() } });
    expect(await main(["run", "fixture", "--", "npx", "vitest", "run", `dotenv_config_path=${poisonFile}`, "dotenv_config_override=true"], run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(/passes dotenv options/u);
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it("replays the child's dotenv load and refuses any change after validation", async () => {
    const ci = await readCiConfiguration(ciFixture());
    const environment = buildEnvironment({ exampleText: exampleFixture(), ci, database: "jitm_design_fixture", envFile });
    const env = Object.fromEntries(environment.values);
    const fileText = renderEnvFile({ ...environment, database: "jitm_design_fixture" });
    const check = (changes, { text = fileText, args = [] } = {}) => assertChildDotenvLoad({ ...env, ...changes }, { envFile, fileText: text, args, expected: expected() });
    expect(check({}).database).toBe("jitm_design_fixture");
    expect(() => check({ DOTENV_CONFIG_OVERRIDE: "false" })).toThrow(/DOTENV_CONFIG_OVERRIDE is set/u);
    expect(() => check({ DOTENV_CONFIG_PATH: poisonFile })).toThrow(/would load/u);
    expect(() => check({ DOTENV_CONFIG_PATH: "" })).toThrow(/\.env in the working directory/u);
    expect(() => check({}, { text: `${fileText}EXTRA_SETTING=1\n` })).toThrow(/would change EXTRA_SETTING/u);
    expect(() => check({}, { args: ["vitest", "dotenv_config_path=/elsewhere/poison.env"] })).toThrow(/passes dotenv options/u);
  });
});

// DB-02 (JITM-TESTENV-01-R2) is the third instance of one class: the helper removed known-bad
// inherited variables (a denylist), and an inherited npm_config_userconfig named an npmrc whose
// node-options preloaded code after the helper's checks. Now the child starts from an EMPTY
// environment plus an allowlist read from scripts/test-env.config.json, npm's user and global
// config are pinned to owned empty files, and the npm the child will run is loaded with npm's own
// config loader before the spawn. Each indirection below is first shown to redirect a real npm
// script without the helper, then the same npm script runs with the environment the helper hands
// its child. Rejections open no socket, no connection and no child process.
const npmOnPath = (() => {
  for (const directory of String(process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory, "npm");
    try { if (directory && statSync(candidate).isFile()) return candidate; } catch { /* next directory */ }
  }
  return null;
})();

describe.skipIf(process.platform === "win32" || !npmOnPath)("DB-02 class (R2): the child starts empty and npm's configuration is pinned", () => {
  const requireFromTests = createRequire(import.meta.url);
  const work = mkdtempSync(join(tmpdir(), "jitm-test-env-r2-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const file = name => join(work, name);
  const fixtureRoot = file("repo");
  const project = file("project");
  const cleanHome = file("home");
  const poisonHome = file("poisoned-home");
  const poisonLog = file("poison.log");
  const outside = database => `postgresql://prod:prod@outside.example.test:5432/${database}`;
  const ciText = ciFixture();
  const envFile = envFilePath("jitm_design_fixture", fixtureRoot);
  const ownedNpmrc = () => helper.testEnvFiles?.("jitm_design_fixture", fixtureRoot).npmUserConfig ?? join(dirname(envFile), "jitm_design_fixture.npmrc");
  const PATH = process.env.PATH ?? "";
  const guarded = { host: "127.0.0.1", database: "jitm_design_fixture", recovery: "", nodeOptions: "", poisoned: null, connections: 0 };
  const command = ["npm", "run", "--silent", "inspect"];
  let boundary = null;

  // Sockets opened in this process while a refusal runs (pg and every other client use net.Socket).
  let sockets = 0;
  const originalConnect = net.Socket.prototype.connect;
  beforeAll(() => { net.Socket.prototype.connect = function (...args) { sockets += 1; return originalConnect.apply(this, args); }; });
  afterAll(() => { net.Socket.prototype.connect = originalConnect; });

  beforeAll(async () => {
    boundary = prepareBoundary(fixtureRoot);
    for (const directory of [project, cleanHome, poisonHome, file("evil-prefix/etc"), file("fake-bin")]) mkdirSync(directory, { recursive: true });
    const poisonCjs = file("poison.cjs");
    writeFileSync(poisonCjs, [
      `require("node:fs").appendFileSync(${JSON.stringify(poisonLog)}, process.pid + " require\\n");`,
      'globalThis.__jitmPoison = "require";',
      `process.env.DATABASE_URL = ${JSON.stringify(outside("npm_poison"))};`,
      `process.env.RECOVERY_TEST_DATABASE_URL = ${JSON.stringify(outside("recovery_poison"))};`
    ].join("\n"));
    writeFileSync(file("poison.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(poisonLog)}, process.pid + " import\\n");`,
      'globalThis.__jitmPoison = "import";',
      `process.env.DATABASE_URL = ${JSON.stringify(outside("npm_poison"))};`,
      `process.env.RECOVERY_TEST_DATABASE_URL = ${JSON.stringify(outside("recovery_poison"))};`
    ].join("\n"));
    const nodeOptionsNpmrc = `node-options=--require=${poisonCjs}\n`;
    writeFileSync(file("node-options.npmrc"), nodeOptionsNpmrc);
    writeFileSync(file("evil-prefix/etc/npmrc"), nodeOptionsNpmrc);
    writeFileSync(join(poisonHome, ".npmrc"), nodeOptionsNpmrc);
    writeFileSync(join(poisonHome, ".env"), `DATABASE_URL=${outside("home_env")}\nRECOVERY_TEST_DATABASE_URL=${outside("home_recovery")}\n`);
    writeFileSync(file("poison.env"), `DATABASE_URL=${outside("dotenv_path")}\nRECOVERY_TEST_DATABASE_URL=${outside("dotenv_recovery")}\n`);
    writeFileSync(file("poison-shell.sh"), [
      "#!/bin/sh",
      `echo "$$ script-shell" >> '${poisonLog}'`,
      `export DATABASE_URL='${outside("script_shell")}'`,
      `export RECOVERY_TEST_DATABASE_URL='${outside("script_shell_recovery")}'`,
      'exec /bin/sh "$@"'
    ].join("\n"));
    chmodSync(file("poison-shell.sh"), 0o755);
    writeFileSync(file("fake-bin/npm"), "#!/bin/sh\necho not npm\n");
    chmodSync(file("fake-bin/npm"), 0o755);

    // The probe loads dotenv/config as prisma.config.ts and vitest.config.ts do, then builds a pg
    // client and reports the target it resolves. Its socket connect throws: it never connects.
    const probe = file("probe.mjs");
    writeFileSync(probe, [
      'import net from "node:net";',
      "let connections = 0;",
      'net.Socket.prototype.connect = function () { connections += 1; throw new Error("the probe opens no connection"); };',
      `await import(${JSON.stringify(pathToFileURL(requireFromTests.resolve("dotenv/config")).href)});`,
      `const { default: pg } = await import(${JSON.stringify(pathToFileURL(requireFromTests.resolve("pg")).href)});`,
      "const parameters = new pg.Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}).connectionParameters;",
      "process.stdout.write(`\\nPROBE ${JSON.stringify({ host: parameters.host, database: parameters.database, recovery: process.env.RECOVERY_TEST_DATABASE_URL ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null, poisoned: globalThis.__jitmPoison ?? null, connections })}\\n`);"
    ].join("\n"));
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "jitm-r2-probe", private: true, scripts: { inspect: `node ${JSON.stringify(probe)}` } }, null, 2));

    // The fixture's env file and npm config files, written by create itself.
    const client = { query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => {}) };
    const created = await main(["create", "fixture"], {
      root: fixtureRoot,
      env: { PATH },
      readText: path => {
        if (path === projectPaths(fixtureRoot).workflow) return ciText;
        if (path === projectPaths(fixtureRoot).example) return exampleFixture();
        throw new Error(`unexpected read ${path}`);
      },
      writeEnvFile: (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, { mode: 0o600 }); },
      removeFile: path => rmSync(path, { force: true }),
      connect: vi.fn(async () => client),
      spawn: vi.fn(),
      stdout: vi.fn(),
      stderr: vi.fn()
    });
    expect(created).toBe(0);
  });

  beforeEach(() => writeFileSync(poisonLog, ""));

  // Runs the probe's npm script in `env`, as the child would, and returns what the probe resolved.
  function npmProbe(env, { cwd = project, args = command.slice(1) } = {}) {
    const result = spawnSync(npmOnPath, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
    const line = result.stdout.split("\n").find(entry => entry.startsWith("PROBE "));
    if (result.status !== 0 || !line) throw new Error(`npm ${args.join(" ")} failed (${result.status}): ${result.stderr}`);
    return JSON.parse(line.slice("PROBE ".length));
  }
  const baselineEnvironment = (poison, home = cleanHome) => ({ PATH, HOME: home, CI: "true", DATABASE_URL: goodUrl(), RECOVERY_TEST_DATABASE_URL: "", NODE_OPTIONS: "", ...poison });
  const redirected = probe => probe.host === "outside.example.test" || String(probe.recovery).includes("outside.example.test") || probe.poisoned !== null;

  function dependencies(ambient, cwd, given = boundary) {
    return {
      root: fixtureRoot,
      env: ambient,
      cwd,
      boundary: given,
      platform: process.platform,
      readText: vi.fn(path => {
        if (path === projectPaths(fixtureRoot).workflow) return ciText;
        if (path === envFile) return readFileSync(path, "utf8");
        throw new Error(`unexpected read ${path}`);
      }),
      fileExists: vi.fn(path => existsSync(path)),
      writeEnvFile: vi.fn(),
      removeFile: vi.fn(),
      connect: vi.fn(async () => { throw new Error("no connection may be opened"); }),
      spawn: vi.fn(async () => 0),
      stdout: vi.fn(),
      stderr: vi.fn()
    };
  }

  // The environment `run` hands its child, captured at the spawn.
  async function childEnvironment(ambient, { argv = command, cwd = project } = {}) {
    const deps = dependencies(ambient, cwd);
    const code = await main(["run", "fixture", "--", ...argv], deps);
    expect(code, deps.stderr.mock.calls.join("\n")).toBe(0);
    expect(deps.connect).not.toHaveBeenCalled();
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    return deps.spawn.mock.calls[0][2].env;
  }

  // A refusal: exit 1, no child process, no connection, no socket.
  async function refusal(ambient, { argv = command, cwd = project, given = boundary } = {}) {
    const deps = dependencies(ambient, cwd, given);
    const before = sockets;
    const code = await main(["run", "fixture", "--", ...argv], deps);
    const errors = deps.stderr.mock.calls.map(call => call[0]).join("\n");
    expect(code, errors).toBe(1);
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(deps.connect).not.toHaveBeenCalled();
    expect(sockets - before).toBe(0);
    return errors;
  }

  const indirections = [
    ["DB-02: an inherited npm_config_userconfig whose npmrc sets node-options", () => ({ npm_config_userconfig: file("node-options.npmrc") })],
    ["NPM_CONFIG_USERCONFIG in upper case", () => ({ NPM_CONFIG_USERCONFIG: file("node-options.npmrc") })],
    ["a global npmrc that sets node-options (Npm_Config_Globalconfig, mixed case)", () => ({ Npm_Config_Globalconfig: file("node-options.npmrc") })],
    ["an npm prefix whose etc/npmrc sets node-options (npm_config_prefix)", () => ({ npm_config_prefix: file("evil-prefix") })],
    ["npm's node-options set directly (NPM_CONFIG_NODE_OPTIONS)", () => ({ NPM_CONFIG_NODE_OPTIONS: `--require=${file("poison.cjs")}` })],
    ["npm's script shell (npm_config_script_shell)", () => ({ npm_config_script_shell: file("poison-shell.sh") })],
    ["NODE_OPTIONS with --require", () => ({ NODE_OPTIONS: `--require=${file("poison.cjs")}` })],
    ["NODE_OPTIONS with --import", () => ({ NODE_OPTIONS: `--import=${pathToFileURL(file("poison.mjs")).href}` })],
    ["DOTENV_CONFIG_PATH with DOTENV_CONFIG_OVERRIDE=true (DB-01)", () => ({ DOTENV_CONFIG_PATH: file("poison.env"), DOTENV_CONFIG_OVERRIDE: "true" })]
  ];

  it.each(indirections)("keeps the validated database when the caller sets %s", async (_label, poison) => {
    expect(redirected(npmProbe(baselineEnvironment(poison())))).toBe(true);
    const env = await childEnvironment({ PATH, HOME: cleanHome, CI: "true", DATABASE_URL: outside("ambient"), PGHOST: "outside.example.test", ...poison() });
    writeFileSync(poisonLog, "");
    expect(npmProbe(env)).toEqual(guarded);
    expect(readFileSync(poisonLog, "utf8")).toBe("");
  }, 120_000);

  it("keeps the validated database when HOME holds a poisoned .npmrc and .env", async () => {
    expect(redirected(npmProbe(baselineEnvironment({}, poisonHome)))).toBe(true);
    const env = await childEnvironment({ PATH, HOME: poisonHome, CI: "true" });
    // R3 (DB-04): the child's HOME is the boundary's scratch home, never the caller's.
    expect(env.HOME).not.toBe(poisonHome);
    expect(env.HOME).toBe(boundary?.home);
    writeFileSync(poisonLog, "");
    expect(npmProbe(env)).toEqual(guarded);
    expect(readFileSync(poisonLog, "utf8")).toBe("");
  }, 120_000);

  it("keeps the validated database when the working directory holds a poisoned .env", async () => {
    const dotenvFile = join(project, ".env");
    writeFileSync(dotenvFile, `DATABASE_URL=${outside("cwd_env")}\nRECOVERY_TEST_DATABASE_URL=${outside("cwd_recovery")}\nNODE_OPTIONS=--require=${file("poison.cjs")}\nnpm_config_userconfig=${file("node-options.npmrc")}\n`);
    try {
      expect(redirected(npmProbe({ PATH, HOME: cleanHome, CI: "true" }))).toBe(true);
      const env = await childEnvironment({ PATH, HOME: cleanHome, CI: "true" });
      expect(npmProbe(env)).toEqual(guarded);
      expect(readFileSync(poisonLog, "utf8")).toBe("");
    } finally {
      rmSync(dotenvFile, { force: true });
    }
  }, 120_000);

  it("refuses a poisoned .npmrc in the working directory before any child, without opening it", async () => {
    const npmrc = join(project, ".npmrc");
    writeFileSync(npmrc, `node-options=--require=${file("poison.cjs")}\n`);
    try {
      expect(redirected(npmProbe(baselineEnvironment({})))).toBe(true);
      expect(await refusal({ PATH, HOME: cleanHome, CI: "true" })).toMatch(/project config .*\.npmrc/u);
    } finally {
      rmSync(npmrc, { force: true });
    }
  }, 120_000);

  it.each([
    ["a user config", () => ["npm", `--userconfig=${file("node-options.npmrc")}`, "run", "inspect"], /userconfig would be/u],
    ["node-options", () => ["npm", `--node-options=--require=${file("poison.cjs")}`, "run", "inspect"], /node-options is set/u],
    ["node-options through npx", () => ["npx", `--node-options=--require=${file("poison.cjs")}`, "node", "-e", "0"], /node-options is set/u]
  ])("refuses a command whose npm flags set %s", async (_label, argv, message) => {
    expect(await refusal({ PATH, HOME: cleanHome, CI: "true" }, { argv: argv() })).toMatch(message);
  });

  it("follows npm's own precedence: a --globalconfig flag loses to the pinned global config", async () => {
    // npm applies the environment's globalconfig over the flag (its default layer defines the key with
    // a setter), so the helper, which asks npm's own loader, lets the command run; the script stays put.
    const argv = ["npm", `--globalconfig=${file("node-options.npmrc")}`, "run", "--silent", "inspect"];
    const env = await childEnvironment({ PATH, HOME: cleanHome, CI: "true" }, { argv });
    expect(npmProbe(env, { args: argv.slice(1) })).toEqual(guarded);
    expect(readFileSync(poisonLog, "utf8")).toBe("");
  }, 120_000);

  it("refuses when the helper's own npm config file has been given a setting", async () => {
    const owned = ownedNpmrc();
    const original = existsSync(owned) ? readFileSync(owned, "utf8") : null;
    writeFileSync(owned, `node-options=--require=${file("poison.cjs")}\n`);
    try {
      expect(await refusal({ PATH, HOME: cleanHome, CI: "true" })).toMatch(/user config .* sets node-options/u);
    } finally {
      if (original === null) rmSync(owned, { force: true }); else writeFileSync(owned, original);
    }
  });

  it("refuses an npm whose own config loader the helper cannot find", async () => {
    // R3: the caller's PATH no longer reaches the child, so the unknown npm is put on the boundary's.
    const given = boundary && { ...boundary, path: `${file("fake-bin")}${delimiter}${boundary.path}` };
    expect(await refusal({ PATH: `${file("fake-bin")}${delimiter}${PATH}`, HOME: cleanHome, CI: "true" }, { given })).toMatch(/cannot find npm's own config loader/u);
  });

  it("refuses an env file that points npm at another config file", async () => {
    const original = readFileSync(envFile, "utf8");
    writeFileSync(envFile, original.replace(/^npm_config_userconfig=.*$/mu, "") + `npm_config_userconfig="${file("node-options.npmrc")}"\n`);
    try {
      expect(await refusal({ PATH, HOME: cleanHome, CI: "true" })).toMatch(/sets npm_config_userconfig/u);
    } finally {
      writeFileSync(envFile, original);
    }
  });

  it("passes none of 200 random unknown inherited variables to the child", async () => {
    const prefixes = ["", "X_", "npm_config_", "NPM_CONFIG_", "Npm_Config_", "DOTENV_", "NODE_", "PRISMA_", "VITEST_", "VITE_", "NEXT_", "TSX_", "JITI_", "PG", "lower_", "__"];
    const unknown = {};
    while (Object.keys(unknown).length < 200) {
      const suffix = randomBytes(6).toString("hex");
      const name = `${prefixes[randomInt(prefixes.length)]}R2${randomInt(2) ? suffix.toUpperCase() : suffix}`;
      unknown[name] = randomInt(2) ? outside(`random_${suffix}`) : `value-${randomBytes(8).toString("hex")}`;
    }
    const allowed = { PATH, HOME: cleanHome, CI: "true" };
    const env = await childEnvironment({ ...allowed, ...unknown });
    const leaked = Object.keys(unknown).filter(name => name in env);
    expect(leaked, `leaked: ${leaked.join(", ")}`).toEqual([]);
    const values = new Set(Object.values(unknown));
    expect(Object.entries(env).filter(([, value]) => values.has(value))).toEqual([]);
    // Every name in the child is an allowlisted one the caller set, an env-file key or a pin.
    const fileKeys = Object.keys(parseDotenv(readFileSync(envFile, "utf8")));
    const pins = helper.childPins(helper.testEnvFiles("jitm_design_fixture", fixtureRoot), await readCiConfiguration(ciText));
    // R3: plus HOME and PATH, which come from the boundary.
    const expectedKeys = new Set([...Object.keys(allowed).filter(name => helper.inheritedNames().includes(name)), ...fileKeys, ...pins.keys(), "HOME", "PATH"]);
    expect(Object.keys(env).filter(name => !expectedKeys.has(name))).toEqual([]);
    expect(npmProbe(env)).toEqual(guarded);
  }, 120_000);

  it("checks the npm that a script starts in turn, with npm's own loader", async () => {
    const env = await childEnvironment({ PATH, HOME: cleanHome, CI: "true" });
    const files = helper.testEnvFiles("jitm_design_fixture", fixtureRoot);
    const pins = helper.childPins(files, await readCiConfiguration(ciText));
    const seen = [];
    const checked = await helper.assertNpmBoundary(env, { command, cwd: project, pins, checkScriptEnvironment: (scriptEnvironment, label) => seen.push([label, scriptEnvironment.NODE_OPTIONS, scriptEnvironment.npm_config_userconfig]) });
    expect(checked.map(entry => entry.localPrefix)).toEqual([project, project, project, project]);
    expect(seen.filter(([label]) => /then npm from a script/u.test(label))).toHaveLength(2);
    for (const [, nodeOptions, userconfig] of seen) expect([nodeOptions, userconfig]).toEqual(["", files.npmUserConfig]);
  });

  it("writes npm's user and global config files empty and pins npm to them in the env file", () => {
    const files = helper.testEnvFiles("jitm_design_fixture", fixtureRoot);
    const values = parseDotenv(readFileSync(envFile, "utf8"));
    expect(values).toMatchObject({ npm_config_userconfig: files.npmUserConfig, npm_config_globalconfig: files.npmGlobalConfig });
    for (const path of [files.npmUserConfig, files.npmGlobalConfig]) {
      expect(readFileSync(path, "utf8").split("\n").filter(line => line.trim() && !line.startsWith("#"))).toEqual([]);
    }
    expect(files.npmUserConfig).not.toBe(files.npmGlobalConfig);
  });

  it("drops the env file and both npm config files", async () => {
    const run = harness();
    expect(await main(["drop", "qa1"], run.dependencies)).toBe(0);
    const files = helper.testEnvFiles("jitm_design_qa1", root);
    expect(run.dependencies.removeFile.mock.calls.map(call => call[0]).sort()).toEqual([files.envFile, files.npmUserConfig, files.npmGlobalConfig].sort());
  });
});

describe("the allowlist config (scripts/test-env.config.json)", () => {
  const config = () => JSON.parse(readFileSync(helper.CONFIG_FILE, "utf8"));
  const docs = () => readFileSync(join(projectPaths().root, "docs", "LOCAL_TESTING.md"), "utf8");

  it("parses, and docs/LOCAL_TESTING.md justifies every inherited name and pinned path", () => {
    const parsed = helper.parseTestEnvConfig(config());
    const text = docs();
    for (const name of Object.values(parsed.inherit).flat()) expect(text, name).toContain(`\`${name}\``);
    for (const template of Object.values(parsed.files)) expect(text, template).toContain(`\`${template}\``);
    for (const name of Object.keys(parsed.npmConfigPins)) expect(text, name).toContain(`\`${name}\``);
  });

  it.each(["DATABASE_URL", "netlify_db_url", "PGHOST", "NODE_OPTIONS", "Node_Options", "npm_config_userconfig", "NPM_CONFIG_PREFIX", "DOTENV_KEY", "DOTENV_CONFIG_PATH", "JITI_ALIAS", "TSX_TSCONFIG_PATH", "NODE_ENV"])("refuses %s in the allowlist", name => {
    const value = config();
    value.inherit.all = [...value.inherit.all, name];
    expect(() => helper.parseTestEnvConfig(value)).toThrow(/never inherits it/u);
  });

  it.each([
    ["an absolute path", files => ({ ...files, envFile: "/tmp/{database}.env" })],
    ["a path that leaves the repository", files => ({ ...files, npmUserConfig: "../{database}.npmrc" })],
    ["a path without the database", files => ({ ...files, npmGlobalConfig: ".artifacts/test-env/global.npmrc" })],
    ["one file as both npm configs", files => ({ ...files, npmGlobalConfig: files.npmUserConfig })]
  ])("refuses %s for a pinned file", (_label, change) => {
    const value = config();
    value.files = change(value.files);
    expect(() => helper.parseTestEnvConfig(value)).toThrow(/files/u);
  });

  it("refuses a config that leaves npm's user or global config unpinned", () => {
    const value = config();
    delete value.npmConfigPins.npm_config_globalconfig;
    expect(() => helper.parseTestEnvConfig(value)).toThrow(/must pin npm_config_globalconfig/u);
  });

  it("matches names without letter case only on Windows", () => {
    // R3: PATH and HOME are no longer allowlisted (the entry point sets them), so locale and temp names show the rule.
    const env = { Lang: "C", LANG: "C.UTF-8", npm_config_userconfig: "x", Temp: "C:\\\\t", PATH: "/usr/bin", Home: "/h" };
    expect(helper.allowlistedEnvironment(env, "linux")).toEqual({ LANG: "C.UTF-8" });
    expect(helper.allowlistedEnvironment(env, "win32")).toEqual({ Lang: "C", LANG: "C.UTF-8", Temp: "C:\\\\t" });
  });
});

// JITM-TESTENV-01-R3 (Kevin, option A): the helper guarantees loopback isolation when it starts
// through ONE entry point, scripts/test-env, from a clean boundary. The calling session is trusted,
// not hostile. The cases below are the re-check's DB-03 (a parent's NODE_OPTIONS or npmrc preload),
// DB-04 (an inherited HOME whose .bashrc re-points the database, through `run -- bash -ic`) and
// DB-05 (an npm or @npmcli/config on the caller's PATH), plus the plain-argv shell rule. Every
// refusal opens no connection and starts no child process.

describe("R3: run takes plain argv; a shell only with --noprofile --norc and never interactive", () => {
  const file = envFilePath("jitm_design_fixture", root);
  const spawned = async (command, overrides = {}) => {
    const run = harness({ files: { [file]: await envFileFor() }, ...overrides });
    const code = await main(["run", "fixture", "--", ...command], run.dependencies);
    return { code, run };
  };

  it.each([
    [["bash", "-ic", "npm test"], /bash -ic: an interactive shell/u],
    [["bash", "-lc", "npm test"], /bash -lc: a login shell/u],
    [["sh", "-i"], /sh -i: an interactive shell/u],
    [["bash", "-c", "npm test"], /without --noprofile --norc/u],
    [["sh", "-c", "npm test"], /without --noprofile --norc/u],
    [["bash", "--noprofile", "-c", "npm test"], /without --norc/u],
    [["bash", "--norc", "-c", "npm test"], /without --noprofile/u],
    [["bash", "--noprofile", "--norc", "-ic", "npm test"], /an interactive shell/u],
    [["bash", "--noprofile", "--norc", "-i", "-c", "npm test"], /an interactive shell/u],
    [["bash", "--noprofile", "--norc", "-l", "-c", "npm test"], /a login shell/u],
    [["bash", "--login", "--noprofile", "--norc", "-c", "npm test"], /--login/u],
    [["bash", "--noprofile", "--norc", "--rcfile", "/elsewhere/rc", "-c", "npm test"], /--rcfile/u],
    [["bash", "--noprofile", "--norc", "--init-file=/elsewhere/rc", "-c", "npm test"], /--init-file/u],
    [["bash", "--noprofile", "--norc", "-s"], /standard input/u],
    [["bash", "--noprofile", "--norc"], /no -c and no script/u],
    [["bash", "-e", "--noprofile", "--norc", "-c", "npm test"], /after a single-letter option/u],
    [["zsh", "--noprofile", "--norc", "-o", "interactive", "-c", "npm test"], /-o interactive/u],
    [["/bin/bash", "-ic", "npm test"], /bash -ic/u],
    [["-bash", "-c", "npm test"], /names a login shell/u]
  ])("refuses %j with no connection and no child process", async (command, message) => {
    const { code, run } = await spawned(command);
    expect(code).toBe(1);
    expect(run.errors()).toMatch(message);
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it.each([
    [["bash", "--noprofile", "--norc", "-c", "npm test"]],
    [["bash", "--noprofile", "--norc", "-ec", "npm test"]],
    [["bash", "--noprofile", "--norc", "-o", "pipefail", "-c", "npm test"]],
    [["bash", "--noprofile", "--norc", "scripts/check.sh", "-i"]],
    [["npm", "test"]],
    [["node", "-e", "0"]]
  ])("starts %j as it is", async command => {
    const { code, run } = await spawned(command);
    expect(code, run.errors()).toBe(0);
    expect(run.dependencies.spawn).toHaveBeenCalledTimes(1);
    expect(run.dependencies.spawn.mock.calls[0].slice(0, 2)).toEqual([command[0], command.slice(1)]);
  });

  it("refuses run without the entry point's boundary, or with another database's, before any child", async () => {
    for (const boundary of [null, harnessBoundary("jitm_design_other")]) {
      const { code, run } = await spawned(["npm", "test"], { boundary });
      expect(code).toBe(1);
      expect(run.errors()).toMatch(/only through scripts\/test-env/u);
      expect(run.dependencies.spawn).not.toHaveBeenCalled();
      expect(run.dependencies.connect).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["HOME", { HOME: "/elsewhere/home" }, /sets HOME, which the entry point sets/u],
    ["PATH", { PATH: "/elsewhere/bin" }, /sets PATH, which the entry point sets/u],
    ["BASH_ENV", { BASH_ENV: "/elsewhere/rc" }, /sets BASH_ENV/u],
    ["ENV", { ENV: "/elsewhere/rc" }, /sets ENV/u]
  ])("refuses an env file that sets %s", async (_label, overrides, message) => {
    const run = harness({ files: { [file]: await envFileFor("jitm_design_fixture", overrides) } });
    expect(await main(["run", "fixture", "--", "npm", "test"], run.dependencies)).toBe(1);
    expect(run.errors()).toMatch(message);
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
    expect(run.dependencies.connect).not.toHaveBeenCalled();
  });

  it("never writes HOME, PATH or a shell startup variable from .env.example into the env file", async () => {
    const ci = await readCiConfiguration(ciFixture());
    const environment = buildEnvironment({ exampleText: exampleFixture("HOME=/elsewhere\nPATH=/elsewhere/bin\nBASH_ENV=/elsewhere/rc\nENV=/elsewhere/rc\n"), ci, database: "jitm_design_fixture", root });
    const values = Object.fromEntries(environment.values);
    for (const name of ["HOME", "PATH", "BASH_ENV", "ENV"]) expect(values).not.toHaveProperty(name);
  });

  it("drops the scratch HOME and the toolchain folder with the database", async () => {
    const run = harness();
    expect(await main(["drop", "qa1"], run.dependencies)).toBe(0);
    const folders = helper.boundaryPaths("jitm_design_qa1", root);
    expect(run.dependencies.removeFolder.mock.calls.map(call => call[0]).sort()).toEqual([folders.home, folders.bin].sort());
  });
});

describe.skipIf(process.platform === "win32")("R3: the launch plan and the boundary check", () => {
  // Folders are made in beforeAll, so a filtered or skipped run leaves nothing behind.
  let work, fixtureRoot, prepared;
  const plan = (overrides = {}) => helper.launchPlan({ argv: ["run", "fixture"], env: { PATH: standardPath }, execPath: process.execPath, root: fixtureRoot, ...overrides });

  beforeAll(() => {
    work = realpathSync(mkdtempSync(join(tmpdir(), "jitm-test-env-r3-plan-")));
    fixtureRoot = join(work, "repo");
    mkdirSync(fixtureRoot, { recursive: true });
    prepared = prepareBoundary(fixtureRoot);
  });
  afterAll(() => { if (work) rmSync(work, { recursive: true, force: true }); });

  it("creates an owned scratch HOME and a bin folder whose node, npm and npx are the toolchain's", () => {
    const folders = helper.boundaryPaths("jitm_design_fixture", fixtureRoot);
    expect(prepared).toMatchObject({ database: "jitm_design_fixture", home: folders.home, bin: folders.bin, node: realpathSync(process.execPath) });
    for (const folder of [folders.home, folders.bin]) {
      const stats = lstatSync(folder);
      expect(stats.isDirectory()).toBe(true);
      expect(stats.mode & 0o077).toBe(0);
    }
    const npmRoot = helper.toolchainNpm(realpathSync(process.execPath)).root;
    expect(realpathSync(join(folders.bin, "node"))).toBe(realpathSync(process.execPath));
    expect(realpathSync(join(folders.bin, "npm"))).toBe(realpathSync(join(npmRoot, "bin", "npm-cli.js")));
    expect(realpathSync(join(folders.bin, "npx"))).toBe(realpathSync(join(npmRoot, "bin", "npx-cli.js")));
    expect(prepared.path).toBe(`${folders.bin}:${standardPath}`);
    expect(readFileSync(join(npmRoot, "package.json"), "utf8")).toMatch(/"name":\s*"npm"/u);
    // The launcher reads these lines; INHERIT lists exactly the allowlist.
    const lines = helper.renderLaunchPlan(prepared).split("\n");
    expect(lines.slice(0, 3)).toEqual([`NODE=${prepared.node}`, `HOME=${prepared.home}`, `PATH=${prepared.path}`]);
    expect(lines.slice(3)).toEqual(helper.inheritedNames().map(name => `INHERIT=${name}`));
  });

  it.each([
    ["an inherited NODE_OPTIONS", { env: { PATH: standardPath, NODE_OPTIONS: "--require=/elsewhere/a.cjs" } }, /only the standard PATH; it found NODE_OPTIONS/u],
    ["an inherited HOME", { env: { PATH: standardPath, HOME: "/home/someone" } }, /it found HOME/u],
    ["node options on the command line", { execArgv: ["--require", "/elsewhere/a.cjs"] }, /started with --require/u],
    ["a relative standard path", { env: { PATH: `bin:${standardPath}` } }, /absolute folders/u],
    ["a bad name", { argv: ["create", "bad$name"] }, /must match/u]
  ])("refuses %s", (_label, overrides, message) => {
    expect(() => plan(overrides)).toThrow(message);
  });

  it("returns no plan for an unknown command", () => {
    expect(plan({ argv: ["list"] })).toBeNull();
  });

  it("refuses a node other than the toolchain's", () => {
    const other = join(work, "other-node");
    writeFileSync(other, "#!/bin/sh\nexit 0\n");
    chmodSync(other, 0o755);
    const link = join(fixtureRoot, helper.testEnvConfig().boundary.node);
    rmSync(link, { force: true });
    symlinkSync(other, link);
    try {
      expect(() => plan()).toThrow(/not the toolchain's node/u);
    } finally {
      rmSync(link, { force: true });
      symlinkSync(process.execPath, link);
    }
  });

  it("takes node from the standard path when there is no link, never from the caller's PATH", () => {
    const bare = join(work, "bare");
    mkdirSync(bare, { recursive: true });
    const onStandard = helper.findOnPath("node", { PATH: standardPath });
    if (onStandard) expect(helper.toolchainNode(standardPath, bare)).toBe(realpathSync(onStandard));
    const empty = join(work, "empty-bin");
    mkdirSync(empty, { recursive: true });
    expect(() => helper.toolchainNode(empty, bare)).toThrow(/No node on the standard path/u);
  });

  it.each([
    ["a HOME that links elsewhere", "home", folder => { rmSync(folder, { recursive: true, force: true }); mkdirSync(join(work, "linked"), { recursive: true, mode: 0o700 }); symlinkSync(join(work, "linked"), folder); }, /not a folder the helper created/u],
    ["a HOME open to other users", "home", folder => chmodSync(folder, 0o755), /open to other users/u]
  ])("refuses %s", (_label, key, change, message) => {
    const folder = helper.boundaryPaths("jitm_design_other", fixtureRoot)[key];
    helper.launchPlan({ argv: ["run", "other"], env: { PATH: standardPath }, execPath: process.execPath, root: fixtureRoot });
    change(folder);
    expect(() => helper.launchPlan({ argv: ["run", "other"], env: { PATH: standardPath }, execPath: process.execPath, root: fixtureRoot })).toThrow(message);
    rmSync(folder, { recursive: true, force: true });
  });

  const started = (env, overrides = {}) => helper.launchBoundary({ argv: ["run", "fixture", "--", "npm", "test"], env, execPath: process.execPath, root: fixtureRoot, ...overrides });

  it("accepts the environment the entry point gives the helper", () => {
    expect(started({ HOME: prepared.home, PATH: prepared.path, TERM: "xterm", LANG: "C.UTF-8" })).toMatchObject({ database: "jitm_design_fixture", home: prepared.home, path: prepared.path });
    expect(started({ HOME: prepared.home, PATH: prepared.path }, { argv: ["list"] })).toBeNull();
  });

  it.each([
    ["a start from an ordinary shell", () => ({ ...process.env }), {}, /start it through scripts\/test-env/u],
    ["an inherited NODE_OPTIONS", () => ({ HOME: prepared.home, PATH: prepared.path, NODE_OPTIONS: "--require=/elsewhere/a.cjs" }), {}, /does not allow \(NODE_OPTIONS\)/u],
    ["an inherited DATABASE_URL", () => ({ HOME: prepared.home, PATH: prepared.path, DATABASE_URL: "postgresql://prod:prod@outside.example.test/jitm" }), {}, /DATABASE_URL/u],
    ["the caller's HOME", () => ({ HOME: "/home/someone", PATH: prepared.path }), {}, /not the scratch home/u],
    ["the caller's PATH", () => ({ HOME: prepared.home, PATH: standardPath }), {}, /must start with the toolchain folder/u],
    ["node options", () => ({ HOME: prepared.home, PATH: prepared.path }), { execArgv: ["--import", "/elsewhere/a.mjs"] }, /started with --import/u]
  ])("refuses %s", (_label, env, overrides, message) => {
    expect(() => started(env(), overrides)).toThrow(message);
  });

  it("refuses a toolchain folder whose npm link was changed", () => {
    const npm = join(prepared.bin, "npm");
    const fake = join(work, "npm-cli.js");
    writeFileSync(fake, "");
    rmSync(npm, { force: true });
    symlinkSync(fake, npm);
    try {
      expect(() => started({ HOME: prepared.home, PATH: prepared.path })).toThrow(/does not lead to the toolchain's npm/u);
    } finally {
      prepared = prepareBoundary(fixtureRoot);
    }
  });
});

// A real fixture for the helper's run: an env file written by create, a project whose npm script
// reports the target a pg client resolves (its socket connect throws), and markers for any code
// that must not run.
function r3Fixture(prefix) {
  const outside = database => `postgresql://prod:prod@outside.example.test:5432/${database}`;
  const fixture = { outside };
  const file = name => join(fixture.work, name);
  fixture.file = file;
  fixture.markers = () => (fixture.marker && existsSync(fixture.marker) ? readFileSync(fixture.marker, "utf8").split("\n").filter(Boolean) : []);
  fixture.cleanup = () => { if (fixture.work) rmSync(fixture.work, { recursive: true, force: true }); };
  // The folder is made here, in beforeAll, so a filtered or skipped run leaves nothing behind.
  fixture.setup = async ({ ciText = ciFixture(), copyScripts = false } = {}) => {
    fixture.work = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    Object.assign(fixture, { marker: file("marker.log"), project: file("project"), poisonHome: file("poisoned-home"), evil: file("evil"), fixtureRoot: file("repo") });
    const { marker } = fixture;
    for (const directory of [fixture.project, fixture.poisonHome, join(fixture.evil, "bin"), join(fixture.evil, "lib/node_modules/npm/bin"), join(fixture.evil, "lib/node_modules/npm/node_modules/@npmcli/config/lib/definitions"), join(fixture.fixtureRoot, "scripts"), join(fixture.fixtureRoot, ".github/workflows")]) mkdirSync(directory, { recursive: true });
    writeFileSync(marker, "");
    const append = what => `require("node:fs").appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(`${what}\n`)});`;
    writeFileSync(file("preload.cjs"), `${append("preload")}\nprocess.env.DATABASE_URL = ${JSON.stringify(outside("preload"))};\n`);
    writeFileSync(file("spawned.cjs"), `${append("spawned")}\n`);
    writeFileSync(file("outer.npmrc"), `node-options=--require=${file("preload.cjs")}\n`);
    // DB-04: a home whose rc files re-point the database and the recovery opt-in.
    const rc = `echo rc >> '${marker}'\nexport DATABASE_URL='${outside("home_rc")}'\nexport RECOVERY_TEST_DATABASE_URL='${outside("home_rc_recovery")}'\n`;
    for (const name of [".bashrc", ".bash_profile", ".bash_login", ".profile"]) writeFileSync(join(fixture.poisonHome, name), rc);
    writeFileSync(join(fixture.poisonHome, ".npmrc"), `node-options=--require=${file("preload.cjs")}\n`);
    writeFileSync(join(fixture.poisonHome, ".env"), `DATABASE_URL=${outside("home_env")}\n`);
    // DB-05: a PATH whose npm, npm config loader, node and utilities are not the toolchain's.
    for (const name of ["node", "sed", "env", "getconf", "dirname", "sh"]) {
      writeFileSync(join(fixture.evil, "bin", name), `#!/bin/sh\necho 'evil ${name}' >> '${marker}'\nexit 97\n`);
      chmodSync(join(fixture.evil, "bin", name), 0o755);
    }
    const npmRoot = join(fixture.evil, "lib/node_modules/npm");
    writeFileSync(join(npmRoot, "package.json"), JSON.stringify({ name: "npm", version: "10.0.0" }));
    for (const cli of ["npm-cli.js", "npx-cli.js"]) {
      writeFileSync(join(npmRoot, "bin", cli), `#!/usr/bin/env node\n${append(`evil ${cli}`)}\nprocess.exit(97);\n`);
      chmodSync(join(npmRoot, "bin", cli), 0o755);
      symlinkSync(join(npmRoot, "bin", cli), join(fixture.evil, "bin", cli.replace("-cli.js", "")));
    }
    writeFileSync(join(npmRoot, "node_modules/@npmcli/config/index.js"), `${append("evil @npmcli/config")}\nthrow new Error("evil config loader");\n`);
    writeFileSync(join(npmRoot, "node_modules/@npmcli/config/lib/definitions/index.js"), `${append("evil definitions")}\n`);
    // The probe: dotenv/config as the repository's configs load it, then the target pg resolves.
    const requireFromTests = createRequire(import.meta.url);
    writeFileSync(file("probe.mjs"), [
      'import net from "node:net";',
      "let connections = 0;",
      'net.Socket.prototype.connect = function () { connections += 1; throw new Error("the probe opens no connection"); };',
      `await import(${JSON.stringify(pathToFileURL(requireFromTests.resolve("dotenv/config")).href)});`,
      `const { default: pg } = await import(${JSON.stringify(pathToFileURL(requireFromTests.resolve("pg")).href)});`,
      "const parameters = new pg.Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}).connectionParameters;",
      "process.stdout.write(`\\nPROBE ${JSON.stringify({ host: parameters.host, database: parameters.database, recovery: process.env.RECOVERY_TEST_DATABASE_URL ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null, home: process.env.HOME ?? null, connections })}\\n`);"
    ].join("\n"));
    writeFileSync(join(fixture.project, "package.json"), JSON.stringify({ name: "jitm-r3-probe", private: true, scripts: { inspect: `node ${JSON.stringify(file("probe.mjs"))}` } }, null, 2));
    if (copyScripts) {
      // The entry point and the helper, copied as they are; node_modules is the repository's.
      const repository = projectPaths().root;
      for (const name of ["test-env", "test-env.mjs", "test-env.config.json"]) copyFileSync(join(repository, "scripts", name), join(fixture.fixtureRoot, "scripts", name));
      chmodSync(join(fixture.fixtureRoot, "scripts", "test-env"), 0o755);
      symlinkSync(join(repository, "node_modules"), join(fixture.fixtureRoot, "node_modules"));
    }
    writeFileSync(projectPaths(fixture.fixtureRoot).workflow, ciText);
    writeFileSync(projectPaths(fixture.fixtureRoot).example, exampleFixture());
    fixture.boundary = prepareBoundary(fixture.fixtureRoot);
    const client = { query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => {}) };
    const created = await main(["create", "fixture"], {
      root: fixture.fixtureRoot,
      env: {},
      readText: path => readFileSync(path, "utf8"),
      writeEnvFile: (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, { mode: 0o600 }); },
      removeFile: path => rmSync(path, { force: true }),
      connect: vi.fn(async () => client),
      spawn: vi.fn(),
      stdout: vi.fn(),
      stderr: vi.fn()
    });
    expect(created).toBe(0);
  };
  fixture.probe = stdout => {
    const line = String(stdout).split("\n").find(entry => entry.startsWith("PROBE "));
    if (!line) throw new Error(`no probe line in ${JSON.stringify(stdout)}`);
    return JSON.parse(line.slice("PROBE ".length));
  };
  return fixture;
}

describe.skipIf(process.platform === "win32")("R3: the helper never takes HOME or the toolchain from the caller (DB-04, DB-05)", () => {
  const fixture = r3Fixture("jitm-test-env-r3-helper-");
  beforeAll(() => fixture.setup());
  afterAll(() => fixture.cleanup());
  beforeEach(() => writeFileSync(fixture.marker, ""));

  function realRun(env) {
    return {
      root: fixture.fixtureRoot,
      env,
      cwd: fixture.project,
      boundary: fixture.boundary,
      readText: path => readFileSync(path, "utf8"),
      fileExists: path => existsSync(path),
      connect: vi.fn(async () => { throw new Error("no connection may be opened"); }),
      spawn: vi.fn(async () => 0),
      stdout: vi.fn(),
      stderr: vi.fn()
    };
  }

  it("DB-05: loads no npm or @npmcli/config from the caller's PATH; the child's npm is the toolchain's", async () => {
    const deps = realRun({ PATH: `${join(fixture.evil, "bin")}${delimiter}${process.env.PATH ?? ""}`, HOME: fixture.poisonHome, CI: "true" });
    const code = await main(["run", "fixture", "--", "npm", "run", "--silent", "inspect"], deps);
    expect(fixture.markers()).toEqual([]);
    expect(code, deps.stderr.mock.calls.join("\n")).toBe(0);
    expect(deps.connect).not.toHaveBeenCalled();
    const { env } = deps.spawn.mock.calls[0][2];
    expect(env.PATH).toBe(fixture.boundary?.path);
    expect(env.PATH).not.toContain(fixture.evil);
  });

  it("DB-04: gives the child the scratch HOME, never the caller's", async () => {
    const deps = realRun({ PATH: process.env.PATH ?? "", HOME: fixture.poisonHome, CI: "true" });
    expect(await main(["run", "fixture", "--", "npm", "run", "--silent", "inspect"], deps)).toBe(0);
    const { env } = deps.spawn.mock.calls[0][2];
    expect(env.HOME).toBe(fixture.boundary?.home);
    expect(env.HOME).not.toBe(fixture.poisonHome);
  });

  it("DB-04: refuses `bash -ic` with an inherited HOME whose .bashrc re-points the database", async () => {
    const deps = realRun({ PATH: process.env.PATH ?? "", HOME: fixture.poisonHome, CI: "true" });
    expect(await main(["run", "fixture", "--", "bash", "-ic", `node ${fixture.file("spawned.cjs")}`], deps)).toBe(1);
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(deps.connect).not.toHaveBeenCalled();
    expect(fixture.markers()).toEqual([]);
  });
});

// Through the entry point itself, as a session runs it: scripts/test-env, copied with the helper
// into a fixture repository whose CI port is a local counting server, so a connection would show.
describe.skipIf(process.platform === "win32" || spawnSync("bash", ["--noprofile", "--norc", "-c", "true"]).status !== 0)("R3: one entry point, scripts/test-env, starts the helper from a clean boundary", () => {
  let connections = 0;
  const server = net.createServer(socket => { connections += 1; socket.destroy(); });
  const fixture = r3Fixture("jitm-test-env-r3-launcher-");
  const launcher = () => join(fixture.fixtureRoot, "scripts", "test-env");
  const guarded = () => ({ host: "127.0.0.1", database: "jitm_design_fixture", recovery: "", nodeOptions: "", home: fixture.boundary.home, connections: 0 });
  const PATH = process.env.PATH ?? "";
  const base = () => ({ PATH, HOME: fixture.file("parent-home"), ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) });

  beforeAll(async () => {
    await new Promise(resolvePromise => server.listen(0, "127.0.0.1", resolvePromise));
    const { port: serverPort } = server.address();
    await fixture.setup({ copyScripts: true, ciText: ciFixture({ url: `postgresql://${role}:${secret}@localhost:${serverPort}/jitm_design_fixture?schema=public`, ports: [`${serverPort}:5432`] }) });
    mkdirSync(fixture.file("parent-home"), { recursive: true });
  });
  afterAll(async () => {
    if (server.listening) await new Promise(resolvePromise => server.close(resolvePromise));
    fixture.cleanup();
  });
  beforeEach(() => writeFileSync(fixture.marker, ""));

  function launch(args, { env = {}, cwd = fixture.project } = {}) {
    return spawnSync(launcher(), args, { cwd, env: { ...base(), ...env }, encoding: "utf8", timeout: 120_000 });
  }

  // A refusal: exit 1, a refusal message, no marker (no preload, rc file, child or evil tool ran)
  // and no connection to the CI port.
  function refused(args, options) {
    const before = connections;
    const result = launch(args, options);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/test-env refused/u);
    expect(fixture.markers()).toEqual([]);
    expect(connections - before).toBe(0);
    return result.stderr;
  }

  function ran(args, options) {
    const before = connections;
    const result = launch(args, options);
    expect(result.status, result.stderr).toBe(0);
    expect(fixture.markers()).toEqual([]);
    expect(connections - before).toBe(0);
    return fixture.probe(result.stdout);
  }

  it("is one executable POSIX launcher, and the package scripts call it", () => {
    const repository = projectPaths().root;
    const entry = join(repository, "scripts", "test-env");
    expect(statSync(entry).mode & 0o111).not.toBe(0);
    expect(readFileSync(entry, "utf8").split("\n")[0]).toBe("#!/bin/sh");
    const { scripts } = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
    expect(scripts["test:env"]).toBe("scripts/test-env create");
    expect(scripts["test:env:drop"]).toBe("scripts/test-env drop");
    // A plain launch, as a session runs it: the probe sees only the validated database.
    expect(ran(["run", "fixture", "--", "npm", "run", "--silent", "inspect"])).toEqual(guarded());
  });

  const preloads = [
    ["NODE_OPTIONS=--require", () => ({ NODE_OPTIONS: `--require=${fixture.file("preload.cjs")}` })],
    ["an npmrc named by npm_config_userconfig whose node-options preloads", () => ({ npm_config_userconfig: fixture.file("outer.npmrc") })],
    ["NPM_CONFIG_NODE_OPTIONS", () => ({ NPM_CONFIG_NODE_OPTIONS: `--require=${fixture.file("preload.cjs")}` })],
    ["a HOME whose .npmrc preloads", () => ({ HOME: fixture.poisonHome })]
  ];

  it.each(preloads)("DB-03: a parent's %s runs nothing before the helper refuses a bad name", (_label, poison) => {
    expect(refused(["create", "bad$name"], { env: poison() })).toMatch(/must match/u);
  });

  it.each(preloads)("DB-03: a parent's %s reaches neither the helper nor the command", (_label, poison) => {
    expect(ran(["run", "fixture", "--", "npm", "run", "--silent", "inspect"], { env: poison() })).toEqual(guarded());
  });

  it("refuses a direct start of the helper, which skips the boundary", () => {
    const before = connections;
    const result = spawnSync(process.execPath, [join(fixture.fixtureRoot, "scripts", "test-env.mjs"), "create", "fixture"], { env: base(), encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/start it through scripts\/test-env/u);
    expect(connections - before).toBe(0);
  });

  it.each([
    ["bash -ic", ["bash", "-ic"]],
    ["bash -lc", ["bash", "-lc"]],
    ["bash -c without --noprofile --norc", ["bash", "-c"]],
    ["bash --noprofile --norc -ic", ["bash", "--noprofile", "--norc", "-ic"]]
  ])("DB-04: refuses `run -- %s` with an inherited HOME whose .bashrc re-points the database", (_label, shell) => {
    refused(["run", "fixture", "--", ...shell, `node ${fixture.file("spawned.cjs")}`], { env: { HOME: fixture.poisonHome } });
  });

  it("refuses `run -- sh -i`", () => {
    expect(refused(["run", "fixture", "--", "sh", "-i"], { env: { HOME: fixture.poisonHome } })).toMatch(/sh -i: an interactive shell/u);
  });

  it("DB-04: a shell with --noprofile --norc gets the scratch HOME, and a shell inside it finds no rc file there", () => {
    const probe = `node ${fixture.file("probe.mjs")}`;
    expect(ran(["run", "fixture", "--", "bash", "--noprofile", "--norc", "-c", probe], { env: { HOME: fixture.poisonHome } })).toEqual(guarded());
    expect(ran(["run", "fixture", "--", "bash", "--noprofile", "--norc", "-c", `bash -ic '${probe}' 2>/dev/null`], { env: { HOME: fixture.poisonHome } })).toEqual(guarded());
  });

  it("DB-05: never runs an npm, @npmcli/config, node or utility from the caller's PATH", () => {
    const env = { PATH: `${join(fixture.evil, "bin")}${delimiter}${PATH}` };
    expect(ran(["run", "fixture", "--", "npm", "run", "--silent", "inspect"], { env })).toEqual(guarded());
    expect(refused(["create", "bad$name"], { env })).toMatch(/must match/u);
  });

  it("passes on only the allowlisted names the caller sets", () => {
    const env = { TERM: "xterm-r3", LANG: "C.UTF-8", R3_UNKNOWN: "x", DATABASE_URL: fixture.outside("parent"), PGHOST: "outside.example.test", BASH_ENV: fixture.file("spawned.cjs"), ENV: fixture.file("spawned.cjs") };
    const report = fixture.file("names.mjs");
    writeFileSync(report, "process.stdout.write(`\\nPROBE ${JSON.stringify({ names: Object.keys(process.env).sort(), TERM: process.env.TERM, LANG: process.env.LANG, DATABASE_URL: process.env.DATABASE_URL, PGHOST: process.env.PGHOST })}\\n`);");
    const seen = ran(["run", "fixture", "--", "node", report], { env });
    expect(seen).toMatchObject({ TERM: "xterm-r3", LANG: "C.UTF-8", PGHOST: "127.0.0.1" });
    expect(seen.DATABASE_URL).toMatch(/@127\.0\.0\.1:\d+\/jitm_design_fixture/u);
    for (const name of ["R3_UNKNOWN", "BASH_ENV", "ENV"]) expect(seen.names).not.toContain(name);
  });

  it("prints usage for no command and refuses an unknown one before anything is prepared", () => {
    const usage = launch([]);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toMatch(/scripts\/test-env create <name>/u);
    expect(launch(["list", "fixture"]).status).toBe(2);
    expect(existsSync(join(fixture.fixtureRoot, ".artifacts", "test-env", "jitm_design_list.home"))).toBe(false);
  });
});

describe("R3: the boundary config (scripts/test-env.config.json) and the docs", () => {
  const config = () => JSON.parse(readFileSync(helper.CONFIG_FILE, "utf8"));
  const docs = () => readFileSync(join(projectPaths().root, "docs", "LOCAL_TESTING.md"), "utf8");

  it.each(["PATH", "HOME", "Path", "BASH_ENV", "ENV"])("refuses %s in the allowlist", name => {
    const value = config();
    value.inherit.all = [...value.inherit.all, name];
    expect(() => helper.parseTestEnvConfig(value)).toThrow(/never inherits it/u);
  });

  it.each([
    ["a PATH that does not start with {bin}", value => { value.boundary.path = ["{standard}", "{bin}"]; }, /must start with \{bin\}/u],
    ["a relative PATH entry", value => { value.boundary.path = ["{bin}", "bin"]; }, /absolute folders/u],
    ["a HOME without the database", value => { value.boundary.home = ".artifacts/test-env/home"; }, /boundary\.home/u],
    ["a HOME outside the repository", value => { value.boundary.home = "../{database}.home"; }, /boundary\.home/u],
    ["a bin folder that is the env file", value => { value.boundary.bin = value.files.envFile; }, /different paths/u],
    ["an absolute node link", value => { value.boundary.node = "/usr/bin/node"; }, /boundary\.node/u],
    ["an npm outside the node installation", value => { value.boundary.npm = "/opt/npm"; }, /boundary\.npm/u],
    ["no shell options", value => { value.run.shellOptions = []; }, /run\.shellOptions/u],
    ["a shell given as a path", value => { value.run.shells = ["/bin/bash"]; }, /run\.shells/u]
  ])("refuses %s", (_label, change, message) => {
    const value = config();
    change(value);
    expect(() => helper.parseTestEnvConfig(value)).toThrow(message);
  });

  it("the launcher reads boundary.node as the config parser does", () => {
    const text = readFileSync(helper.CONFIG_FILE, "utf8");
    const lines = text.split("\n").filter(line => /^\s*"node"\s*:/u.test(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`"node":\\s*"${helper.testEnvConfig().boundary.node.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&")}",?$`, "u"));
  });

  it("docs/LOCAL_TESTING.md names the entry point, the trust boundary, every boundary path and the shell rule", () => {
    const text = docs();
    const parsed = helper.parseTestEnvConfig(config());
    for (const value of [parsed.boundary.node, parsed.boundary.npm, parsed.boundary.home, parsed.boundary.bin, ...parsed.run.shellOptions]) expect(text, value).toContain(`\`${value}\``);
    for (const phrase of ["scripts/test-env create", "scripts/test-env run", "scripts/test-env drop", "The trust boundary", "trusted, not hostile", "npm run test:env", "outside the boundary", "env -i", "getconf PATH", "bash -ic", "bash -lc", "sh -i"]) expect(text, phrase).toContain(phrase);
  });
});

// R4 (DB-06): run resolves the program to what it really is. A shell under any name or path, a
// script whose #! line starts one and a wrapper handed one are refused before any connection or
// child process, and every start of the entry point empties the scratch HOME and leaves only the
// toolchain links in its bin folder. The cases are built from the shells this machine has.
import { readdirSync } from "node:fs";

// The shells this machine has: each run.shells name on the standard path and each entry of the
// system's shell list, by real file. `interpreter` marks the ones whose real name is a shell name
// (tmux, which some systems list, is not), and only those are started on a helper without R4.
function presentShells() {
  const run = helper.testEnvConfig().run ?? {};
  const names = new Set([...(run.shells ?? []), "rbash", "busybox"]);
  const found = new Map();
  const add = path => {
    try {
      const real = realpathSync(path);
      if (statSync(real).isFile() && !found.has(real)) found.set(real, { real, path, name: path.split("/").pop(), interpreter: names.has(real.split("/").pop().replace(/-?\d[\d.]*$/u, "")) });
    } catch { /* not installed */ }
  };
  for (const name of names) for (const directory of standardPath.split(":").filter(Boolean)) add(join(directory, name));
  let list = "";
  try { list = readFileSync(run.shellsFile ?? "/etc/shells", "utf8"); } catch { /* no shell list */ }
  for (const line of list.split("\n")) if (line.trim() && !line.trim().startsWith("#")) add(line.trim());
  return [...found.values()];
}
const onStandardPath = name => (process.platform === "win32" ? null : helper.findOnPath(name, { PATH: standardPath }));
// Every path the system's shell list gives rbash (for example /bin/rbash and /usr/bin/rbash).
const rbashPaths = () => {
  let list = "";
  try { list = readFileSync(helper.testEnvConfig().run?.shellsFile ?? "/etc/shells", "utf8"); } catch { /* no shell list */ }
  return [...new Set([...list.split("\n").map(line => line.trim()).filter(line => line.endsWith("/rbash")), onStandardPath("rbash")].filter(Boolean))];
};

describe.skipIf(process.platform === "win32" || !onStandardPath("bash"))("R4: run refuses every shell identity, whatever it is called (DB-06), with no connection and no child process", () => {
  const file = envFilePath("jitm_design_fixture", root);
  let work;
  const shells = presentShells();
  const bash = () => realpathSync(onStandardPath("bash"));
  const env = () => onStandardPath("env");
  const at = name => join(work, name);
  const command = "node -e 0";

  beforeAll(() => {
    work = realpathSync(mkdtempSync(join(tmpdir(), "jitm-test-env-r4-")));
    mkdirSync(at("aliases"), { recursive: true });
    symlinkSync(bash(), at("aliases/notashell"));
    shells.forEach((shell, index) => symlinkSync(shell.real, at(`aliases/program-${index}`)));
    copyFileSync(bash(), at("copied-tool"));
    chmodSync(at("copied-tool"), 0o755);
    const scripts = {
      "rbash-script": `#!${rbashPaths()[0] ?? bash()} -i\nnode -e 0\n`,
      "env-bash-script": `#!${env()} bash\nnode -e 0\n`,
      "headerless-script": "node -e 0\n",
      "node-script.mjs": `#!${env()} node\nprocess.exit(0);\n`
    };
    for (const [name, text] of Object.entries(scripts)) {
      writeFileSync(at(name), text);
      chmodSync(at(name), 0o755);
    }
  });
  afterAll(() => { if (work) rmSync(work, { recursive: true, force: true }); });

  const attempt = async argv => {
    const run = harness({ files: { [file]: await envFileFor() } });
    const code = await main(["run", "fixture", "--", ...argv], run.dependencies);
    return { code, run };
  };
  const refusedHere = async argv => {
    const { code, run } = await attempt(argv);
    expect(code, run.errors()).toBe(1);
    expect(run.errors()).toMatch(/test-env refused/u);
    expect(run.dependencies.spawn).not.toHaveBeenCalled();
    expect(run.dependencies.connect).not.toHaveBeenCalled();
    return run.errors();
  };

  it.each([
    ["rbash -ic", () => ["rbash", "-ic", command]],
    ["rbash -lc", () => ["rbash", "-lc", command]],
    ["rbash -c", () => ["rbash", "-c", command]]
  ])("refuses `%s`", async (_label, argv) => {
    if (!onStandardPath("rbash")) return;
    expect(await refusedHere(argv())).toMatch(/rbash/u);
  });

  it("refuses rbash by every path the system's shell list gives it", async () => {
    expect(rbashPaths().length).toBeGreaterThan(0);
    for (const path of rbashPaths()) expect(await refusedHere([path, "-ic", command])).toMatch(/rbash -ic/u);
  });

  it("refuses a link to bash under another name, but starts it in the documented form", async () => {
    expect(await refusedHere([at("aliases/notashell"), "-ic", command])).toMatch(/notashell \(bash, .*\) -ic: an interactive shell/u);
    expect(await refusedHere([at("aliases/notashell"), "-c", command])).toMatch(/without --noprofile --norc/u);
    const { code, run } = await attempt([at("aliases/notashell"), "--noprofile", "--norc", "-c", command]);
    expect(code, run.errors()).toBe(0);
    expect(run.dependencies.spawn).toHaveBeenCalledTimes(1);
  });

  it("refuses a copy of bash under another name", async () => {
    expect(await refusedHere([at("copied-tool"), "-ic", command])).toMatch(/copied-tool \(bash, .*\) -ic/u);
  });

  it("refuses each shell this machine has, called through a link under another name", async () => {
    expect(shells.length).toBeGreaterThan(0);
    for (const [index, shell] of shells.entries()) expect(await refusedHere([at(`aliases/program-${index}`), "-c", command]), shell.path).toMatch(/program-\d+ \(/u);
  });

  it("refuses busybox's shell", async () => {
    if (!onStandardPath("busybox")) return;
    expect(await refusedHere(["busybox", "sh", "-c", command])).toMatch(/busybox/u);
  });

  it.each([
    ["env bash -c", () => [env(), "bash", "-c", command]],
    ["env -i rbash -ic", () => ["env", "-i", "rbash", "-ic", command]],
    ["env -S 'bash -ic …'", () => ["env", "-S", `bash -ic '${command}'`]],
    ["env -Sbash", () => ["env", "-Sbash"]],
    ["env PATH=<folder> <alias of bash> -ic", () => ["env", `PATH=${at("aliases")}`, "notashell", "-ic", command]],
    ["env --chdir=<folder> ./<alias of bash> -c", () => ["env", `--chdir=${at("aliases")}`, "./notashell", "-c", command]],
    ["env -S with a variable", () => ["env", "-S", "${SHELL} -i"]],
    ["nice bash -c", () => ["nice", "bash", "-c", command]],
    ["timeout 5 rbash -ic", () => ["timeout", "5", "rbash", "-ic", command]]
  ])("refuses the wrapper `%s`", async (_label, argv) => {
    const [program] = argv();
    if (!program.includes("/") && !onStandardPath(program)) return;
    expect(await refusedHere(argv())).toMatch(/wrapper/u);
  });

  it("still starts a wrapper that is handed no shell, and npm, whose #! line names env", async () => {
    expect(await refusedHere(["env", "bash", "-c", command])).toMatch(/env would start bash/u);
    for (const argv of [["env", "FOO=1", "npm", "test"], ["npm", "test"], [at("node-script.mjs")]]) {
      const { code, run } = await attempt(argv);
      expect(code, run.errors()).toBe(0);
      expect(run.dependencies.spawn).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["a #! line that starts an interactive rbash", "rbash-script", /#! line \(#!.*-i\) starts/u],
    ["#!/usr/bin/env bash", "env-bash-script", /#! line \(#!.* bash\) runs env, which would start bash/u],
    ["a text file with no #! line, which exec runs with /bin/sh", "headerless-script", /no #! line, so exec runs it with/u]
  ])("refuses a script with %s", async (_label, name, message) => {
    expect(await refusedHere([at(name)])).toMatch(message);
  });

  it("refuses a program it cannot find on the child's PATH, such as the shell builtin exec", async () => {
    expect(await refusedHere(["exec", "bash", "-ic", command])).toMatch(/cannot find exec on the child's PATH/u);
  });
});

// Through the entry point itself, as the QA reproduced DB-06: an owned HOME whose .bashrc re-points
// DATABASE_URL, then each shell form. A connection would reach the counting server; a child, the
// rc file or a planted tool would write to the marker.
describe.skipIf(process.platform === "win32" || spawnSync("bash", ["--noprofile", "--norc", "-c", "true"]).status !== 0)("R4: through scripts/test-env, no shell identity starts and nothing persists in the owned folders (DB-06)", () => {
  let connections = 0;
  const server = net.createServer(socket => { connections += 1; socket.destroy(); });
  const fixture = r3Fixture("jitm-test-env-r4-launcher-");
  const launcher = () => join(fixture.fixtureRoot, "scripts", "test-env");
  const guarded = () => ({ host: "127.0.0.1", database: "jitm_design_fixture", recovery: "", nodeOptions: "", home: fixture.boundary.home, connections: 0 });
  const PATH = process.env.PATH ?? "";
  const base = () => ({ PATH, HOME: fixture.file("parent-home"), ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) });
  const shells = presentShells().filter(shell => shell.interpreter);
  const spawned = () => `node ${fixture.file("spawned.cjs")}`;
  // The rc the QA planted: it re-points the database and leaves a marker when a shell reads it.
  const plantRc = () => {
    const home = fixture.boundary.home;
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const rc = `echo rc >> '${fixture.marker}'\nexport DATABASE_URL='${fixture.outside("owned_rc")}'\nprintf 'OWNED_RC_LOADED\\n'\n`;
    for (const name of [".bashrc", ".bash_profile", ".profile"]) writeFileSync(join(home, name), rc);
    writeFileSync(join(home, "left-over.txt"), "from an earlier run\n");
  };

  beforeAll(async () => {
    await new Promise(resolvePromise => server.listen(0, "127.0.0.1", resolvePromise));
    const { port: serverPort } = server.address();
    await fixture.setup({ copyScripts: true, ciText: ciFixture({ url: `postgresql://${role}:${secret}@localhost:${serverPort}/jitm_design_fixture?schema=public`, ports: [`${serverPort}:5432`] }) });
    mkdirSync(fixture.file("parent-home"), { recursive: true });
    mkdirSync(fixture.file("aliases"), { recursive: true });
    symlinkSync(realpathSync(onStandardPath("bash")), fixture.file("aliases/notashell"));
    shells.forEach((shell, index) => symlinkSync(shell.real, fixture.file(`aliases/program-${index}`)));
  });
  afterAll(async () => {
    if (server.listening) await new Promise(resolvePromise => server.close(resolvePromise));
    fixture.cleanup();
  });
  beforeEach(() => writeFileSync(fixture.marker, ""));

  const launch = (args, { env = {}, cwd = fixture.project, entry = launcher() } = {}) => spawnSync(entry, args, { cwd, env: { ...base(), ...env }, encoding: "utf8", timeout: 120_000 });
  function refused(args) {
    const before = connections;
    const result = launch(args);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/test-env refused/u);
    expect(result.stdout).not.toContain("OWNED_RC_LOADED");
    expect(fixture.markers()).toEqual([]);
    expect(connections - before).toBe(0);
    return result.stderr;
  }
  function ran(args) {
    const before = connections;
    const result = launch(args);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("OWNED_RC_LOADED");
    expect(fixture.markers()).toEqual([]);
    expect(connections - before).toBe(0);
    return result.stdout;
  }

  const reproduction = [
    ["rbash -ic", () => ["rbash", "-ic"]],
    ["rbash -lc", () => ["rbash", "-lc"]],
    ["rbash -c", () => ["rbash", "-c"]],
    ...rbashPaths().map(path => [`${path} -ic`, () => [path, "-ic"]]),
    ["a link to bash under another name, -ic", () => [fixture.file("aliases/notashell"), "-ic"]],
    ["a link to bash under another name, -c", () => [fixture.file("aliases/notashell"), "-c"]],
    ["env bash -c", () => ["env", "bash", "-c"]],
    ["env -i rbash -ic", () => ["env", "-i", "rbash", "-ic"]],
    ...(onStandardPath("busybox") ? [["busybox sh -c", () => ["busybox", "sh", "-c"]]] : []),
    ...shells.map((shell, index) => [`${shell.path} through a link under another name, -c`, () => [fixture.file(`aliases/program-${index}`), "-c"]])
  ];

  it.each(reproduction)("refuses `run -- %s` with an owned HOME whose .bashrc re-points the database", (_label, form) => {
    plantRc();
    refused(["run", "fixture", "--", ...form(), spawned()]);
  });

  it("empties the owned HOME at every start, so a planted rc is gone and a shell inside finds none", () => {
    const report = fixture.file("home-report.mjs");
    writeFileSync(report, "import { readdirSync } from 'node:fs';\nprocess.stdout.write(`\\nPROBE ${JSON.stringify({ home: process.env.HOME, entries: readdirSync(process.env.HOME).sort() })}\\n`);\n");
    plantRc();
    expect(fixture.probe(ran(["run", "fixture", "--", "node", report]))).toEqual({ home: fixture.boundary.home, entries: [] });
    plantRc();
    const probe = `node ${fixture.file("probe.mjs")}`;
    expect(fixture.probe(ran(["run", "fixture", "--", "bash", "--noprofile", "--norc", "-c", `bash -ic '${probe}' 2>/dev/null`]))).toEqual(guarded());
  });

  it("leaves only node, npm and npx in the toolchain folder at every start, so a planted sh never runs npm's scripts", () => {
    const bin = fixture.boundary.bin;
    const sh = realpathSync(onStandardPath("sh"));
    writeFileSync(join(bin, "sh"), `#!${sh}\necho 'planted sh' >> '${fixture.marker}'\nexport DATABASE_URL='${fixture.outside("planted_sh")}'\nexec ${sh} "$@"\n`);
    chmodSync(join(bin, "sh"), 0o755);
    expect(fixture.probe(ran(["run", "fixture", "--", "npm", "run", "--silent", "inspect"]))).toEqual(guarded());
    expect(readdirSync(bin).sort()).toEqual(["node", "npm", "npx"]);
  });

  it("refuses to start before the bootstrap: npm ci runs once, before the entry point", () => {
    const bare = fixture.file("bare-repo");
    mkdirSync(join(bare, "scripts"), { recursive: true });
    for (const name of ["test-env", "test-env.mjs", "test-env.config.json"]) copyFileSync(join(fixture.fixtureRoot, "scripts", name), join(bare, "scripts", name));
    chmodSync(join(bare, "scripts", "test-env"), 0o755);
    const before = connections;
    const result = launch(["create", "fixture"], { entry: join(bare, "scripts", "test-env") });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/test-env refused: .*node_modules is missing: run npm ci once first, before the entry point/u);
    expect(connections - before).toBe(0);
    expect(existsSync(join(bare, ".artifacts"))).toBe(false);
  });
});

describe("R4: the shell identities, wrappers and bootstrap in the config and the docs", () => {
  const config = () => JSON.parse(readFileSync(helper.CONFIG_FILE, "utf8"));
  const docs = () => readFileSync(join(projectPaths().root, "docs", "LOCAL_TESTING.md"), "utf8");

  it("names rbash and busybox as shells, the system's shell list, the fallback shell and the wrappers", () => {
    const { run } = helper.parseTestEnvConfig(config());
    expect(run.shells).toEqual(expect.arrayContaining(["sh", "bash", "rbash", "dash", "zsh", "ksh", "mksh", "busybox"]));
    expect(run.shellsFile).toMatch(/^\//u);
    expect(run.fallbackShell).toMatch(/^\//u);
    expect(run.wrappers).toEqual(expect.arrayContaining(["env", "exec", "nice", "timeout", "xargs"]));
  });

  it.each([
    ["no wrappers", value => { value.run.wrappers = []; }, /run\.wrappers/u],
    ["a wrapper given as a path", value => { value.run.wrappers = ["/usr/bin/env"]; }, /run\.wrappers/u],
    ["a relative fallback shell", value => { value.run.fallbackShell = "sh"; }, /run\.fallbackShell/u],
    ["a relative shell list", value => { value.run.shellsFile = "etc/shells"; }, /run\.shellsFile/u]
  ])("refuses %s", (_label, change, message) => {
    const value = config();
    change(value);
    expect(() => helper.parseTestEnvConfig(value)).toThrow(message);
  });

  it("docs/LOCAL_TESTING.md names the bootstrap, the acceptance order, the shell identities, the wrappers and the empty HOME", () => {
    const text = docs();
    const { run } = helper.parseTestEnvConfig(config());
    for (const value of [run.shellsFile, run.fallbackShell, "run.shellsFile", "run.fallbackShell", "run.wrappers", "rbash", "busybox", "env bash -c", "#!/usr/bin/env bash"]) expect(text, value).toContain(`${value}`);
    for (const phrase of ["### Bootstrap", "`npm ci` is a bootstrap step", "never through the entry point", "The acceptance order", "What counts as a shell", "byte-for-byte copy", "A wrapper handed a shell", "Why the shell form stays", "empty again at every start"]) expect(text, phrase).toContain(phrase);
  });
});
