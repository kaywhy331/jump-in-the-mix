import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as engine from "@prisma/prisma-schema-wasm";

export function schemaRelease(root = process.cwd()) {
  const schemaFiles = readdirSync(resolve(root, "prisma")).filter(name => name.endsWith(".prisma")).sort().map(name => [`prisma/${name}`, readFileSync(resolve(root, "prisma", name), "utf8")]);
  const data = JSON.parse(engine.get_dmmf(JSON.stringify({ prismaSchema: schemaFiles, noColor: true }))).datamodel;
  const types = { String: "text", Int: "int4", BigInt: "int8", Float: "float8", Decimal: "numeric", Boolean: "bool", DateTime: "timestamp", Json: "jsonb", Bytes: "bytea" };
  const native = { Date: "date", Text: "text", VarChar: "varchar", Char: "bpchar", Uuid: "uuid", SmallInt: "int2", Integer: "int4", BigInt: "int8", Real: "float4", DoublePrecision: "float8", Decimal: "numeric", Boolean: "bool", Timestamp: "timestamp", Timestamptz: "timestamptz", Time: "time", Timetz: "timetz", Json: "json", JsonB: "jsonb", ByteA: "bytea" };
  const enumNames = new Map(data.enums.map(item => [item.name, item.dbName ?? item.name]));
  const columns = data.models.flatMap(model => model.fields.filter(field => field.kind !== "object").map(field => {
    const type = field.kind === "enum" ? enumNames.get(field.type) : field.nativeType ? native[field.nativeType[0]] : types[field.type];
    if (!type) throw new Error(`Unsupported schema release type: ${model.name}.${field.name}`);
    return { table: model.dbName ?? model.name, column: field.dbName ?? field.name, type, list: field.isList, enum: field.kind === "enum" };
  }));
  const enums = data.enums.flatMap(item => item.values.map(value => ({ type: item.dbName ?? item.name, value: value.dbName ?? value.name })));
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort().map(name => ({ name, checksum: createHash("sha256").update(readFileSync(resolve(root, "prisma/migrations", name, "migration.sql"))).digest("hex") }));
  if (!migrations.length || !columns.length) throw new Error("A schema release must include migrations and model columns.");
  return { migrations, columns, enums };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = schemaRelease();
  mkdirSync("src/generated", { recursive: true });
  const target = "src/generated/schema-release.ts", temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `// Generated from the committed schema and migrations. Do not edit.\nexport const schemaRelease = ${JSON.stringify(release)};\n`);
  renameSync(temporary, target);
  console.log(`Schema release prepared: ${release.migrations.length} migrations, ${new Set(release.columns.map(column => column.table)).size} models.`);
}
