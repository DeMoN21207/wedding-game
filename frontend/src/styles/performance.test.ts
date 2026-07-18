import { describe, expect, it } from "vitest";
// @ts-expect-error В проекте нет node-типов, но Vitest выполняет этот тест в Node.
import { existsSync, readFileSync } from "node:fs";

const foundationStyles = readFileSync(new URL("./01-foundation.css", import.meta.url), "utf8");
const uploadGalleryStyles = readFileSync(new URL("./03-upload-gallery.css", import.meta.url), "utf8");
const responsiveStyles = readFileSync(new URL("./06-responsive.css", import.meta.url), "utf8");
const photoCardSource = readFileSync(new URL("../components/PhotoCard.tsx", import.meta.url), "utf8");
const mediaPreviewUrl = new URL("../components/MediaPreview.tsx", import.meta.url);
const mediaPreviewSource = existsSync(mediaPreviewUrl) ? readFileSync(mediaPreviewUrl, "utf8") : "";
const dashboardRecentSource = readFileSync(new URL("../features/album/DashboardRecent.tsx", import.meta.url), "utf8");
const galleryPageSource = readFileSync(new URL("../pages/GalleryPage.tsx", import.meta.url), "utf8");
const adminPageSource = readFileSync(new URL("../pages/AdminPage.tsx", import.meta.url), "utf8");
const albumPageSource = readFileSync(new URL("../pages/AlbumPage.tsx", import.meta.url), "utf8");
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

  it("показывает мобильную галерею ровной сеткой без растягивания фото", () => {
    expect(responsiveStyles).toContain(`.gallery-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }`);
    expect(responsiveStyles).toContain(`.gallery-card-thumb .media-preview-image {
    width: 100%;
    height: 100%;
    aspect-ratio: 4 / 5;
    display: block;
    object-fit: cover;
  }`);
    expect(responsiveStyles).toContain(`.gallery-card-meta {
    position: static;`);
  });

  it("держит гостевые превью на главной единым медиаслоем", () => {
    expect(photoCardSource).not.toContain("height={640}");
    expect(dashboardRecentSource).not.toContain("height={640}");
    expect(uploadGalleryStyles).toContain(`.moments-photo-button .media-preview,
.moments-photo-placeholder {
  width: 100%;
  aspect-ratio: 1.5;`);
    expect(uploadGalleryStyles).toContain(`.moments-photo-button .media-preview-image {
  height: 100%;
  object-fit: cover;
}`);
    expect(uploadGalleryStyles).not.toContain(".moments-photo-button .media-preview-image {\n  height: auto;");
  });

  it("показывает видео как тот же preview с play-иконкой", () => {
    expect(mediaPreviewSource).toContain("mediaType === \"video\"");
    expect(mediaPreviewSource).toContain("media-preview-play");
    expect(mediaPreviewSource).toContain("onError={() => setFailedUrl(visibleImageUrl)}");
    expect(photoCardSource).not.toContain("VideoPoster");
    expect(dashboardRecentSource).not.toContain("VideoPoster");
    expect(galleryPageSource).not.toContain("VideoPoster");
  });

  it("использует единый медиаслой для фото и видео в мобильной галерее", () => {
    expect(mediaPreviewSource).toContain("media-preview");
    expect(mediaPreviewSource).toContain("media-preview-play");
    expect(mediaPreviewSource).toContain("media-preview-image");
    expect(photoCardSource).toContain("MediaPreview");
    expect(dashboardRecentSource).toContain("MediaPreview");
    expect(galleryPageSource).toContain("MediaPreview");
    expect(galleryPageSource).not.toContain("VideoPoster");
    expect(responsiveStyles).toContain(`.gallery-card-thumb .media-preview {
    width: 100%;
    height: 100%;
    aspect-ratio: 4 / 5;
  }`);
  });

  it("кэширует QR в админке и не генерирует PNG на каждый обзор", () => {
    expect(adminPageSource).toContain("const qrCache = useRef");
    expect(adminPageSource).toContain("const loadQrCodes = useCallback");
    expect(adminPageSource).toContain("if (qrCache.current)");
    expect(adminPageSource).toContain("getAdminStorage()");
  });

  it("проверяет админскую сессию до загрузки защищенных данных", () => {
    expect(adminPageSource).toContain('type AdminAuthState = "checking" | "logged-in" | "logged-out"');
    expect(adminPageSource).toContain('useState<AdminAuthState>("checking")');
    expect(adminPageSource).toContain("getAdminSession()");
    expect(adminPageSource).toContain('if (authState !== "logged-in")');
    expect(adminPageSource).not.toContain("useState(true)");
  });

  it("повторно обновляет альбом после фоновой подготовки превью", () => {
    expect(albumPageSource).toContain("previewRefreshTimer");
    expect(albumPageSource).toContain("window.setTimeout");
    expect(albumPageSource).toContain("window.clearTimeout");
  });
});
