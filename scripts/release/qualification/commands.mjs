// Keep the env executable and context assignment when replacing a failed job
// with its diagnostic. The returned tokens go directly to the image entrypoint.
export function diagnosticArguments(startCommand, step) {
  const prefix = startCommand.split(' ').slice(0, 2);
  if (step === 'postflight') return [...prefix, 'node', 'scripts/release/qualification/diagnose-postflight.mjs'];
  if (step === 'smoke') return [...prefix, 'node', '--import', 'tsx', 'scripts/release/qualification/diagnose-smoke.mjs'];
  throw new Error('Unknown diagnostic step');
}
