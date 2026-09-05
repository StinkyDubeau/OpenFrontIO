import { describe, expect, it } from "vitest";
import {
  issueGuestPlayToken,
  verifyGuestPlayToken,
} from "../../src/server/GuestPlayToken";

describe("guest play tokens", () => {
  it("round-trips a world identity without exposing a JWT", () => {
    const issuedAt = 1_700_000_000_000;
    const token = issueGuestPlayToken("pwi_test_identity", issuedAt);

    expect(token.startsWith("guest_")).toBe(true);
    expect(verifyGuestPlayToken(token, issuedAt + 1)).toBe("pwi_test_identity");
  });

  it("rejects tampered and expired credentials", () => {
    const issuedAt = 1_700_000_000_000;
    const token = issueGuestPlayToken("pwi_test_identity", issuedAt);
    const [prefix, payload, signature] = token.split("_");

    expect(
      verifyGuestPlayToken(`${prefix}_${payload}_x${signature}`, issuedAt),
    ).toBeNull();
    expect(
      verifyGuestPlayToken(token, issuedAt + 14 * 24 * 60 * 60 * 1000),
    ).toBeNull();
  });
});
