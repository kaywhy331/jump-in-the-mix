const { chromium } = require("@playwright/test");

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Lighthouse PORT");

module.exports = {
  ci: {
    collect: {
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      startServerCommand: "node .next/standalone/server.js",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 120_000,
      url: [
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/for/real-estate-agents",
        "http://127.0.0.1:3000/for/consultants",
        "http://127.0.0.1:3000/for/photographers",
        "http://127.0.0.1:3000/for/contractors",
        "http://127.0.0.1:3000/for/independent-recruiters"
      ].map(url => url.replace(":3000", `:${port}`)),
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--headless=new --no-sandbox",
        // Measure the real throttled paint rather than the simulated estimate. On these
        // server-rendered pages the estimate was bimodal on identical bytes (the hydration
        // scripts land in its LCP path only when their evaluation happens to start before the
        // observed first paint), while the observed throttled paint is stable. Issue #59 holds
        // the measurements. The budgets below are unchanged.
        throttlingMethod: "devtools",
        // Pin the existing Lighthouse 12 mobile defaults, including the *applied*
        // DevTools network rates (rttMs/throughputKbps alone affect simulation).
        formFactor: "mobile",
        screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.5600000000002,
          uploadThroughputKbps: 675,
          cpuSlowdownMultiplier: 4
        },
        disableStorageReset: false,
        locale: "en-US"
      }
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "median-run" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median-run" }]
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".artifacts/lighthouse"
    }
  }
};
