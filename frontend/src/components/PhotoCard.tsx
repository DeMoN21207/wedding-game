import { Play, Trash2, Video } from "lucide-react";
import { memo } from "react";
import { AuthorizedImage } from "./AuthorizedImage";
import type { Photo } from "../api/client";

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
          <div className="video-placeholder photo-thumb" aria-label={`Видео ${photo.number}`}>
            <Video size={26} />
            <Play size={18} fill="currentColor" />
          </div>
        ) : (
          <AuthorizedImage className="photo-thumb" src={thumbUrl} alt={`Фото ${photo.number}`} />
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
