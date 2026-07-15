import { Gift, RefreshCw, Trophy, UsersRound } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getRating, type AlbumContributor } from "../../api/client";
import { guestAvatarUrl } from "../../utils/guestAvatars";

type RaffleSourceGuest = Pick<AlbumContributor, "nickname" | "slug" | "avatar_index" | "active_photo_count">;

export type RaffleParticipant = {
  nickname: string;
  slug: string;
  avatarIndex: number;
  photoCount: number;
};

type RaffleWheelStyle = CSSProperties & {
  "--raffle-wheel-gradient": string;
  "--raffle-wheel-rotation": string;
};

type Props = {
  fallbackGuests: AlbumContributor[];
};

const RAFFLE_COLORS = [
  "oklch(68% 0.16 24)",
  "oklch(82% 0.15 78)",
  "oklch(61% 0.1 132)",
  "oklch(72% 0.095 42)",
  "oklch(64% 0.12 350)",
  "oklch(72% 0.085 210)",
  "oklch(58% 0.11 24)",
  "oklch(78% 0.12 94)"
];

const SPIN_DURATION_MS = 3300;

/**
 * Готовит список участников розыгрыша: участвуют только гости, которые уже добавили фото.
 */
export function buildRaffleParticipants(guests: RaffleSourceGuest[]): RaffleParticipant[] {
  return guests
    .filter((guest) => guest.active_photo_count > 0)
    .map((guest) => ({
      nickname: guest.nickname,
      slug: guest.slug,
      avatarIndex: guest.avatar_index,
      photoCount: guest.active_photo_count
    }));
}

/**
 * Выбирает одного победителя из списка участников.
 */
export function pickRaffleWinner(
  participants: RaffleParticipant[],
  random: () => number = Math.random
): RaffleParticipant | null {
  if (participants.length === 0) {
    return null;
  }

  const winnerIndex = Math.min(participants.length - 1, Math.floor(random() * participants.length));
  return participants[winnerIndex];
}

function buildWheelGradient(participants: RaffleParticipant[]): string {
  if (participants.length === 0) {
    return "conic-gradient(oklch(94% 0.014 58), oklch(94% 0.014 58))";
  }

  const slice = 100 / participants.length;
  const colorStops = participants.map((participant, index) => {
    const start = index * slice;
    const end = (index + 1) * slice;
    return `${RAFFLE_COLORS[index % RAFFLE_COLORS.length]} ${start}% ${end}%`;
  });

  return `conic-gradient(from -90deg, ${colorStops.join(", ")})`;
}

/**
 * Интерактивный блок розыгрыша случайного гостя среди участников альбома.
 */
export const GuestRandomizer = memo(function GuestRandomizer({ fallbackGuests }: Props) {
  const [ratingGuests, setRatingGuests] = useState<AlbumContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [winner, setWinner] = useState<RaffleParticipant | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const spinCountRef = useRef(0);
  const winnerTimerRef = useRef<number | null>(null);

  const sourceGuests = ratingGuests.length > 0 ? ratingGuests : fallbackGuests;
  const participants = useMemo(() => buildRaffleParticipants(sourceGuests), [sourceGuests]);
  const wheelGradient = useMemo(() => buildWheelGradient(participants), [participants]);
  const topParticipants = useMemo(() => participants.slice(0, 5), [participants]);
  const winnerAvatarUrl = winner ? guestAvatarUrl(winner.avatarIndex, winner.slug) : "";

  const wheelStyle: RaffleWheelStyle = {
    "--raffle-wheel-gradient": wheelGradient,
    "--raffle-wheel-rotation": `${wheelRotation}deg`
  };

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const rating = await getRating();
      setRatingGuests(rating.guests);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить участников.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    return () => {
      if (winnerTimerRef.current !== null) {
        window.clearTimeout(winnerTimerRef.current);
      }
    };
  }, []);

  const startRaffle = useCallback(() => {
    const nextWinner = pickRaffleWinner(participants);
    if (!nextWinner) {
      return;
    }

    const winnerIndex = participants.findIndex((participant) => participant.slug === nextWinner.slug);
    const segmentSize = 360 / participants.length;
    const winnerCenter = winnerIndex * segmentSize + segmentSize / 2;

    if (winnerTimerRef.current !== null) {
      window.clearTimeout(winnerTimerRef.current);
    }

    spinCountRef.current += 1;
    setWinner(null);
    setIsSpinning(true);
    setWheelRotation(spinCountRef.current * 1440 + 360 - winnerCenter);
    winnerTimerRef.current = window.setTimeout(() => {
      setWinner(nextWinner);
      setIsSpinning(false);
    }, SPIN_DURATION_MS);
  }, [participants]);

  const refreshParticipants = useCallback(() => {
    void loadParticipants();
  }, [loadParticipants]);

  return (
    <section className="raffle-section" aria-labelledby="raffle-title">
      <div className="raffle-copy">
        <span className="raffle-kicker">
          <Gift size={18} />
          Розыгрыш
        </span>
        <h2 id="raffle-title">Случайный победитель</h2>
        <p>Крутим колесо среди гостей, которые уже добавили хотя бы одно фото.</p>
        <div className="raffle-actions">
          <button className="raffle-spin-button" type="button" disabled={participants.length === 0 || isSpinning} onClick={startRaffle}>
            <Trophy size={21} />
            <span>{isSpinning ? "Крутим..." : "Запустить колесо"}</span>
          </button>
          <button className="raffle-refresh-button" type="button" title="Обновить участников" disabled={loading || isSpinning} onClick={refreshParticipants}>
            <RefreshCw size={19} />
          </button>
        </div>
        <div className="raffle-status" aria-live="polite">
          {winner ? (
            <>
              Победитель: <strong>{winner.nickname}</strong>
            </>
          ) : participants.length > 0 ? (
            `${participants.length} участников в розыгрыше`
          ) : loading ? (
            "Собираем участников..."
          ) : (
            "Розыгрыш появится после первых загруженных фото."
          )}
        </div>
        {error && participants.length === 0 && <p className="raffle-error">{error}</p>}
      </div>

      <div className="raffle-wheel-area" aria-hidden="true">
        <div className="raffle-pointer" />
        <div className={`raffle-wheel${isSpinning ? " is-spinning" : ""}`} style={wheelStyle}>
          <div className="raffle-wheel-center">
            {winner ? (
              <img src={winnerAvatarUrl} alt="" />
            ) : (
              <span>{participants.length}</span>
            )}
            <small>{winner ? winner.nickname : "гостей"}</small>
          </div>
        </div>
      </div>

      <div className="raffle-participants" aria-label="Участники розыгрыша">
        <div className="raffle-participants-head">
          <UsersRound size={18} />
          <span>Участники</span>
        </div>
        {topParticipants.length > 0 ? (
          topParticipants.map((participant) => (
            <span className="raffle-chip" key={participant.slug}>
              <span>{participant.nickname}</span>
              <strong>{participant.photoCount}</strong>
            </span>
          ))
        ) : (
          <span className="raffle-empty-chip">Ждем первые фото</span>
        )}
      </div>
    </section>
  );
});
