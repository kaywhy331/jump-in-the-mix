# Journey person focus — November 6, 2026

M4-S3 implements Kevin's D121 and closes JRN-02 while keeping D75.
Branch: `kaywhy331/dispatch-job_080147780ebe`, based on main `682b8ac7`,
which contains M4-S1 and M4-S2. The task authorizes landing through a normal
fast-forward push after self-check; production release remains separate.

Choosing a person marks their active personal Mix starts and their non-canceled
Journey runs, across all their workflow instances. The first active Mix still
leads the reveal, with the first marked Mix as the fallback. A start without a
follow-up marks its Mix; a follow-up without a start does not. Tags, stops and
other profile membership remain outside D121. The profile and Journey share
the scoped personal-start query semantics.

Paths come from recorded transitions and their saved definitions. A displayed
connection is emphasized only when its identifier and both endpoints match;
shared Mix membership never creates a path. Completed branches can contribute
to a recorded join, while canceled branches cannot. Selecting individual work
limits path emphasis to that instance; saved maps remain available.

The phone reveals the chosen person's row again when Mixes returns from
Details. A background refresh preserves the owner's position. Unrelated Mixes
and paths use semantic tokens, with readable text and keyboard focus.

Rules: WF-04 and WF-02; JITM-07 §2.19–§2.20; JITM-09 §2.52–§2.59;
JITM-10 §2.1–§2.5; JITM-11 §2.9–§2.10; JITM-12 §2.
The feature, UI and standards-update skills apply. No new product decision,
dependency, schema, sending behavior or deployment configuration is introduced.

VERIFIED before final commit: targeted membership/count/roster tests and the
new desktop/phone scenarios pass, including the theme/width/200%-text matrix.
Pinned tests remain unchanged. Native browser automation returned
`browser_unavailable`; browser evidence uses isolated local Chromium instead.
Exact final commands, exit codes, commit identity, screenshots, measured
contrast/targets, regression coverage and hosted conclusions are recorded in
the private `.artifacts/m4s3/REPORT.md` and the M4-S3 Hub task.

NOT RUN here: production release and physical devices; outside this slice.
