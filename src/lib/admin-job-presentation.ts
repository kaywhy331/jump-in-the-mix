const jobs: Record<string, { title: string; impact: string; next: string }> = {
  "generate-jumps": { title: "Prepare follow-ups", impact: "Scheduled follow-ups may be missing from Today.", next: "Check the recorded error and worker health, then retry eligible failed work." },
  "contact-import": { title: "Import contacts", impact: "Some approved contact rows may still be waiting to import.", next: "Review the import and error before retrying; completed rows are preserved." },
  "admin-report-export": { title: "Prepare report export", impact: "The requesting administrator’s CSV may be unavailable.", next: "Check the error and date range. Retry while the export request is still valid, or request a smaller report." },
  "canonicalize-phones": { title: "Update saved phone numbers", impact: "Some saved numbers may not use their country’s full form yet, so a person saved twice in different formats can be missed.", next: "Check the recorded error, then retry. The update is safe to run again; it only rewrites numbers that differ." },
  "support-operator-alert": { title: "Email the support inbox about a ticket", impact: "The support inbox may not have been told about a new ticket or reply.", next: "Open Admin → Support to see the ticket, then check the email configuration." },
  "admin-report-snapshot": { title: "Save daily report", impact: "A day may be missing from report history.", next: "Check the error and worker health before retrying the snapshot." }
};
export function adminJobPresentation(task: string) { return jobs[task] ?? { title: task.replaceAll(/[-_.]/g, " "), impact: "This background task has not completed.", next: "Ask the application operator to check whether the current worker supports this task." }; }
export function supportedAdminJob(task: string) { return Object.hasOwn(jobs, task); }
