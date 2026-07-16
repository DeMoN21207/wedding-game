import { ArrowLeft, Camera, Download, Images, Play, RefreshCw, Video } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { appPath, GalleryPhoto, getGalleryPhotos } from "../api/client";
import { LightboxPhoto, PhotoLightbox } from "../components/PhotoLightbox";
import { formatShortDate } from "../utils/format";

const PAGE_SIZE = 48;

type GalleryCardProps = {
  photo: GalleryPhoto;
  onOpenPhoto: (photo: GalleryPhoto) => void;
  priority?: boolean;
};

const GalleryCard = memo(function GalleryCard({ photo, onOpenPhoto, priority = false }: GalleryCardProps) {
  const thumbUrl = photo.thumbnail_url ?? photo.preview_url;
  const isVideo = photo.media_type === "video";

  return (
    <article className="gallery-card">
      {thumbUrl || isVideo ? (
        <button className="gallery-card-thumb" type="button" title="Открыть файл" onClick={() => onOpenPhoto(photo)}>
          {isVideo ? (
            <div className="video-placeholder gallery-card-video" aria-label={`${photo.guest_nickname}, видео ${photo.number}`}>
              <Video size={30} />
              <Play size={20} fill="currentColor" />
            </div>
          ) : (
            <img
              src={appPath(thumbUrl ?? "")}
              alt={`${photo.guest_nickname}, фото ${photo.number}`}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              width={640}
              height={640}
            />
          )}
        </button>
      ) : (
        <div className="gallery-card-placeholder">
          <Images size={26} />
        </div>
      )}
      <div className="gallery-card-meta">
        <div>
          <strong>{photo.guest_nickname}</strong>
          <span>{isVideo ? "Видео" : "Фото"} #{photo.number.toString().padStart(3, "0")} · {formatShortDate(photo.created_at)}</span>
        </div>
        <a className="icon-button" href={appPath(photo.download_url)} download title="Скачать оригинал">
          <Download size={17} />
        </a>
      </div>
    </article>
  );
});

export function GalleryPage() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  const loadPage = useCallback(async (offset: number, replace = false) => {
    if (replace) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const page = await getGalleryPhotos(PAGE_SIZE, offset);
      setPhotos((current) => (replace ? page.photos : [...current, ...page.photos]));
      setTotal(page.total);
      setHasMore(page.has_more);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть общую галерею.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(0, true);
  }, [loadPage]);

  const openPhoto = useCallback((photo: GalleryPhoto) => {
    if (!photo.preview_url) {
      return;
    }
    setLightboxPhoto({
      src: photo.preview_url,
      alt: `${photo.guest_nickname}, ${photo.media_type === "video" ? "видео" : "фото"} ${photo.number}`,
      title: photo.guest_nickname,
      mediaType: photo.media_type,
      meta: `${photo.media_type === "video" ? "Видео" : "Фото"} #${photo.number.toString().padStart(3, "0")} · ${formatShortDate(photo.created_at)}`,
      downloadUrl: photo.download_url
    });
  }, []);

  const refreshGallery = useCallback(() => {
    void loadPage(0, true);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    void loadPage(photos.length);
  }, [loadPage, photos.length]);

  const closeLightbox = useCallback(() => {
    setLightboxPhoto(null);
  }, []);

  return (
    <main className="guest-shell album-shell gallery-shell wedding-screen">
      <header className="topbar wedding-topbar album-topbar">
        <div>
          <p className="eyebrow">Общий альбом</p>
          <h1>Все фото и видео</h1>
        </div>
        <div className="gallery-top-actions">
          <Link className="icon-button" title="На главную" to="/">
            <ArrowLeft size={18} />
          </Link>
          <Link className="icon-button" title="Добавить фото" to="/camera">
            <Camera size={18} />
          </Link>
        </div>
      </header>

      <div className="gallery-toolbar" aria-label="Навигация галереи">
        <span className="gallery-count-pill">
          <Images size={16} />
          {total > 0 ? `${total} файлов` : "Пока пусто"}
        </span>
        <span className="gallery-sort-label">Сначала новые</span>
        <button className="icon-button" title="Обновить" onClick={refreshGallery}>
          <RefreshCw size={18} />
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="gallery-grid" aria-live="polite">
        {photos.map((photo, index) => (
          <GalleryCard key={photo.id} photo={photo} onOpenPhoto={openPhoto} priority={index < 6} />
        ))}
        {!loading && photos.length === 0 && <div className="empty-state">Пока никто не загрузил фото или видео.</div>}
        {loading && photos.length === 0 && <div className="empty-state">Загружаем галерею...</div>}
      </section>

      {hasMore && (
        <button className="primary-action gallery-more-button" disabled={loadingMore} onClick={loadMore}>
          <Images size={18} />
          <span>{loadingMore ? "Загружаем..." : "Показать еще"}</span>
        </button>
      )}

      <PhotoLightbox photo={lightboxPhoto} onClose={closeLightbox} />
    </main>
  );
}
