import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WelcomeDialog } from "./WelcomeDialog";

describe("WelcomeDialog", () => {
  it("shows and associates a nickname registration error", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog
        nickname="Маша"
        saving={false}
        error="Этот ник уже занят. Придумайте другой."
        onNicknameChange={() => undefined}
        onSubmit={() => undefined}
      />
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="guest-nickname-error"');
    expect(html).toContain('id="guest-nickname-error"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Этот ник уже занят. Придумайте другой.");
  });
});
