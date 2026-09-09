import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("installable phone experience", () => {
  it("publishes a standalone manifest with regular and maskable icons", () => {
    const manifest = read("src/app/manifest.ts");
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('start_url: "/jumps?source=pwa"');
    expect(manifest).toContain('purpose: "maskable"');
    expect(read("src/app/layout.tsx")).toContain('manifest: "/manifest.webmanifest"');
  });

  it("registers an offline shell and handles push notification taps", () => {
    const worker = read("public/sw.js");
    const prompt = read("src/components/PwaInstallPrompt.tsx");
    expect(read("src/components/PwaRegistration.tsx")).toContain('navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })');
    expect(prompt).toContain('window.addEventListener("jitm:jump-state"');
    expect(worker).toContain('self.addEventListener("fetch"');
    expect(worker).toContain('self.addEventListener("push"');
    expect(worker).toContain('self.addEventListener("notificationclick"');
  });
});
