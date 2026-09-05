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
        "http://127.0.0.1:3000/login"
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--headless=new --no-sandbox"
      }
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.7 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }]
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".artifacts/lighthouse"
    }
  }
};
