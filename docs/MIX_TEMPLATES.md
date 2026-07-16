# Mix Templates

Jump in the Mix provides two reviewed libraries of complete Mixes:

- **Jump in the Mix templates** are official platform snapshots created and maintained by platform administrators.
- **Community templates** are user-contributed Mix snapshots that become visible only after moderation approval.

A template contains only reusable Mix metadata and prepared Jump content. It never contains Contacts, Groups, assignment lists, completed Jumps, private workspace records, or provider credentials.

## User workflow

1. Open **Settings → Mix Templates** or **Mixes → Browse Templates**.
2. Choose the Jump in the Mix or Community library.
3. Search by outcome or phrase, and optionally filter by Category and Industry.
4. Read the human-readable sequence preview, including channel, relative timing, subject, and prepared content.
5. Select **Import Draft**.
6. Review the independent Draft Mix, choose its audience, and complete any required schedule before activation.

Imports are intentionally Drafts. A template cannot silently activate outreach or inherit a contributor's Contact audience.

Repeated imports are allowed only after an explicit confirmation. Each import is independent and stores the template version that was used.

## Import compatibility and validation

The normalizer accepts the canonical Jump array as well as older payload shapes that use `steps`, `jumps`, `sequence`, or `content`. Channel aliases such as `text`, `phone`, and `ringless_voicemail` are mapped into supported application channels.

Before an import begins, the application validates:

- at least one Jump and at most 50 Jumps;
- supported channels;
- required email subject/body, message body, or call/voicemail script;
- day offsets and optional time-of-day values;
- approved dynamic placeholders;
- Private Notes only in Phone Call scripts;
- the importing workspace's active custom Jump Date Type allowance.

The Mix, reusable Jump templates and versions, Mix sequence rows, import record, version record, import counter, and audit record are written in one database transaction. A validation or database failure rolls the entire import back.

## Community contributor profile

Community sharing requires an enabled **Community Public Profile** with a display name. Optional public fields are:

- display title;
- short bio, limited to 500 characters;
- HTTPS profile image URL;
- HTTPS public website.

Private account email, billing information, Contacts, and workspace data are not shown. Updating the profile changes its display beside every Community contribution without rewriting template snapshots.

## Sharing limits

Community submission limits are enforced server-side:

| Plan | Pending, approved, or flagged Community Mixes |
|---|---:|
| Free | 0 |
| Plus | 3 |
| Pro | 10 |

Unpublishing a template frees a slot without deleting the user's source Mix or any previously imported copies.

Submitting an update creates a new template version and returns the contribution to the moderation queue. The source Mix remains fully independent from the snapshot after submission.

## Voting and trending

A workspace may cast at most one vote per approved Mix Template and may remove that vote. Publishers cannot vote for their own contributions.

Trending order combines:

- votes;
- imports;
- recent publication activity.

The public library also supports Featured, Most Imported, and Newest ordering. Administrators explicitly feature templates; popularity alone never bypasses moderation.

## Administrator workflow

Open **Admin → Mix Templates** to:

- search platform and Community templates;
- filter by source and review state;
- create an official template from a tested administrator-workspace Mix;
- review contributor profile details and public website;
- preview the exact human-readable sequence;
- approve, flag, reject, unpublish, or feature a template;
- edit metadata and individual Jump content without manipulating raw JSON;
- leave a moderation note visible to the contributor.

Moderation changes and platform-template publication are written to the Audit Log with the real administrator as actor.

## Review states

- `PENDING`: submitted or resubmitted and awaiting review.
- `APPROVED`: visible and importable.
- `FLAGGED`: removed from public discovery while an administrator investigates or requests changes.
- `REJECTED`: not approved; the contributor may revise and resubmit.
- `UNPUBLISHED`: intentionally removed by the contributor or administrator.

The existing `SharedMix.status` remains the public-visibility compatibility field. Rich review state, versions, votes, and contributor profiles live in companion tables so older platform seed records remain usable.

## Deployment

Deploy migration:

```text
20260716170000_mix_template_library
```

The migration adds only companion metadata, contributor-profile, vote, and import-version tables. It backfills existing Shared Mixes as official or Community records without rewriting their stored Jump payloads.

After deployment:

1. run the normal database migration process;
2. run the seed command if official starter templates should be refreshed;
3. verify both library tabs as an ordinary user;
4. verify submission and unpublishing on Plus and Pro workspaces;
5. verify moderation from a platform-admin account;
6. import a template twice and confirm two independent Draft Mixes are created;
7. verify a failed content validation creates no partial Mix or Jump rows.
