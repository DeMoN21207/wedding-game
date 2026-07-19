import { describe, expect, it } from "vitest";
import adminSource from "./pages/AdminPage.tsx?raw";
import albumSource from "./pages/AlbumPage.tsx?raw";
import gallerySource from "./pages/GalleryPage.tsx?raw";

describe("lightbox collection navigation", () => {
  it("connects the public gallery collection", () => {
    expect(gallerySource).toContain("galleryLightboxItems");
    expect(gallerySource).toContain("selection={lightboxSelection}");
    expect(gallerySource).toContain("onActiveIndexChange={selectLightboxIndex}");
  });

  it("keeps recent and personal album collections separate", () => {
    expect(albumSource).toContain("recentLightboxItems");
    expect(albumSource).toContain("myLightboxItems");
    expect(albumSource).toContain("selection={lightboxSelection}");
    expect(albumSource).toContain("onActiveIndexChange={selectLightboxIndex}");
  });

  it("keeps recent and admin media collections separate", () => {
    expect(adminSource).toContain("recentLightboxItems");
    expect(adminSource).toContain("adminLightboxItems");
    expect(adminSource).toContain("selection={lightboxSelection}");
    expect(adminSource).toContain("onActiveIndexChange={selectLightboxIndex}");
  });
});
