import fs from 'node:fs';
const base='docs/ui-ux-audit-2026-09-18';
const data=JSON.parse(fs.readFileSync(`${base}/implementation-status.json`));
const original=JSON.parse(fs.readFileSync(`${base}/findings.json`)).areas.flatMap(a=>a.findings);
if(data.findings.length!==original.length||new Set(data.findings.map(f=>f.id)).size!==original.length)throw Error('Checklist coverage mismatch');
const originalIds=new Set(original.map(f=>f.id));
if(data.findings.some(f=>!originalIds.has(f.id)))throw Error('Checklist contains an unknown finding');
const counts=data.findings.reduce((counts,f)=>(counts[f.status]=(counts[f.status]??0)+1,counts),{});
let report='# UI/UX implementation checklist\n\n**Definition of done:** '+data.definitionOfDone+'\n\nOriginal audit: [184 findings](../UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md). Implementation and evidence are tracked separately; original observations remain unchanged.\n\nStatus counts: '+Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(' · ')+'.\n\n';
if(data.release)report+=`Live implementation: [Jump in the Mix](${data.release.url}), revision \`${data.release.commit}\`, verified ${data.release.verifiedAt}. [Release evidence](../UI_UX_IMPLEMENTATION_2026-09-18.md).\n\n`;
report+='Unchecked findings require the observations listed in the [qualification worksheet](REMAINING_QUALIFICATION.md).\n\n';
for(const phase of data.phases)report+=`- ${phase}\n`;
let area='';for(const f of data.findings){if(f.area!==area){area=f.area;report+=`\n## ${area}\n\n`;}if(f.status==='complete'&&(!f.verification.length||!f.liveEvidence))throw Error(`Missing completion evidence: ${f.id}`);report+=`- [${f.status==='complete'?'x':' '}] **${f.id} — ${f.title}** · ${f.status}\n`;if(f.implementation.length)report+=`  Implementation: ${f.implementation.join('; ')}.\n`;if(f.verification.length)report+=`  Verification: ${f.verification.join('; ')}.\n`;report+=`  Acceptance: ${f.acceptance}\n`;if(f.remaining&&f.status!=='complete')report+=`  Still required: ${f.remaining}\n`;}
fs.writeFileSync(`${base}/IMPLEMENTATION_CHECKLIST.md`,report);console.log(JSON.stringify(counts));
