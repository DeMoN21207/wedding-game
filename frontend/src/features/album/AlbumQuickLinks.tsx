import { ChevronRight, Gift, Images, Trophy, UserRound } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";

/**
 * Быстрая навигация из главной страницы в галерею, свои фото и рейтинг.
 */
export const AlbumQuickLinks = memo(function AlbumQuickLinks() {
  return (
    <section className="album-link-grid" aria-label="Быстрая навигация">
      <Link className="album-nav-card" to="/gallery">
        <span className="album-nav-icon album-nav-icon-green" aria-hidden="true">
          <Images size={36} />
        </span>
        <span>
          <strong>Все фото гостей</strong>
          <small>Смотреть все фото из альбома</small>
        </span>
        <ChevronRight size={27} />
      </Link>
      <a className="album-nav-card" href="#my-photos">
        <span className="album-nav-icon album-nav-icon-gold" aria-hidden="true">
          <UserRound size={36} />
        </span>
        <span>
          <strong>Мои фото</strong>
          <small>Ваши загруженные фото</small>
        </span>
        <ChevronRight size={27} />
      </a>
      <Link className="album-nav-card" to="/raffle">
        <span className="album-nav-icon album-nav-icon-coral" aria-hidden="true">
          <Gift size={36} />
        </span>
        <span>
          <strong>Розыгрыш</strong>
          <small>Большое колесо среди гостей</small>
        </span>
        <ChevronRight size={27} />
      </Link>
      <Link className="album-nav-card" to="/rating">
        <span className="album-nav-icon album-nav-icon-red" aria-hidden="true">
          <Trophy size={36} />
        </span>
        <span>
          <strong>Рейтинг гостей</strong>
          <small>Вклад каждого гостя и статистика</small>
        </span>
        <ChevronRight size={27} />
      </Link>
    </section>
  );
});
