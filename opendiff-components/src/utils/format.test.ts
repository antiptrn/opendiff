import { describe, expect, it } from "vitest";
import { formatDate, getTierName, formatRoleName, formatCurrency, formatCents } from "./format";

describe("formatDate", () => {
  it("formats a valid date string", () => {
    const result = formatDate("2025-01-15T00:00:00Z");
    expect(result).toBe("Jan 15, 2025");
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });
});

describe("getTierName", () => {
  it("returns BYOK for BYOK tier", () => {
    expect(getTierName("BYOK")).toBe("BYOK");
  });

  it("returns Code Review for CODE_REVIEW tier", () => {
    expect(getTierName("CODE_REVIEW")).toBe("Code Review");
  });

  it("returns Triage for TRIAGE tier", () => {
    expect(getTierName("TRIAGE")).toBe("Triage");
  });

  it("returns Free for null", () => {
    expect(getTierName(null)).toBe("Free");
  });

  it("returns Free for undefined", () => {
    expect(getTierName(undefined)).toBe("Free");
  });

  it("returns Free for unknown tier", () => {
    expect(getTierName("UNKNOWN")).toBe("Free");
  });
});

describe("formatRoleName", () => {
  it("title-cases OWNER", () => {
    expect(formatRoleName("OWNER")).toBe("Owner");
  });

  it("title-cases ADMIN", () => {
    expect(formatRoleName("ADMIN")).toBe("Admin");
  });

  it("title-cases MEMBER", () => {
    expect(formatRoleName("MEMBER")).toBe("Member");
  });

  it("handles already title-cased input", () => {
    expect(formatRoleName("Admin")).toBe("Admin");
  });
});

describe("formatCurrency", () => {
  it("formats USD cents to dollars", () => {
    expect(formatCurrency(1999, "usd")).toBe("$19.99");
  });

  it("formats zero cents", () => {
    expect(formatCurrency(0, "usd")).toBe("$0.00");
  });

  it("formats large amounts", () => {
    expect(formatCurrency(100000, "usd")).toBe("$1,000.00");
  });
});

describe("formatCents", () => {
  it("formats positive cents", () => {
    expect(formatCents(1999)).toBe("$19.99");
  });

  it("formats zero cents", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats negative cents with minus sign", () => {
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("formats small amounts", () => {
    expect(formatCents(99)).toBe("$0.99");
  });
});
