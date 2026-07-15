import { describe, expect, it } from "vitest";
import { GUEST_AVATAR_COUNT, guestAvatarUrl, normalizeAvatarIndex } from "./guestAvatars";

describe("guest avatar utils", () => {
  it("loads the configured avatar asset set", () => {
    expect(GUEST_AVATAR_COUNT).toBeGreaterThanOrEqual(20);
  });

  it("normalizes backend avatar indexes into existing asset range", () => {
    expect(normalizeAvatarIndex(1)).toBe(1);
    expect(normalizeAvatarIndex(GUEST_AVATAR_COUNT + 1)).toBe(1);
    expect(normalizeAvatarIndex(2.9)).toBe(2);
  });

  it("uses a stable fallback avatar for missing backend indexes", () => {
    const first = normalizeAvatarIndex(null, "guest-slug");
    const second = normalizeAvatarIndex(undefined, "guest-slug");

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(GUEST_AVATAR_COUNT);
    expect(guestAvatarUrl(null, "guest-slug")).toContain("avatar-");
  });
});
