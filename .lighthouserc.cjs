const { chromium } = require("@playwright/test");

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
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--headless=new --no-sandbox"
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
