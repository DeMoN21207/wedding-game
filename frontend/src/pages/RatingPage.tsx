import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { getRating, Rating } from "../api/client";
import crownBronzeIcon from "../assets/rating/crown-bronze.png";
import crownGoldIcon from "../assets/rating/crown-gold.png";
import crownSilverIcon from "../assets/rating/crown-silver.png";
import infoIcon from "../assets/rating/info.png";
import refreshIcon from "../assets/rating/refresh.png";
import statGuestsIcon from "../assets/rating/stat-guests.png";
import statPhotosIcon from "../assets/rating/stat-photos.png";
import statTrophyIcon from "../assets/rating/stat-trophy.png";
import { GuestAvatar } from "../components/GuestAvatar";
import { formatShortDate } from "../utils/format";

const EMPTY_RATING: Rating = {
  total_photos: 0,
  total_guests: 0,
  guests: []
};

type RatingGuest = Rating["guests"][number];

type RatingRowProps = {
  guest: RatingGuest;
  maxScore: number;
};

const crownIcons: Record<number, string> = {
  1: crownGoldIcon,
  2: crownSilverIcon,
  3: crownBronzeIcon
};

function scoreLabel(score: number): string {
  const lastDigit = score % 10;
  const lastTwoDigits = score % 100;
  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${score} балл`;
  }
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${score} балла`;
  }
  return `${score} баллов`;
}

const RatingRow = memo(function RatingRow({ guest, maxScore }: RatingRowProps) {
  const score = guest.active_photo_count;
  const progress = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const crown = crownIcons[guest.rank];

  return (
    <article className="rating-page-row">
      <div className="rating-rank-cell">
        {crown ? (
          <img className={`rating-crown rating-crown-${guest.rank}`} src={crown} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="rank-badge">{guest.rank}</span>
        )}
      </div>

      <div className="rating-guest-cell">
        <GuestAvatar className="rating-avatar" avatarIndex={guest.avatar_index} nickname={guest.nickname} seed={guest.slug} />
        <div className="rating-guest-copy">
          <strong>{guest.nickname}</strong>
          <small>В альбоме с {formatShortDate(guest.created_at)}</small>
        </div>
      </div>

      <strong className="rating-photo-count">{guest.active_photo_count} фото</strong>
      <div className="rating-progress-cell">
        <strong>{scoreLabel(score)}</strong>
        <div className="rating-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </article>
  );
});

export function RatingPage() {
  const [rating, setRating] = useState<Rating>(EMPTY_RATING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRating = useCallback(async () => {
    setLoading(true);
    try {
      setRating(await getRating());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть рейтинг.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRating();
  }, [loadRating]);

  const leader = useMemo(() => rating.guests[0], [rating.guests]);
  const maxScore = useMemo(() => Math.max(0, ...rating.guests.map((guest) => guest.active_photo_count)), [rating.guests]);

  const refreshRating = useCallback(() => {
    void loadRating();
  }, [loadRating]);

  return (
    <main className="guest-shell rating-shell wedding-screen">
      <section className="rating-summary-grid" aria-label="Статистика рейтинга">
        <article className="rating-summary-card">
          <img className="rating-summary-icon" src={statTrophyIcon} alt="" aria-hidden="true" />
          <div>
            <small>Лидер</small>
            <strong>{leader ? leader.nickname : "Пока нет"}</strong>
          </div>
        </article>
        <article className="rating-summary-card">
          <img className="rating-summary-icon" src={statPhotosIcon} alt="" aria-hidden="true" />
          <div>
            <small>Всего фото</small>
            <strong>{rating.total_photos}</strong>
          </div>
        </article>
        <article className="rating-summary-card">
          <img className="rating-summary-icon" src={statGuestsIcon} alt="" aria-hidden="true" />
          <div>
            <small>Гостей</small>
            <strong>{rating.total_guests}</strong>
          </div>
        </article>
      </section>

      <div className="gallery-toolbar rating-toolbar" aria-label="Действия рейтинга">
        <span className="gallery-count-pill">
          <img src={statGuestsIcon} alt="" aria-hidden="true" />
          {rating.total_guests > 0 ? `${rating.total_guests} гостей` : "Гостей пока нет"}
        </span>
        <span className="gallery-sort-label">Сначала самый большой вклад</span>
        <button className="rating-refresh-button" title="Обновить" onClick={refreshRating}>
          <img src={refreshIcon} alt="" aria-hidden="true" />
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="rating-list-card" aria-live="polite">
        <div className="rating-list-head" aria-hidden="true">
          <span>#</span>
          <span>Гость</span>
          <span>Фото</span>
          <span>
            Баллы
            <small>
              <img src={infoIcon} alt="" aria-hidden="true" />
              1 фото = 1 балл
            </small>
          </span>
        </div>
        {rating.guests.map((guest) => (
          <RatingRow key={guest.slug} guest={guest} maxScore={maxScore} />
        ))}
        {!loading && rating.guests.length === 0 && <div className="empty-state">Гости появятся после первого входа по QR.</div>}
        {loading && rating.guests.length === 0 && <div className="empty-state">Загружаем рейтинг...</div>}
      </section>
    </main>
  );
}
