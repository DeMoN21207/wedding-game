import { Play, Video } from "lucide-react";
import { appPath } from "../api/client";

type VideoPosterProps = {
  posterUrl?: string | null;
  label: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

/**
 * Показывает poster видео как обычную картинку, а если кадр еще не готов — легкую fallback-заглушку.
 */
export function VideoPoster({ posterUrl, label, className, loading = "lazy", fetchPriority = "auto" }: VideoPosterProps) {
  const visualClassName = ["video-poster", className].filter(Boolean).join(" ");
  const placeholderClassName = ["video-placeholder", className].filter(Boolean).join(" ");

  if (!posterUrl) {
    return (
      <div className={placeholderClassName} aria-label={label}>
        <Video size={26} />
        <Play size={18} fill="currentColor" />
      </div>
    );
  }

  return (
    <span className={visualClassName} aria-label={label}>
      <img
        src={appPath(posterUrl)}
        alt={label}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        width={640}
      />
      <span className="video-play-badge" aria-hidden="true">
        <Play size={18} fill="currentColor" />
      </span>
    </span>
  );
}
