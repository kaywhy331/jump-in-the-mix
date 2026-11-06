import { settings } from "./flag-sensitive-push.mjs";

const code = (value) => `<code>${String(value).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char])}</code>`;

/** Called only by the push workflow; injected API also permits offline verification. */
export async function reportSensitivePush({ github, context, report, config = settings }) {
  if (!report.flagged.length) return null;
  const repo = context.repo;
  // runId survives reruns but distinguishes separate pushes to the same commit.
  const marker = `<!-- ${config.markerPrefix}:push-run:${context.runId} -->`;
  for await (const { data } of github.paginate.iterator(github.rest.issues.listForRepo, {
    ...repo, state: "all", per_page: 100,
  })) {
    const existing = data.find((issue) => !issue.pull_request && issue.body?.includes(marker));
    if (existing) return existing;
  }
  try {
    await github.rest.issues.getLabel({ ...repo, name: config.label });
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      await github.rest.issues.createLabel({
        ...repo, name: config.label, color: config.labelColor, description: config.labelDescription,
      });
    } catch (createError) {
      if (createError.status !== 422) throw createError;
      // Another push may have created it concurrently; verify rather than ignore.
      await github.rest.issues.getLabel({ ...repo, name: config.label });
    }
  }
  const body = [
    marker,
    `Commit range: ${code(`${report.before}..${report.after}`)}`,
    `Pusher: ${code(report.pusher)}`,
    `Ref: ${code(report.ref)}`,
    "", "Flagged paths:", ...report.flagged.map((file) => `- ${code(file)}`),
    "", ...report.warnings.map((warning) => `Audit note: ${warning}`),
  ].join("\n");
  const { data } = await github.rest.issues.create({
    ...repo, title: `${config.titlePrefix}: ${report.after.slice(0, 7)} touches sensitive paths`,
    body, labels: [config.label],
  });
  return data;
}
