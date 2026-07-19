import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
// @ts-expect-error В проекте нет node-типов, но Vitest выполняет этот тест в Node.
import { readFileSync } from "node:fs";
import componentSource from "./PhotoLightbox.tsx?raw";
import { PhotoLightbox, type LightboxSelection } from "./PhotoLightbox";

const lightboxStyles = readFileSync(new URL("../styles/05-lightbox-rating.css", import.meta.url), "utf8");
const responsiveStyles = readFileSync(new URL("../styles/06-responsive.css", import.meta.url), "utf8");

const oneItem: LightboxSelection = {
  activeIndex: 0,
  items: [{ id: 1, src: "/one.jpg", alt: "Фото", title: "Маша", mediaType: "image" }]
};

const twoItems: LightboxSelection = {
  activeIndex: 0,
  items: [
    oneItem.items[0],
    { id: 2, src: "/two.jpg", alt: "Фото 2", title: "Катя", mediaType: "image" }
  ]
};

describe("PhotoLightbox", () => {
  it("configures cyclic keyboard and swipe navigation", () => {
    expect(componentSource).toContain("loop={hasNavigation}");
    expect(componentSource).toContain("const LIGHTBOX_MODULES = [A11y, Keyboard]");
    expect(componentSource).toContain("modules={LIGHTBOX_MODULES}");
    expect(componentSource).toContain("keyboard={{ enabled: true }}");
    expect(componentSource).toContain("slidePrev()");
    expect(componentSource).toContain("slideNext()");
  });

  it("renders accessible side controls only for multiple items", () => {
    const singleHtml = renderToStaticMarkup(
      <PhotoLightbox selection={oneItem} onActiveIndexChange={() => undefined} onClose={() => undefined} />
    );
    const multipleHtml = renderToStaticMarkup(
      <PhotoLightbox selection={twoItems} onActiveIndexChange={() => undefined} onClose={() => undefined} />
    );

    expect(singleHtml).not.toContain("Предыдущий файл");
    expect(singleHtml).not.toContain("Следующий файл");
    expect(multipleHtml).toContain('aria-label="Предыдущий файл"');
    expect(multipleHtml).toContain('aria-label="Следующий файл"');
  });

  it("positions stable navigation controls over the media on desktop and mobile", () => {
    expect(lightboxStyles).toMatch(/\.lightbox-navigation\s*{[^}]*position:\s*absolute;[^}]*width:\s*52px;[^}]*height:\s*52px;/s);
    expect(lightboxStyles).toMatch(/\.lightbox-previous\s*{[^}]*left:/s);
    expect(lightboxStyles).toMatch(/\.lightbox-next\s*{[^}]*right:/s);
    expect(responsiveStyles).toMatch(/\.lightbox-navigation\s*{[^}]*width:\s*46px;[^}]*height:\s*46px;/s);
  });
});
