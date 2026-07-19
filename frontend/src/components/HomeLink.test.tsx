import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomeLink } from "./HomeLink";

describe("HomeLink", () => {
  it("ведет на главную и сохраняет понятное доступное имя", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HomeLink />
      </MemoryRouter>
    );

    expect(html).toContain('href="/"');
    expect(html).toContain('aria-label="Вернуться на главную"');
    expect(html).toContain("На главную");
  });
});
