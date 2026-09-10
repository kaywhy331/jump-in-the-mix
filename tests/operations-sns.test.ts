import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/operations-sns", () => ({ publishOperationsSns: vi.fn(async () => ({ accepted: true })) }));
import { operationsDestination, postOperationsNotice } from "../src/lib/operations-notifications";
import { publishOperationsSns } from "../src/lib/operations-sns";
const arn = "arn:aws:sns:us-west-2:123456789012:jump-in-the-mix-operations";
const env = { OPS_ALERT_SNS_TOPIC_ARN: arn, AWS_REGION: "us-west-2" };
beforeEach(() => vi.clearAllMocks());
describe("SNS operational notices", () => {
  it("selects an explicit regional SNS topic and retains webhook compatibility", () => {
    expect(operationsDestination(env)).toEqual({ kind: "sns", arn, region: "us-west-2" });
    expect(operationsDestination({ OPS_ALERT_WEBHOOK_URL: "https://example.test/hook" })).toBeInstanceOf(URL);
  });
  it.each([
    { AWS_REGION: "us-east-1" }, { OPS_ALERT_WEBHOOK_URL: "https://example.test/hook" },
    { OPS_ALERT_SNS_TOPIC_ARN: "https://example.test/topic" }, { OPS_ALERT_SNS_TOPIC_ARN: `${arn}.fifo` }
  ])("rejects ambiguous or invalid configuration %j", override => {
    expect(operationsDestination({ ...env, ...override })).toBeNull();
  });
  it("publishes only validated operational evidence with a stable event identifier", async () => {
    const destination = operationsDestination(env)!;
    const notice = { id: "stable-event-id", code: "web" as const, kind: "OPENED", state: "CRITICAL", observedAt: "2026-09-10T10:00:00Z", evidence: { ready: 0 } };
    expect(await postOperationsNotice(destination, notice)).toEqual({ accepted: true });
    expect(publishOperationsSns).toHaveBeenCalledWith(destination, expect.objectContaining({ eventId: notice.id, check: "web", evidence: { ready: 0 } }));
    vi.clearAllMocks();
    expect(await postOperationsNotice(destination, { ...notice, evidence: { ready: 0, privateRecord: 1 } })).toEqual({ accepted: false });
    expect(publishOperationsSns).not.toHaveBeenCalled();
  });
  it("retains retry behavior when the provider does not accept a notice", async () => {
    vi.mocked(publishOperationsSns).mockResolvedValueOnce({ accepted: false });
    expect(await postOperationsNotice(operationsDestination(env)!, { id: "same-event", code: "monitor", kind: "OPENED", state: "CRITICAL", observedAt: "2026-09-10T10:00:00Z", evidence: { unavailable: 1 } })).toEqual({ accepted: false });
  });
});
