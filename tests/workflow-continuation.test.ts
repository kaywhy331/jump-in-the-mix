import { describe, expect, it } from "vitest";
import { workflowContinuation, workflowStartPath } from "@/lib/workflow-continuation";

describe("workflow navigation intent", () => {
  it("retains the selected work and label while selecting a newly saved person", () => {
    const path = workflowStartPath("estimate/one", undefined, "Kitchen & hall");
    const result = new URL(workflowContinuation(path, "person-1")!, "https://local.invalid");
    expect(result.searchParams.get("mix")).toBe("estimate/one");
    expect(result.searchParams.get("label")).toBe("Kitchen & hall");
    expect(result.searchParams.get("contactId")).toBe("person-1");
    expect(result.searchParams.get("start")).toBe("1");
  });
  it.each(["https://external.invalid/journey", "//external.invalid/journey", "/journey\\external", "/journey/../admin", "/contacts", "/journey\n"])("refuses an unrelated or unsafe continuation: %s", value => {
    expect(workflowContinuation(value, "person")).toBeNull();
  });
});
