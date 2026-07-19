import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import { A11y, Keyboard } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { appPath } from "../api/client";
import type { MediaType } from "../api/client";

export type LightboxPhoto = {
  id: number | string;
  src: string;
  alt: string;
  title: string;
  mediaType: MediaType;
  meta?: string;
  downloadUrl?: string;
};

export type LightboxSelection = {
  items: LightboxPhoto[];
  activeIndex: number;
};

type LightboxSlider = {
  realIndex: number;
  slidePrev: () => void;
  slideNext: () => void;
};

type Props = {
  selection: LightboxSelection | null;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
};

const LIGHTBOX_MODULES = [A11y, Keyboard];

export const PhotoLightbox = memo(function PhotoLightbox({ selection, onActiveIndexChange, onClose }: Props) {
  const sliderRef = useRef<LightboxSlider | null>(null);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const items = selection?.items ?? [];
  const activeIndex = selection?.activeIndex ?? 0;
  const photo = items[activeIndex] ?? null;
  const hasNavigation = items.length > 1;

  useEffect(() => {
    if (!photo) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [photo, onClose]);

  useEffect(() => {
    if (!photo || items.length < 2 || typeof Image === "undefined") {
      return;
    }

    const neighborIndexes = [
      (activeIndex - 1 + items.length) % items.length,
      (activeIndex + 1) % items.length
    ];

    neighborIndexes.forEach((index) => {
      const neighbor = items[index];
      if (neighbor.mediaType === "image") {
        const preload = new Image();
        preload.src = appPath(neighbor.src);
      }
    });
  }, [activeIndex, items, photo]);

  const rememberSlider = useCallback((swiper: LightboxSlider) => {
    sliderRef.current = swiper;
  }, []);

  const handleSlideChange = useCallback((swiper: LightboxSlider) => {
    lightboxRef.current?.querySelectorAll("video").forEach((video) => video.pause());
    if (swiper.realIndex !== activeIndex) {
      onActiveIndexChange(swiper.realIndex);
    }
  }, [activeIndex, onActiveIndexChange]);

  const showPrevious = useCallback(() => {
    sliderRef.current?.slidePrev();
  }, []);

  const showNext = useCallback(() => {
    sliderRef.current?.slideNext();
  }, []);

  if (!photo) {
    return null;
  }

  return (
    <div className="photo-lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Просмотр медиа" onClick={onClose}>
      <div className="photo-lightbox" ref={lightboxRef} onClick={(event) => event.stopPropagation()}>
        <button className="icon-button lightbox-close" type="button" title="Закрыть" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
        {photo.downloadUrl && (
          <a className="icon-button lightbox-download" href={appPath(photo.downloadUrl)} download title="Скачать файл" aria-label="Скачать файл">
            <Download size={20} />
          </a>
        )}
        {hasNavigation && (
          <button className="icon-button lightbox-navigation lightbox-previous" type="button" aria-label="Предыдущий файл" onClick={showPrevious}>
            <ChevronLeft size={28} />
          </button>
        )}
        <Swiper
          className="photo-lightbox-swiper"
          modules={LIGHTBOX_MODULES}
          initialSlide={activeIndex}
          slidesPerView={1}
          speed={360}
          loop={hasNavigation}
          allowTouchMove={hasNavigation}
          keyboard={{ enabled: true }}
          a11y={{ enabled: true, prevSlideMessage: "Предыдущий файл", nextSlideMessage: "Следующий файл" }}
          onSwiper={rememberSlider}
          onSlideChange={handleSlideChange}
        >
          {items.map((item, index) => (
            <SwiperSlide className="photo-lightbox-slide" key={item.id}>
              {item.mediaType === "video" ? (
                <video className="lightbox-video" src={appPath(item.src)} controls playsInline preload="metadata" />
              ) : (
                <img
                  src={appPath(item.src)}
                  alt={item.alt}
                  decoding="async"
                  loading={index === activeIndex ? "eager" : "lazy"}
                />
              )}
            </SwiperSlide>
          ))}
        </Swiper>
        {hasNavigation && (
          <button className="icon-button lightbox-navigation lightbox-next" type="button" aria-label="Следующий файл" onClick={showNext}>
            <ChevronRight size={28} />
          </button>
        )}
        <div className="lightbox-caption" aria-live="polite">
          <strong>{photo.title}</strong>
          {photo.meta && <span>{photo.meta}</span>}
        </div>
      </div>
    </div>
  );
});
