import { describe, expect, it } from "vitest";
// @ts-expect-error В проекте нет node-типов, но Vitest выполняет этот тест в Node.
import { readFileSync } from "node:fs";
import pageSource from "./RafflePage.tsx?raw";

const raffleStyles = readFileSync(new URL("../styles/07-raffle-page.css", import.meta.url), "utf8");

function selectorPattern(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("RafflePage wheel performance structure", () => {
  it("вращает HTML-ротор, а не внутреннюю SVG-группу", () => {
    expect(pageSource).toContain('className="giveaway-wheel-rotor"');
    expect(pageSource).not.toContain('<g className="giveaway-wheel-spin"');
  });

  it("завершает розыгрыш по transitionend, а не по таймеру", () => {
    expect(pageSource).toContain("onTransitionEnd={handleWheelTransitionEnd}");
    expect(pageSource).not.toContain("winnerTimerRef");
    expect(pageSource).not.toContain("window.setTimeout");
  });

  it("не ставит дорогие paint-свойства на предков ротора", () => {
    const rotorAncestors = [".giveaway-page", ".giveaway-hero", ".giveaway-wheel-column", ".giveaway-wheel-shell"];

    rotorAncestors.forEach((selector) => {
      expect(raffleStyles).not.toMatch(new RegExp(`${selectorPattern(selector)}\\s*\\{[^}]*(?:filter|opacity|mask|backdrop-filter)\\s*:`, "s"));
    });
  });

  it("не ставит CSS filter на лампочки колеса", () => {
    expect(raffleStyles).not.toMatch(/\.giveaway-wheel-light\s*\{[^}]*filter:/s);
  });
});
