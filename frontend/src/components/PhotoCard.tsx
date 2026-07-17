import { Trash2 } from "lucide-react";
import { memo } from "react";
import { appPath, type Photo } from "../api/client";
import { VideoPoster } from "./VideoPoster";

type Props = {
  photo: Photo;
  onDelete?: (photo: Photo) => void;
  onOpen?: (photo: Photo) => void;
};

export const PhotoCard = memo(function PhotoCard({ photo, onDelete, onOpen }: Props) {
  const canOpen = Boolean(photo.preview_url && onOpen);
  const thumbUrl = photo.thumbnail_url ?? photo.preview_url;
  const isVideo = photo.media_type === "video";

  return (
    <article className="photo-card">
      <button className="photo-thumb-button" type="button" title={canOpen ? "Открыть файл" : undefined} onClick={() => onOpen?.(photo)} disabled={!canOpen}>
        {isVideo ? (
          <VideoPoster posterUrl={photo.thumbnail_url} label={`Видео ${photo.number}`} className="photo-thumb" />
        ) : (
          thumbUrl ? (
            <img
              className="photo-thumb"
              src={appPath(thumbUrl)}
              alt={`Фото ${photo.number}`}
              loading="lazy"
              decoding="async"
              width={640}
            />
          ) : (
            <div className="image-placeholder photo-thumb">Фото</div>
          )
        )}
      </button>
      <div className="photo-meta">
        <span>{isVideo ? "Видео" : "Фото"} #{photo.number.toString().padStart(3, "0")}</span>
        {onDelete && (
          <button className="icon-button danger" title="Удалить" onClick={() => onDelete(photo)}>
            <Trash2 size={17} />
          </button>
        )}
      </div>
    </article>
  );
});
