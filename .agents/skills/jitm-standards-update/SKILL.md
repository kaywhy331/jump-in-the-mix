---
name: jitm-standards-update
description: Record a Jump in the Mix owner decision or fix a standard — find the rule's one home, edit and tag it, bump the version and changelog, update dependent skills, workflows and the AGENTS.md router, and run the standards check. Use when Kevin decides, changes or clarifies anything about product behavior, design, voice, vocabulary, workflow or process, or when a standard is missing, wrong or conflicting.
---

# Jump in the Mix — standards update

Follow **WF-08** (`docs/standards/workflows/WF-08-standards-amendment.md`). The amendment and versioning rules are in JITM-17 §2. The precedence rules are in JITM-00 §2.

## Checklist

1. **Capture the decision.**
   - Write down the date, a short quote of Kevin's words, and the context.
   - Add it to the owner decision record, or to the dated record for the task (JITM-15 §2).
2. **Find the rule's home.** Use the "Governs" column in `docs/standards/README.md`. A topic lives in exactly one standard (JITM-00 §2.15).
3. **Edit the home rule.**
   - Tag it `[OWNER <date> <ref>]` only for Kevin's decision; otherwise `[PROPOSED]`, `[SOURCE …]` or `[SHIPPED …]` (JITM-15 §2.11, §2.12).
   - Give a new rule the next free number, even when it sits out of numeric order.
   - Never renumber a rule. A retired rule keeps its number and points to its replacement (JITM-17 §2.16).
4. **Version the standard.**
   - Bump the version: major when a rule is removed or its meaning changes, minor when a rule is added, patch for clarifications.
   - Update `last_reviewed`.
   - Add a changelog line (JITM-17 §2.2, JITM-17 §2.3).
5. **Update the dependents in the same pull request:**
   - skills in `.agents/skills/` (never in `.claude/skills`, which is a symlink);
   - workflows;
   - the routing table in `AGENTS.md`;
   - the PR template;
   - banners on superseded documents.
6. **Split out product changes.** If the decision changes shipped behavior or copy, open a separate task for the product change unless Kevin asked for both together (a feature Kevin approved under WF-04 counts as both together).
7. **Run `npm run standards:check` and fix what it reports.**
8. **Open the pull request** with the decision quoted. Kevin merges.

## Must-know rules

- Kevin decides product behavior, pricing, access, customer promises, vocabulary and brand. Agents propose (JITM-00 §2.11).
- A `[PROPOSED]` rule is the default until Kevin decides otherwise (JITM-17 §2.5).
- Skill frontmatter holds only `name` and `description` (JITM-16 §2.19).
- The `AGENTS.md` router stays short. The Next.js block stays first and unchanged (JITM-16 §2.18).

## Stop and ask Kevin when

- The decision conflicts with JITM-00.
- The decision is ambiguous.
- The change would require removing or renumbering rules that other documents cite.
