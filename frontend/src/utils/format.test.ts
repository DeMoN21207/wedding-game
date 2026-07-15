import { describe, expect, it } from "vitest";
import { formatBytes, formatPercent, formatShortDate, initials } from "./format";

describe("format utils", () => {
  it("builds compact initials from guest names", () => {
    expect(initials("DeMoN2")).toBe("D");
    expect(initials("Анна Мария Иванова")).toBe("АМ");
    expect(initials("   ")).toBe("Г");
  });

  it("formats dates, percents and file sizes for Russian UI", () => {
    const formattedDate = formatShortDate("2026-06-12T17:27:00Z");
    expect(formattedDate).toContain("12");
    expect(formattedDate).toContain("июн");
    expect(formattedDate).toContain(":27");
    expect(formatPercent(66.666)).toBe("66,67%");
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(1536)).toBe("2 КБ");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2,5 МБ");
  });
});
