import { Download, X } from "lucide-react";
import { memo, useEffect } from "react";
import { appPath } from "../api/client";
import type { MediaType } from "../api/client";

export type LightboxPhoto = {
  src: string;
  alt: string;
  title: string;
  mediaType: MediaType;
  meta?: string;
  downloadUrl?: string;
};

type Props = {
  photo: LightboxPhoto | null;
  onClose: () => void;
};

export const PhotoLightbox = memo(function PhotoLightbox({ photo, onClose }: Props) {
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

  if (!photo) {
    return null;
  }

  return (
    <div className="photo-lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Просмотр медиа" onClick={onClose}>
      <div className="photo-lightbox" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button lightbox-close" type="button" title="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
        {photo.downloadUrl && (
          <a className="icon-button lightbox-download" href={appPath(photo.downloadUrl)} download title="Скачать файл">
            <Download size={20} />
          </a>
        )}
        {photo.mediaType === "video" ? (
          <video className="lightbox-video" src={appPath(photo.src)} controls playsInline preload="metadata" />
        ) : (
          <img src={appPath(photo.src)} alt={photo.alt} decoding="async" />
        )}
        <div className="lightbox-caption">
          <strong>{photo.title}</strong>
          {photo.meta && <span>{photo.meta}</span>}
        </div>
      </div>
    </div>
  );
});
