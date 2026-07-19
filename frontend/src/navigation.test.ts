import { describe, expect, it } from "vitest";
// @ts-expect-error В проекте нет node-типов, но Vitest выполняет этот тест в Node.
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("возврат на главную", () => {
  it("присутствует на всех внутренних страницах", () => {
    expect(source("./pages/GalleryPage.tsx")).toContain("<HomeLink");
    expect(source("./pages/RatingPage.tsx")).toContain("<HomeLink");
    expect(source("./pages/RafflePage.tsx")).toContain("<HomeLink");
    expect(source("./features/admin/AdminHeader.tsx")).toContain("<HomeLink");
    expect(source("./pages/AdminLogin.tsx")).toContain("<HomeLink");
    expect(source("./features/album/AlbumHeader.tsx")).toContain("showHomeLink && <HomeLink");
    expect(source("./pages/AlbumPage.tsx")).toContain("showHomeLink={cameraMode}");
  });
});
