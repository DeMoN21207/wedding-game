import { describe, expect, it } from "vitest";
// @ts-expect-error В проекте нет node-типов, но Vitest выполняет этот тест в Node.
import { readFileSync } from "node:fs";

const foundationStyles = readFileSync(new URL("./01-foundation.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

describe("frontend performance safeguards", () => {
  it("пропускает layout и paint для offscreen-карточек галереи", () => {
    expect(foundationStyles).toMatch(/\.photo-card,\s*\.gallery-card\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-size:\s*auto 240px;/s);
  });

  it("включает lite-mode на слабых устройствах", () => {
    expect(mainSource).toContain("navigator.deviceMemory");
    expect(mainSource).toContain("navigator.hardwareConcurrency");
    expect(mainSource).toContain('document.documentElement.classList.add("lite")');
    expect(foundationStyles).toMatch(/html\.lite \*\s*\{[^}]*backdrop-filter:\s*none !important;[^}]*-webkit-backdrop-filter:\s*none !important;/s);
  });
});
