import { build } from "esbuild";

/** Mount the real shared component; only navigation is replaced in the isolated component fixture. */
export async function componentBundle() {
  const result = await build({
    stdin: { contents: `import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { NextActionSummary } from "./src/components/NextAction";
const root = createRoot(document.getElementById("fixture"));
window.ux01 = { render(projection, today) { flushSync(() => root.render(<NextActionSummary projection={projection} today={today} displayPreferences={{locale:"en-US",timeZone:"UTC"}} retryHref="/fixture" />)); } };`,
      resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture-navigation", setup(build) {
      build.onResolve({ filter: /^(next\/link|@\/components\/TodayNavigation)$/ }, () => ({ path: "link", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export function TodayLink(props) { return React.createElement("a", props); } export default TodayLink;', loader: "js", resolveDir: process.cwd() }));
    } }]
  });
  return result.outputFiles[0].text;
}
