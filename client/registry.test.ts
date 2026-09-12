import { describe, expect, it } from "vitest";
import {
  canonicalNigeriaCompanySubject,
  nigeriaCompanySubjectBytes,
  normalizeNigeriaRcNumber,
} from "./registry.js";

describe("Nigeria CAC company subjects", () => {
  it("normalizes the RC display label and separators", () => {
    expect(normalizeNigeriaRcNumber(" RC / 001-234. ")).toBe("001234");
    expect(normalizeNigeriaRcNumber("001234")).toBe("001234");
  });

  it("preserves significant leading zeroes instead of inventing a width", () => {
    expect(normalizeNigeriaRcNumber("RC 0007")).toBe("0007");
    expect(normalizeNigeriaRcNumber("RC 7")).toBe("7");
  });

  it("binds the canonical subject to Nigeria, CAC, company, and RC", () => {
    expect(canonicalNigeriaCompanySubject("RC-123456")).toEqual({
      jurisdiction: "NG",
      registry: "CAC",
      entityType: "company",
      identifierType: "RC",
      registrationNumber: "123456",
      canonical: "NG:CAC:company:RC:123456",
    });
  });

  it("rejects empty, non-RC, and non-numeric identifiers", () => {
    for (const value of ["", "   ", "AV123", "BN123", "RC-12A", "123/45X"]) {
      expect(() => normalizeNigeriaRcNumber(value)).toThrow(
        "Nigeria CAC RC number must contain digits only",
      );
    }
  });

  it("produces a deterministic fixed-width OPRF subject", async () => {
    const first = await nigeriaCompanySubjectBytes("RC-123456");
    const second = await nigeriaCompanySubjectBytes("123456");

    expect(first).toHaveLength(32);
    expect(first).toEqual(second);
  });

  it("separates different registration numbers", async () => {
    const first = await nigeriaCompanySubjectBytes("RC-123456");
    const second = await nigeriaCompanySubjectBytes("RC-123457");

    expect(first).not.toEqual(second);
  });
});
