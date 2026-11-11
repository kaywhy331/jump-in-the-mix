import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
function harness({ ci = ciFixture(), example = exampleFixture(), env = {}, files = {}, exists = false, spawnCode = 0 } = {}) {
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
  const environment = buildEnvironment({ exampleText: exampleFixture(), ci, database, envFile: envFilePath(database, root) });
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
    expect(env).toMatchObject({ PATH: "/usr/bin", HOME: "/home/fixture", DATABASE_URL: goodUrl(), RECOVERY_TEST_DATABASE_URL: "", PGHOST: "127.0.0.1", PGSERVICE: "", BACKUP_DATABASE_URL: "" });
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

  beforeAll(async () => {
    writeFileSync(poisonFile, `DATABASE_URL=${outside("jitm")}\nRECOVERY_TEST_DATABASE_URL=${outside("recovery")}\n`);
    writeFileSync(optInFile, `RECOVERY_TEST_DATABASE_URL=${outside("recovery_opt_in")}\n`);
    writeFileSync(optInPreload, `process.env.RECOVERY_TEST_DATABASE_URL = ${JSON.stringify(outside("recovery_preload"))};\n`);
    mkdirSync(childDirectory);
    writeFileSync(join(childDirectory, ".env"), `DATABASE_URL=${outside("dotenv_cwd")}\nRECOVERY_TEST_DATABASE_URL=${outside("recovery_cwd")}\nDOTENV_CONFIG_OVERRIDE=true\n`);
    const ci = await readCiConfiguration(ciText);
    const environment = buildEnvironment({ exampleText: exampleFixture(), ci, database: "jitm_design_fixture", envFile });
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
