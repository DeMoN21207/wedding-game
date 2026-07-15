import { Download, Eye, Play, RotateCcw, Trash2, Video, XCircle } from "lucide-react";
import { memo } from "react";
import { appPath, type AdminPhoto } from "../../api/client";
import { formatBytes } from "../../utils/format";

type AdminPhotoGridProps = {
  mode: "active" | "trashed";
  photos: AdminPhoto[];
  onOpenPhoto: (photo: AdminPhoto) => void;
  onRemove: (photo: AdminPhoto) => void;
  onRestore: (photo: AdminPhoto) => void;
  onPermanentRemove: (photo: AdminPhoto) => void;
};

/**
 * Сетка фотографий в админке с действиями для активных фото и корзины.
 */
export const AdminPhotoGrid = memo(function AdminPhotoGrid({ mode, photos, onOpenPhoto, onRemove, onRestore, onPermanentRemove }: AdminPhotoGridProps) {
  return (
    <section className="admin-photo-grid">
      {photos.map((photo) => (
        <article className="admin-photo-card" key={photo.id}>
          {photo.thumbnail_url || photo.preview_url ? (
            <button className="admin-photo-open-button" type="button" title="Открыть файл" onClick={() => onOpenPhoto(photo)}>
              {photo.media_type === "video" ? (
                <div className="video-placeholder admin-photo-preview" aria-label={`Видео ${photo.number}`}>
                  <Video size={28} />
                  <Play size={19} fill="currentColor" />
                </div>
              ) : (
                <img
                  className="admin-photo-preview"
                  src={appPath(photo.thumbnail_url ?? photo.preview_url ?? "")}
                  alt={`Фото ${photo.number}`}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </button>
          ) : (
            <div className="image-placeholder">Файл</div>
          )}
          <div className="admin-photo-toolbar" aria-label={`Действия с файлом ${photo.number}`}>
            <button className="admin-media-action" type="button" title="Открыть" aria-label="Открыть" onClick={() => onOpenPhoto(photo)}>
              <Eye size={16} />
            </button>
            <a className="admin-media-action" href={appPath(photo.original_url)} download title="Скачать файл" aria-label="Скачать файл">
              <Download size={16} />
            </a>
            {mode === "active" ? (
              <button className="admin-media-action danger" type="button" title="В корзину" aria-label="В корзину" onClick={() => onRemove(photo)}>
                <Trash2 size={16} />
              </button>
            ) : (
              <>
                <button className="admin-media-action" type="button" title="Восстановить" aria-label="Восстановить" onClick={() => onRestore(photo)}>
                  <RotateCcw size={16} />
                </button>
                <button className="admin-media-action danger" type="button" title="Удалить навсегда" aria-label="Удалить навсегда" onClick={() => onPermanentRemove(photo)}>
                  <XCircle size={16} />
                </button>
              </>
            )}
          </div>
          <div className="admin-photo-meta">
            <strong>{photo.guest_nickname}</strong>
            <span>{photo.media_type === "video" ? "Видео" : "Фото"} #{photo.number.toString().padStart(3, "0")}</span>
            <span>{formatBytes(photo.size_bytes)}</span>
          </div>
        </article>
      ))}
      {photos.length === 0 && <div className="empty-state">Пусто</div>}
    </section>
  );
});
