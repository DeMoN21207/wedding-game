import { Heart } from "lucide-react";
import { memo } from "react";
import { appConfig } from "../../config/appConfig";

/**
 * Центральный заголовок свадебного альбома.
 */
export const AlbumHero = memo(function AlbumHero() {
  return (
    <section className="album-hero" aria-labelledby="album-title">
      <h1 id="album-title">{appConfig.albumTitle}</h1>
      <div className="album-hero-divider" aria-hidden="true">
        <span />
        <Heart size={16} />
        <span />
      </div>
      <p>Делитесь лучшими моментами этого дня!</p>
    </section>
  );
});
