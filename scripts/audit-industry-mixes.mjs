// Read-only source audit. --write updates the derived analysis, never the source library or database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const sourcePaths = ["docs/mixes/master_library.md", "docs/mixes/master_library.html", "docs/mixes/mix_and_beat_index.md"];
const [master, html, index] = await Promise.all(sourcePaths.map(path => readFile(new URL(path, root), "utf8")));
const target = new URL("docs/INDUSTRY_MIX_AUDIT_2026-09-17.json", root);
const unique = values => [...new Set(values)].sort();
const matches = (text, pattern) => [...text.matchAll(pattern)];
const keys = text => unique(matches(text, /\{\{contact\.custom\.([a-z0-9_]+)\}\}/g).map(match => match[1]));
const blanks = text => unique(matches(text, /\[([^\[\]\n]+)\]/g).map(match => match[1]));
const list = text => unique(matches(text, /`([^`]+)`/g).map(match => match[1]));
const lineAt = offset => master.slice(0, offset).split("\n").length;
const meta = (text, name) => text.match(new RegExp(`^\\*\\*${name}:\\*\\* (.+)$`, "m"))?.[1].trim() ?? null;
const copyBlocks = text => matches(text, /```text\n([\s\S]*?)\n```/g).map(match => match[1]);
const decode = text => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|#x27);/gi, (_, entity) => {
  if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)));
  return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity];
});

const industryTitles = {
  RE: "Residential real estate",
  CO: "Operations consulting and fractional leadership",
  PH: "Wedding and portrait photography",
  CT: "Contractor and construction",
  RC: "Independent permanent-placement recruiting"
};
const fieldSectionStart = master.indexOf("# Contact-field definitions\n");
assert(fieldSectionStart > 0, "Missing field definitions");
const fieldSection = master.slice(fieldSectionStart, master.indexOf("# Source notes\n"));
const fieldHeadings = matches(fieldSection, /^\*\*([^*\n]+) \/ ([^*\n]+)\*\* — `([^`]+)`/gm);
const fields = fieldHeadings.map((match, i) => {
  const text = fieldSection.slice(match.index, fieldHeadings[i + 1]?.index ?? fieldSection.length);
  const scope = text.match(/Outbound use: (True|False)\. Scope: ([a-z_]+)\./);
  assert(scope, `Missing scope: ${match[2]}`);
  return {
    group: match[1], name: match[2], key: keys(match[3])[0] ?? null,
    sourceLine: lineAt(fieldSectionStart + match.index),
    outbound: scope[1] === "True", scope: scope[2],
    example: text.match(/^Example: (.+)$/m)?.[1] ?? null,
    guidance: text.split("\n\n")[2]?.trim() ?? null
  };
});
const fieldKeys = fields.filter(field => field.key).map(field => field.key);
assert.equal(unique(fieldKeys).length, fieldKeys.length, "Duplicate field definitions");

const mixHeadings = matches(master.slice(0, fieldSectionStart), /^## ([A-Z]{2}\d{2}) — (.+)$/gm);
const mixes = mixHeadings.map((match, i) => {
  const section = master.slice(match.index, mixHeadings[i + 1]?.index ?? fieldSectionStart).split(/^# /m)[0];
  const beatHeadings = matches(section, /^### ([A-Z]{2}\d{2}-B\d{2}) — (.+)$/gm);
  const offeredKeys = list(meta(section, "Contact fields to offer") ?? "");
  const beats = beatHeadings.map((beat, j) => {
    assert.equal(beat[1], `${match[1]}-B${String(j + 1).padStart(2, "0")}`, "Nonsequential beat ID");
    const body = section.slice(beat.index, beatHeadings[j + 1]?.index ?? section.length);
    const copies = copyBlocks(body);
    const subjects = matches(body, /^\*\*Subject:\*\* (.+)$/gm).map(row => row[1]);
    const voicemail = body.match(/\*\*Voicemail for an unanswered call, not an extra Beat:\*\*\n\n([^\n]+)/)?.[1] ?? "";
    const messageContent = [...copies, ...subjects, voicemail].join("\n");
    const declaredBlanks = list(meta(body, "Per-Beat authoring blanks") ?? "");
    const messageBlanks = blanks(messageContent);
    assert(messageBlanks.every(key => declaredBlanks.includes(key)), `Unlisted blanks: ${beat[1]}`);
    const usedKeys = keys(messageContent);
    assert.deepEqual(keys(body), usedKeys, `Custom token exists outside copy: ${beat[1]}`);
    assert.deepEqual(list(meta(body, "Fields used across alternatives") ?? ""), usedKeys, `Field list mismatch: ${beat[1]}`);
    const variants = matches(body, /^#### ((?:Primary|Alternative) — .+)$/gm).map(row => row[1]);
    const minimumContextAlternative = body.includes("#### Primary-channel alternative when optional custom details are missing");
    assert.equal(copies.length, variants.length + Number(minimumContextAlternative), `Unaccounted copy: ${beat[1]}`);
    return {
      id: beat[1], title: beat[2], sourceLine: lineAt(match.index + beat.index),
      timing: meta(body, "When"), primary: meta(body, "Primary"), fallback: meta(body, "Fallback"),
      review: meta(body, "Review first"), factualGates: meta(body, "Additional factual gates"),
      variants, minimumContextAlternative, customKeys: usedKeys,
      messageBlanks, declaredBlanks,
      documentHandoff: meta(body, "Primary").includes("†")
    };
  });
  const usedKeys = unique(beats.flatMap(beat => beat.customKeys));
  assert([...usedKeys, ...offeredKeys].every(key => fieldKeys.includes(key)), `Undefined custom field: ${match[1]}`);
  const indexHeading = index.match(new RegExp(`^### ${match[1]} — (.+)$`, "m"));
  assert.equal(indexHeading?.[1], match[2], `Index title mismatch: ${match[1]}`);
  const indexBody = index.slice(indexHeading.index).split(/\n### |\n## /)[0];
  const rows = matches(indexBody, /^\| (\d+) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/gm);
  assert.equal(rows.length, beats.length, `Index beat count mismatch: ${match[1]}`);
  rows.forEach((row, j) => assert.deepEqual(row.slice(1), [String(j + 1), beats[j].timing, beats[j].title, beats[j].primary, beats[j].fallback], `Index timing/content mismatch: ${beats[j].id}`));
  return {
    id: match[1], title: match[2], industry: industryTitles[match[1].slice(0, 2)], sourceLine: lineAt(match.index),
    recipient: meta(section, "Recipient"), start: meta(section, "Start"), objective: meta(section, "Objective"),
    verifiedInputs: meta(section, "Keep as verified input"), stopChange: meta(section, "Stop/change"), repeat: meta(section, "Repeat policy"),
    offeredKeys, usedKeys, usedButNotOffered: usedKeys.filter(key => !offeredKeys.includes(key)),
    offeredButNotInCopy: offeredKeys.filter(key => !usedKeys.includes(key)), beats
  };
});

const allBeats = mixes.flatMap(mix => mix.beats);
const allCopy = copyBlocks(master);
const htmlCopy = matches(html, /<pre\b[^>]*>([\s\S]*?)<\/pre>/g).map(match => decode(match[1]));
assert.deepEqual(htmlCopy, allCopy, "HTML and Markdown message copy differ");
assert.equal(matches(html, /<article\b/g).length, mixes.length, "HTML mix count mismatch");
assert.equal(matches(html, /<section\b/g).length, allBeats.length, "HTML beat count mismatch");
const summary = {
  mixes: mixes.length, beats: allBeats.length,
  channelVersions: allBeats.reduce((sum, beat) => sum + beat.variants.length, 0),
  minimumContextAlternatives: allBeats.filter(beat => beat.minimumContextAlternative).length,
  messageCopies: allCopy.length,
  fieldDefinitions: fields.length, outboundDefinitions: fieldKeys.length,
  internalControls: fields.filter(field => !field.outbound).length,
  customKeysUsedInCopy: unique(allBeats.flatMap(beat => beat.customKeys)).length,
  declaredAuthoringBlanks: unique(allBeats.flatMap(beat => beat.declaredBlanks)).length,
  authoringBlanksInCopy: unique(allBeats.flatMap(beat => beat.messageBlanks)).length,
  documentHandoffBeats: allBeats.filter(beat => beat.documentHandoff).length,
  mixFieldOfferOmissions: mixes.filter(mix => mix.usedButNotOffered.length).map(mix => ({ id: mix.id, keys: mix.usedButNotOffered }))
};
assert.equal(summary.mixes, 40);
assert.equal(summary.beats, 137);
assert.equal(summary.channelVersions, 412);
assert.equal(summary.minimumContextAlternatives, 15);
const output = {
  status: "analysis_only_not_runtime_catalog",
  sourceVersion: master.match(/^Version (\S+)/m)?.[1],
  sources: sourcePaths.map((path, i) => ({ path, sha256: createHash("sha256").update([master, html, index][i]).digest("hex") })),
  verification: { htmlAndMarkdownMessageCopiesIdentical: true, indexBeatTimingAndChannelsMatch: true, allReferencedCustomKeysDefined: true },
  summary,
  industries: Object.entries(industryTitles).map(([prefix, title]) => {
    const rows = mixes.filter(mix => mix.id.startsWith(prefix));
    return { prefix, title, mixes: rows.length, beats: rows.reduce((sum, mix) => sum + mix.beats.length, 0), outboundFieldDefinitions: fields.filter(field => field.group === prefix && field.outbound).length, usedKeys: unique(rows.flatMap(mix => mix.usedKeys)) };
  }),
  fields,
  declaredAuthoringBlanksNotInMessageCopy: unique(allBeats.flatMap(beat => beat.declaredBlanks)).filter(key => !allBeats.some(beat => beat.messageBlanks.includes(key))),
  mixes
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
const flag = process.argv[2];
assert(!flag || flag === "--write" || flag === "--check", "Use --write, --check, or no argument");
if (flag === "--write") await writeFile(target, serialized);
if (flag === "--check") assert.equal(await readFile(target, "utf8"), serialized, "Derived audit is stale; run --write");
console.log(JSON.stringify({ ...summary, sourceChecks: "passed", artifact: flag ? fileURLToPath(target) : null }, null, 2));
