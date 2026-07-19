import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import componentSource from "./PhotoLightbox.tsx?raw";
import { PhotoLightbox, type LightboxSelection } from "./PhotoLightbox";

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
});
