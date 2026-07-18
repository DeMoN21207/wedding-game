import { Images, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { appPath, type MediaType } from "../api/client";

type MediaPreviewProps = {
  mediaType: MediaType;
  imageUrl?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

/**
 * Единый визуальный слой для фото и видео: видео отличается только play-иконкой.
 */
export function MediaPreview({
  mediaType,
  imageUrl,
  alt,
  className,
  loading = "lazy",
  fetchPriority = "auto"
}: MediaPreviewProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const visibleImageUrl = imageUrl && failedUrl !== imageUrl ? imageUrl : null;
  const previewClassName = [
    "media-preview",
    mediaType === "video" ? "is-video" : "is-image",
    visibleImageUrl ? null : "is-empty",
    className
  ].filter(Boolean).join(" ");

  useEffect(() => {
    setFailedUrl(null);
  }, [imageUrl]);

  return (
    <span className={previewClassName} aria-label={visibleImageUrl ? undefined : alt}>
      {visibleImageUrl ? (
        <img
          className="media-preview-image"
          src={appPath(visibleImageUrl)}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onError={() => setFailedUrl(visibleImageUrl)}
          width={640}
        />
      ) : (
        <span className="media-preview-placeholder" aria-hidden="true">
          <Images size={26} />
        </span>
      )}
      {mediaType === "video" && (
        <span className="media-preview-play" aria-hidden="true">
          <Play size={18} fill="currentColor" />
        </span>
      )}
    </span>
  );
}
