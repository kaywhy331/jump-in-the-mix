import { describe, expect, it } from "vitest";
import { DUPLICATE_PAIR_GROUP_LIMIT, duplicateCandidates, phoneDuplicateKey } from "@/lib/contact-duplicate-candidates";
import { normalizePhone } from "@/lib/contact-input";

function person(id: string, displayName: string, options: { phones?: string[]; emails?: string[]; company?: string | null } = {}) {
  return {
    id,
    displayName,
    company: options.company ?? null,
    emails: (options.emails ?? []).map((email) => ({ email, normalized: email.toLowerCase() })),
    phones: (options.phones ?? []).map((phone) => ({ phone, normalized: normalizePhone(phone) ?? phone }))
  };
}

function pairIds(review: ReturnType<typeof duplicateCandidates>): string[] {
  return review.pairs.map((pair) => `${pair.left.id}:${pair.right.id}`).sort();
}

describe("duplicateCandidates", () => {
  it("pairs the same number saved in different formats", () => {
    const review = duplicateCandidates([
      person("a", "Bob Smith", { phones: ["(555) 234-5678"] }),
      person("b", "Robert Smith", { phones: ["+1 555 234 5678"] }),
      person("c", "Bobby", { phones: ["15552345678"] }),
      person("d", "Someone Else", { phones: ["(555) 234-5679"] })
    ]);
    expect(review.groups).toEqual([]);
    expect(pairIds(review)).toEqual(["a:b", "a:c", "b:c"]);
    expect(review.pairs[0].reasons).toEqual(["Same phone · (555) 234-5678"]);
  });

  it("keeps different extensions on one office line apart", () => {
    expect(phoneDuplicateKey({ phone: "555-234-5678 x12", normalized: "555234567812" })).toBe("+15552345678 x12");
    expect(phoneDuplicateKey({ phone: "555-234-5678 x13", normalized: "555234567813" })).toBe("+15552345678 x13");
    expect(phoneDuplicateKey({ phone: "0412 345 678", normalized: "0412345678" })).toBe("0412345678");
    const review = duplicateCandidates([person("a", "Desk One", { phones: ["555-234-5678 x12"] }), person("b", "Desk Two", { phones: ["555-234-5678 x13"] })]);
    expect(review.pairs).toEqual([]);
    expect(review.groups).toEqual([]);
  });

  it("still pairs a shared email and a shared name plus company, merging the reasons per pair", () => {
    const review = duplicateCandidates([
      person("a", "Dana Reyes", { emails: ["Dana@Example.com"], company: "Reyes Roofing" }),
      person("b", "Dana Reyes", { emails: ["dana@example.com"], company: "Reyes Roofing" }),
      person("c", "Dana Reyes", { company: "Another Roofing" })
    ]);
    expect(pairIds(review)).toEqual(["a:b"]);
    expect(review.pairs[0].reasons).toEqual(["Same email · Dana@Example.com", "Same name and company"]);
  });

  it("counts a person once per number even with two spellings of it on their record", () => {
    const review = duplicateCandidates([person("a", "Bob Smith", { phones: ["(555) 234-5678", "+15552345678"] }), person("b", "Bob S", { phones: ["555.234.5678"] })]);
    expect(pairIds(review)).toEqual(["a:b"]);
    expect(review.pairs[0].reasons).toEqual(["Same phone · (555) 234-5678"]);
  });

  it("summarises a number shared by more than the limit instead of expanding every pair", () => {
    const office = Array.from({ length: 10 }, (_, index) => person(`o${index}`, `Agent ${index}`, { phones: [index % 2 ? "(555) 234-0100" : "+1 555 234 0100"] }));
    const review = duplicateCandidates([...office, person("x", "Twin One", { phones: ["555-234-0199"] }), person("y", "Twin Two", { phones: ["(555) 234-0199"] })]);
    expect(review.groups).toHaveLength(1);
    expect(review.groups[0]).toMatchObject({ kind: "phone", label: "+1 555 234 0100", company: null });
    expect(review.groups[0].contacts.map((contact) => contact.id)).toEqual(office.map((contact) => contact.id));
    expect(pairIds(review)).toEqual(["x:y"]);
    expect(DUPLICATE_PAIR_GROUP_LIMIT).toBe(5);
  });

  it("expands exactly the limit as pairs and one more as a group", () => {
    const five = Array.from({ length: 5 }, (_, index) => person(`f${index}`, `Five ${index}`, { emails: ["team@example.com"] }));
    expect(duplicateCandidates(five).pairs).toHaveLength(10);
    expect(duplicateCandidates(five).groups).toEqual([]);
    const six = [...five, person("f5", "Five 5", { emails: ["team@example.com"] })];
    expect(duplicateCandidates(six).pairs).toEqual([]);
    expect(duplicateCandidates(six).groups[0]).toMatchObject({ kind: "email", label: "team@example.com" });
  });

  it("keeps a member of a large group in ordinary pairs for its other shared values", () => {
    const office = Array.from({ length: 6 }, (_, index) => person(`o${index}`, `Agent ${index}`, { phones: ["(555) 234-0100"], emails: index === 0 ? ["lead@example.com"] : [] }));
    const review = duplicateCandidates([...office, person("z", "Lead Twin", { emails: ["lead@example.com"] })]);
    expect(pairIds(review)).toEqual(["o0:z"]);
    expect(review.pairs[0].reasons).toEqual(["Same email · lead@example.com"]);
    expect(review.groups).toHaveLength(1);
  });
});
