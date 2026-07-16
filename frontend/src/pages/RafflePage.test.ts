import { describe, expect, it } from "vitest";
import pageSource from "./RafflePage.tsx?raw";

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
});
