import { ChevronLeft, ChevronRight, Play, Sparkles, Video } from "lucide-react";
import { memo, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { A11y, Autoplay } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { appPath, type AlbumPhoto } from "../../api/client";

type SliderHandle = {
  slidePrev: (speed?: number, runCallbacks?: boolean) => void;
  slideNext: (speed?: number, runCallbacks?: boolean) => void;
  autoplay?: {
    stop: () => void;
  };
};

const SLIDER_MODULES = [A11y, Autoplay];

type DashboardRecentProps = {
  photos: AlbumPhoto[];
  loading: boolean;
  onOpenPhoto: (photo: AlbumPhoto) => void;
};

/**
 * Горизонтальный слайдер десяти последних фотографий гостей.
 */
export const DashboardRecent = memo(function DashboardRecent({ photos, loading, onOpenPhoto }: DashboardRecentProps) {
  const sliderRef = useRef<SliderHandle | null>(null);
  const visiblePhotos = useMemo(() => photos.slice(0, 10), [photos]);
  const canSlide = visiblePhotos.length > 1;
  const moveSlider = useCallback((direction: "prev" | "next") => {
    const slider = sliderRef.current;
    slider?.autoplay?.stop();

    if (direction === "prev") {
      slider?.slidePrev(500);
      return;
    }

    slider?.slideNext(500);
  }, []);

  const rememberSlider = useCallback((swiper: SliderHandle) => {
    sliderRef.current = swiper;
  }, []);

  return (
    <section className="album-moments-card" aria-labelledby="moments-title">
      <div className="moments-title-row">
        <div className="moments-title-copy">
          <span className="moments-spark" aria-hidden="true">
            <Sparkles size={22} />
          </span>
          <span>
            <h2 id="moments-title">Последние моменты</h2>
            <p>Самые свежие моменты гостей</p>
          </span>
        </div>
        <div className="moments-actions">
          <Link className="moments-all-link" to="/gallery">
            <span>Смотреть все фото</span>
            <ChevronRight size={22} />
          </Link>
        </div>
      </div>
      {visiblePhotos.length > 0 ? (
        <div className="moments-slider-frame">
          {canSlide ? (
            <button
              className="moments-arrow moments-arrow-left"
              type="button"
              title="Назад"
              aria-label="Предыдущие фото"
              onClick={() => moveSlider("prev")}
            >
              <ChevronLeft size={24} />
            </button>
          ) : null}
          <Swiper
            className="moments-swiper"
            modules={SLIDER_MODULES}
            onSwiper={rememberSlider}
            slidesPerView="auto"
            spaceBetween={10}
            rewind={canSlide}
            speed={650}
            autoplay={visiblePhotos.length > 1 ? { delay: 2600, disableOnInteraction: false, pauseOnMouseEnter: true } : false}
            a11y={{ enabled: true }}
          >
            {visiblePhotos.map((photo) => (
              <SwiperSlide className="moments-slide" key={photo.id}>
                {photo.thumbnail_url || photo.preview_url ? (
                  <button className="moments-photo-button" type="button" title="Открыть файл" onClick={() => onOpenPhoto(photo)}>
                    {photo.media_type === "video" ? (
                      <div className="video-placeholder moments-video-placeholder" aria-label={`${photo.guest_nickname}, видео ${photo.number}`}>
                        <Video size={34} />
                        <Play size={22} fill="currentColor" />
                      </div>
                    ) : (
                      <img
                        src={appPath(photo.thumbnail_url ?? photo.preview_url ?? "")}
                        alt={`${photo.guest_nickname}, фото ${photo.number}`}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </button>
                ) : (
                  <div className="moments-photo-placeholder">#{photo.number.toString().padStart(3, "0")}</div>
                )}
              </SwiperSlide>
            ))}
          </Swiper>
          {canSlide ? (
            <button
              className="moments-arrow moments-arrow-right"
              type="button"
              title="Вперед"
              aria-label="Следующие фото"
              onClick={() => moveSlider("next")}
            >
              <ChevronRight size={24} />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="empty-state compact">{loading ? "Загружаем..." : "Моменты появятся здесь после первых загрузок."}</div>
      )}
    </section>
  );
});
