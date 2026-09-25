import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { secureCompare } from "@/lib/secure-compare";
import { assertCronRequest } from "@/lib/cron-auth";
import { env } from "@/lib/env";

describe("secureCompare", () => {
  it("accepts identical strings", () => {
    expect(secureCompare("abc123", "abc123")).toBe(true);
    expect(secureCompare("", "")).toBe(true);
  });

  it("rejects a difference in any position, including the last character", () => {
    expect(secureCompare("abc123", "xbc123")).toBe(false);
    expect(secureCompare("abc123", "abc124")).toBe(false);
  });

  it("rejects strings of different lengths without throwing", () => {
    expect(secureCompare("abc", "abcd")).toBe(false);
    expect(secureCompare("abcd", "abc")).toBe(false);
    expect(secureCompare("", "a")).toBe(false);
  });

  it("verifies a real HMAC digest end to end", () => {
    const sig = createHmac("sha256", "secret").update("user.123").digest("hex");
    const forged = createHmac("sha256", "wrong-secret").update("user.123").digest("hex");
    expect(secureCompare(sig, sig)).toBe(true);
    expect(secureCompare(forged, sig)).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(secureCompare("Bearer x", "bearer x")).toBe(false);
  });
});

describe("assertCronRequest", () => {
  const request = (authorization?: string) =>
    new Request("http://localhost/api/cron/worker", {
      headers: authorization ? { authorization } : {},
    });

  it("lets the scheduler through", () => {
    expect(() => assertCronRequest(request(`Bearer ${env().CRON_SECRET}`))).not.toThrow();
  });

  it("refuses a missing, wrong or near-miss credential", () => {
    for (const header of [
      undefined,
      "",
      `Bearer ${env().CRON_SECRET}x`,
      `bearer ${env().CRON_SECRET}`,
      env().CRON_SECRET,
    ]) {
      expect(() => assertCronRequest(request(header))).toThrow("Invalid cron credentials.");
    }
  });
});
