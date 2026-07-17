import { describe, expect, it } from "vitest";
// @ts-expect-error В проекте нет node-типов, но Vitest выполняет этот тест в Node.
import { readFileSync } from "node:fs";

const foundationStyles = readFileSync(new URL("./01-foundation.css", import.meta.url), "utf8");
const uploadGalleryStyles = readFileSync(new URL("./03-upload-gallery.css", import.meta.url), "utf8");
const responsiveStyles = readFileSync(new URL("./06-responsive.css", import.meta.url), "utf8");
const photoCardSource = readFileSync(new URL("../components/PhotoCard.tsx", import.meta.url), "utf8");
const videoPosterSource = readFileSync(new URL("../components/VideoPoster.tsx", import.meta.url), "utf8");
const dashboardRecentSource = readFileSync(new URL("../features/album/DashboardRecent.tsx", import.meta.url), "utf8");
const galleryPageSource = readFileSync(new URL("../pages/GalleryPage.tsx", import.meta.url), "utf8");
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

  it("показывает мобильную галерею masonry без растягивания фото", () => {
    expect(responsiveStyles).toContain(`.gallery-grid {
    display: block;
    column-count: 2;
    column-gap: 9px;
  }`);
    expect(responsiveStyles).toContain(`.gallery-card-thumb img {
    width: 100%;
    height: auto;
    aspect-ratio: auto;
    display: block;
    object-fit: contain;
  }`);
    expect(responsiveStyles).toContain(`.gallery-card-meta {
    position: static;`);
  });

  it("не задает квадратную высоту гостевым фото на главной", () => {
    expect(photoCardSource).not.toContain("height={640}");
    expect(dashboardRecentSource).not.toContain("height={640}");
    expect(uploadGalleryStyles).toContain(`.wedding-photo-grid .photo-thumb-button img.photo-thumb,
.wedding-photo-grid .photo-thumb-button .video-poster.photo-thumb,
.moments-photo-button img,
.moments-photo-button .video-poster {
  height: auto;
  aspect-ratio: auto;
  object-fit: contain;
}`);
  });

  it("показывает video poster вместо растянутой заглушки, когда thumbnail готов", () => {
    expect(videoPosterSource).toContain("posterUrl");
    expect(videoPosterSource).toContain("video-play-badge");
    expect(photoCardSource).toContain("VideoPoster");
    expect(dashboardRecentSource).toContain("VideoPoster");
    expect(galleryPageSource).toContain("VideoPoster");
    expect(responsiveStyles).toContain(`.video-poster.gallery-card-video {
    min-height: 0;
    height: auto;
    aspect-ratio: auto;
    display: block;
  }`);
  });
});
