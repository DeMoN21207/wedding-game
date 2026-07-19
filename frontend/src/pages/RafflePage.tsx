import { PartyPopper, RefreshCw, RotateCcw, Star, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type TransitionEvent } from "react";
import { getRating, type Rating } from "../api/client";
import giftIcon from "../assets/giveaway/gift-reference.png";
import playWhiteIcon from "../assets/giveaway/play-white.svg";
import searchIcon from "../assets/giveaway/search.svg";
import usersIcon from "../assets/giveaway/users.svg";
import wheelPointerIcon from "../assets/giveaway/wheel-pointer.svg";
import winnerSideRibbon from "../assets/giveaway/winner/winner-side-ribbon.png";
import winnerSparkle from "../assets/giveaway/winner/winner-sparkle.png";
import winnerStar from "../assets/giveaway/winner/winner-star.png";
import { GuestAvatar } from "../components/GuestAvatar";
import { HomeLink } from "../components/HomeLink";
import {
  buildGiveawayParticipants,
  buildGiveawayWheelSlots,
  getWinnerRotation,
  pickGiveawayWinner,
  type GiveawayParticipant,
  type GiveawayWheelSlot
} from "../features/raffle/raffleWheel";
import { guestAvatarUrl } from "../utils/guestAvatars";

const EMPTY_RATING: Rating = {
  total_photos: 0,
  total_guests: 0,
  guests: []
};

const WHEEL_COLORS = [
  "oklch(70% 0.17 24)",
  "oklch(74% 0.13 350)",
  "oklch(73% 0.12 303)",
  "oklch(72% 0.12 260)",
  "oklch(74% 0.11 225)",
  "oklch(75% 0.12 190)",
  "oklch(75% 0.12 155)",
  "oklch(72% 0.12 128)",
  "oklch(78% 0.13 92)",
  "oklch(82% 0.15 76)",
  "oklch(78% 0.16 55)",
  "oklch(72% 0.17 36)"
];

const WHEEL_CENTER = 300;
const WHEEL_OUTER_RADIUS = 282;
const WHEEL_INNER_RADIUS = 102;
const WHEEL_AVATAR_GAP = 12;
const WHEEL_TEXT_GAP = 9;
const WHEEL_LABEL_LINE_HEIGHT = 1.08;

type WheelSegment = {
  avatarRadius: number;
  color: string;
  avatarUrl: string;
  iconX: number;
  labelX: number;
  labelLines: string[];
  path: string;
  textAnchor: "start" | "end";
  textRotation: number;
  x: number;
  y: number;
};

type ParticipantLegendItem = GiveawayParticipant & {
  color: string;
};

type WheelGroupStyle = CSSProperties & {
  "--giveaway-wheel-rotation": string;
};

type ParticipantRowStyle = CSSProperties & {
  "--giveaway-participant-color": string;
};

type ResultAssetStyle = CSSProperties & {
  "--result-x"?: string;
  "--result-y"?: string;
  "--result-rotate"?: string;
  "--result-scale"?: string;
};

function getWheelColor(index: number): string {
  return WHEEL_COLORS[index % WHEEL_COLORS.length];
}

function polarToCartesian(radius: number, angle: number): { x: number; y: number } {
  const angleInRadians = (angle * Math.PI) / 180;
  return {
    x: WHEEL_CENTER + radius * Math.cos(angleInRadians),
    y: WHEEL_CENTER + radius * Math.sin(angleInRadians)
  };
}

function describeWheelSlice(startAngle: number, endAngle: number): string {
  const outerStart = polarToCartesian(WHEEL_OUTER_RADIUS, startAngle);
  const outerEnd = polarToCartesian(WHEEL_OUTER_RADIUS, endAngle);
  const innerStart = polarToCartesian(WHEEL_INNER_RADIUS, startAngle);
  const innerEnd = polarToCartesian(WHEEL_INNER_RADIUS, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${WHEEL_OUTER_RADIUS} ${WHEEL_OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${WHEEL_INNER_RADIUS} ${WHEEL_INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
}

function shortenWheelWord(word: string, maxLength: number): string {
  return word.length > maxLength ? `${word.slice(0, maxLength - 1)}.` : word;
}

function splitWheelName(nickname: string, participantCount: number): string[] {
  const compactName = nickname.trim().replace(/\s+/g, " ");
  const hasWideLetters = /[^\x00-\x7F]/.test(compactName);
  const maxSingleLineLength = hasWideLetters ? (participantCount > 12 ? 7 : 8) : (participantCount > 20 ? 7 : participantCount > 12 ? 8 : 9);
  const maxLineLength = hasWideLetters ? (participantCount > 12 ? 5 : 6) : (participantCount > 20 ? 6 : participantCount > 12 ? 7 : 8);

  if (compactName.length <= maxSingleLineLength) {
    return [compactName];
  }

  const readableParts = compactName
    .replace(/[_-]+/g, " ")
    .replace(/([\p{Ll}])([\p{Lu}\d])/gu, "$1 $2")
    .split(" ")
    .filter(Boolean);

  if (readableParts.length > 1) {
    const firstLine = shortenWheelWord(readableParts[0], maxLineLength);
    const secondLine = shortenWheelWord(readableParts.slice(1).join(""), maxLineLength);
    return [firstLine, secondLine];
  }

  return [
    compactName.slice(0, maxLineLength),
    shortenWheelWord(compactName.slice(maxLineLength), maxLineLength)
  ];
}

function normalizedAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function isUpsideDownAngle(angle: number): boolean {
  const normalized = normalizedAngle(angle);
  return normalized > 90 && normalized < 270;
}

function buildWheelSegments(wheelSlots: GiveawayWheelSlot[], participantColors: Map<string, string>, settledWheelRotation: number): WheelSegment[] {
  if (wheelSlots.length === 0) {
    return [];
  }

  const segmentAngle = 360 / wheelSlots.length;
  const textRadius = getWheelTextRadius(wheelSlots.length);
  const avatarRadius = getWheelAvatarRadius(wheelSlots.length);
  const labelGap = avatarRadius + WHEEL_AVATAR_GAP;
  const textInset = avatarRadius + WHEEL_TEXT_GAP;

  return wheelSlots.map((participant, index) => {
    const startAngle = -90 + index * segmentAngle;
    const endAngle = startAngle + segmentAngle;
    const centerAngle = startAngle + segmentAngle / 2;
    const textPosition = polarToCartesian(textRadius, centerAngle);
    const screenCenterAngle = centerAngle + settledWheelRotation;
    const shouldFlipLabel = isUpsideDownAngle(screenCenterAngle);

    return {
      avatarRadius,
      color: participantColors.get(participant.slug) ?? getWheelColor(index),
      avatarUrl: guestAvatarUrl(participant.avatarIndex, participant.slug),
      iconX: textPosition.x + (shouldFlipLabel ? -labelGap : labelGap),
      labelX: textPosition.x + (shouldFlipLabel ? -labelGap + textInset : labelGap - textInset),
      labelLines: splitWheelName(participant.nickname, wheelSlots.length),
      path: describeWheelSlice(startAngle, endAngle),
      textAnchor: shouldFlipLabel ? "start" : "end",
      textRotation: shouldFlipLabel ? centerAngle + 180 : centerAngle,
      x: textPosition.x,
      y: textPosition.y
    };
  });
}

function getWheelFontSize(participantCount: number): number {
  if (participantCount > 44) {
    return 11;
  }
  if (participantCount > 30) {
    return 12;
  }
  if (participantCount > 20) {
    return 14;
  }
  if (participantCount > 12) {
    return 16;
  }
  if (participantCount > 8) {
    return 20;
  }
  return 24;
}

function getWheelAvatarRadius(participantCount: number): number {
  if (participantCount > 44) {
    return 9;
  }
  if (participantCount > 30) {
    return 10;
  }
  if (participantCount > 20) {
    return 12;
  }
  if (participantCount > 12) {
    return 14;
  }
  if (participantCount > 8) {
    return 18;
  }
  return 23;
}

function getWheelTextRadius(participantCount: number): number {
  if (participantCount > 30) {
    return 202;
  }
  if (participantCount > 12) {
    return 208;
  }
  return 214;
}

function buildParticipantLegend(participants: GiveawayParticipant[]): ParticipantLegendItem[] {
  return participants.map((participant, index) => ({
    ...participant,
    color: getWheelColor(index)
  }));
}

const WinnerResultModal = memo(function WinnerResultModal({
  winner,
  onClose,
  onRepeat
}: {
  winner: GiveawayParticipant;
  onClose: () => void;
  onRepeat: () => void;
}) {
  const resultAssets: Array<{ alt: string; className: string; src: string; style: ResultAssetStyle }> = [
    { alt: "", className: "is-star is-one", src: winnerStar, style: { "--result-rotate": "14deg", "--result-scale": "0.22" } },
    { alt: "", className: "is-star is-two", src: winnerStar, style: { "--result-rotate": "-20deg", "--result-scale": "0.16" } },
    { alt: "", className: "is-sparkle is-one", src: winnerSparkle, style: { "--result-rotate": "22deg", "--result-scale": "0.23" } },
    { alt: "", className: "is-sparkle is-two", src: winnerSparkle, style: { "--result-rotate": "-18deg", "--result-scale": "0.18" } }
  ];

  return (
    <div className="giveaway-result-backdrop">
      <section className="giveaway-result-dialog" role="dialog" aria-modal="true" aria-labelledby="giveaway-result-title">
        <button className="giveaway-result-close" type="button" aria-label="Закрыть результат" onClick={onClose}>
          <X size={30} />
        </button>

        <div className="giveaway-result-decor" aria-hidden="true">
          {resultAssets.map((asset, index) => (
            <img className={`giveaway-result-asset ${asset.className}`} key={`${asset.className}-${index}`} src={asset.src} alt={asset.alt} style={asset.style} />
          ))}
        </div>

        <div className="giveaway-result-pill">
          <img src={giftIcon} alt="" />
          <span>Результаты розыгрыша</span>
        </div>

        <h2 className="giveaway-result-title" id="giveaway-result-title">
          У нас есть <span>победитель!</span>
        </h2>

        <div className="giveaway-result-card">
          <img className="giveaway-result-side-ribbon is-left" src={winnerSideRibbon} alt="" />
          <img className="giveaway-result-side-ribbon is-right" src={winnerSideRibbon} alt="" />
          <GuestAvatar avatarIndex={winner.avatarIndex} className="giveaway-result-avatar" nickname={winner.nickname} seed={winner.slug} />
          <span className="giveaway-result-ribbon">
            <Star size={24} fill="currentColor" />
            <span>Победитель</span>
            <Star size={24} fill="currentColor" />
          </span>
          <strong>{winner.nickname}</strong>
        </div>

        <p className="giveaway-result-copy">
          Победитель выбран.
        </p>

        <div className="giveaway-result-actions">
          <button className="giveaway-result-button is-primary" type="button" onClick={onClose}>
            <PartyPopper size={30} />
            <span>Супер</span>
          </button>
          <button className="giveaway-result-button is-secondary" type="button" onClick={onRepeat}>
            <RotateCcw size={31} />
            <span>Провести заново</span>
          </button>
        </div>
      </section>
    </div>
  );
});

export function RafflePage() {
  const [rating, setRating] = useState<Rating>(EMPTY_RATING);
  const [winner, setWinner] = useState<GiveawayParticipant | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [settledWheelRotation, setSettledWheelRotation] = useState(0);
  const spinIndexRef = useRef(0);
  const pendingWinnerRef = useRef<GiveawayParticipant | null>(null);

  const participants = useMemo(() => buildGiveawayParticipants(rating.guests), [rating.guests]);
  const wheelSlots = useMemo(() => buildGiveawayWheelSlots(participants), [participants]);
  const participantLegend = useMemo(() => buildParticipantLegend(participants), [participants]);
  const participantColors = useMemo(
    () => new Map(participantLegend.map((participant) => [participant.slug, participant.color])),
    [participantLegend]
  );
  const wheelSegments = useMemo(() => buildWheelSegments(wheelSlots, participantColors, settledWheelRotation), [participantColors, settledWheelRotation, wheelSlots]);
  const filteredParticipants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return participantLegend;
    }
    return participantLegend.filter((participant) => participant.nickname.toLowerCase().includes(normalizedSearch));
  }, [participantLegend, search]);
  const visibleParticipants = filteredParticipants;
  const wheelFontSize = getWheelFontSize(wheelSlots.length);
  const showWheelAvatars = wheelSlots.length <= 48;
  const wheelStyle: WheelGroupStyle = {
    "--giveaway-wheel-rotation": `${wheelRotation}deg`
  };

  const loadRating = useCallback(async () => {
    setLoading(true);
    try {
      const nextRating = await getRating();
      setRating(nextRating);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть участников.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRating();
  }, [loadRating]);

  const startRaffle = useCallback(() => {
    const nextWinner = pickGiveawayWinner(participants);
    if (!nextWinner) {
      return;
    }

    const matchingWinnerSlots = wheelSlots
      .map((slot, index) => ({ index, slot }))
      .filter(({ slot }) => slot.slug === nextWinner.slug);
    const winnerIndex = matchingWinnerSlots[0]?.index ?? -1;
    if (winnerIndex < 0) {
      return;
    }

    spinIndexRef.current += 1;
    pendingWinnerRef.current = nextWinner;
    setWinner(null);
    setIsSpinning(true);
    setWheelRotation(getWinnerRotation({
      participantCount: wheelSlots.length,
      spinIndex: spinIndexRef.current,
      winnerIndex
    }));
  }, [participants, wheelSlots]);

  const handleWheelTransitionEnd = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || event.propertyName !== "transform" || !isSpinning) {
      return;
    }

    setSettledWheelRotation(wheelRotation);
    setWinner(pendingWinnerRef.current);
    pendingWinnerRef.current = null;
    setIsSpinning(false);
  }, [isSpinning, wheelRotation]);

  const closeWinner = useCallback(() => {
    setWinner(null);
  }, []);

  const repeatRaffle = useCallback(() => {
    setWinner(null);
    startRaffle();
  }, [startRaffle]);

  const refreshRating = useCallback(() => {
    void loadRating();
  }, [loadRating]);

  useEffect(() => {
    if (!winner || isSpinning) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWinner(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSpinning, winner]);

  return (
    <main className="giveaway-page">
      <nav className="page-home-nav giveaway-home-nav" aria-label="Навигация страницы">
        <HomeLink />
      </nav>
      <section className="giveaway-hero">
        <div className="giveaway-wheel-column" aria-live="polite">
          <img className="giveaway-pointer" src={wheelPointerIcon} alt="" />
          <div className={`giveaway-wheel-shell${isSpinning ? " is-spinning" : ""}`}>
            <div className="giveaway-wheel-rotor" style={wheelStyle} onTransitionEnd={handleWheelTransitionEnd}>
              <svg className="giveaway-wheel-svg" viewBox="0 0 600 600" role="img" aria-label={`Колесо розыгрыша: ${participants.length} участников`}>
                <circle className="giveaway-wheel-backdrop" cx="300" cy="300" r="294" />
                {wheelSegments.length > 0 ? (
                  wheelSegments.map((segment, index) => (
                    <g key={wheelSlots[index]?.slotId ?? `${index}-segment`}>
                      <path d={segment.path} fill={segment.color} />
                      <path d={segment.path} className="giveaway-wheel-divider" />
                      <g transform={`rotate(${segment.textRotation} ${segment.x} ${segment.y})`}>
                        {showWheelAvatars && segment.avatarUrl && (
                          <>
                            <circle
                              className="giveaway-wheel-avatar-backdrop"
                              cx={segment.iconX}
                              cy={segment.y}
                              r={segment.avatarRadius + 2}
                            />
                            <image
                              className="giveaway-wheel-avatar"
                              href={segment.avatarUrl}
                              height={segment.avatarRadius * 2}
                              width={segment.avatarRadius * 2}
                              x={segment.iconX - segment.avatarRadius}
                              y={segment.y - segment.avatarRadius}
                            />
                          </>
                        )}
                        <text
                          className="giveaway-wheel-label"
                          dominantBaseline="middle"
                          style={{ fontSize: wheelFontSize }}
                          textAnchor={showWheelAvatars ? segment.textAnchor : "middle"}
                          x={showWheelAvatars ? segment.labelX : segment.x}
                          y={segment.y}
                        >
                          {segment.labelLines.map((line, lineIndex) => (
                            <tspan
                              dy={segment.labelLines.length > 1 ? (lineIndex === 0 ? "-0.32em" : `${WHEEL_LABEL_LINE_HEIGHT}em`) : 0}
                              key={`${line}-${lineIndex}`}
                              x={showWheelAvatars ? segment.labelX : segment.x}
                            >
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    </g>
                  ))
                ) : (
                  <circle cx="300" cy="300" r="282" fill="oklch(94% 0.014 58)" />
                )}
              </svg>
            </div>
            <svg className="giveaway-wheel-overlay" viewBox="0 0 600 600" aria-hidden="true">
              <defs>
                <radialGradient id="giveaway-wheel-light-gradient" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="oklch(100% 0.012 78)" />
                  <stop offset="58%" stopColor="oklch(99% 0.034 76)" />
                  <stop offset="100%" stopColor="oklch(89% 0.105 74)" stopOpacity="0.32" />
                </radialGradient>
              </defs>
              <g className="giveaway-wheel-lights">
                {Array.from({ length: 32 }).map((_, index) => {
                  const angle = (index / 32) * 360;
                  const point = polarToCartesian(286, angle);
                  return <circle className="giveaway-wheel-light" cx={point.x} cy={point.y} fill="url(#giveaway-wheel-light-gradient)" key={index} r="5.5" />;
                })}
              </g>
              <circle className="giveaway-wheel-center" cx="300" cy="300" r="86" />
            </svg>
            <button
              className="giveaway-center-button"
              type="button"
              aria-label={isSpinning ? "Колесо крутится" : "Запустить колесо"}
              disabled={participants.length === 0 || isSpinning}
              onClick={startRaffle}
            >
              <img src={playWhiteIcon} alt="" />
            </button>
          </div>
          {isSpinning && (
            <div className="giveaway-winner">
              <span>Выбираем</span>
              <strong>Колесо выбирает...</strong>
            </div>
          )}
        </div>

        <aside className="giveaway-side-column">
          <section
            className={`giveaway-participants-card${visibleParticipants.length > 20 ? " is-dense-list" : ""}`}
            aria-labelledby="giveaway-participants-title"
          >
            <div className="giveaway-card-title">
              <img src={usersIcon} alt="" />
              <span className="giveaway-card-heading">
                <h2 id="giveaway-participants-title">Участники</h2>
              </span>
              <dl className="giveaway-dashboard-metrics" aria-label="Статистика участников">
                <div>
                  <dt>Гостей</dt>
                  <dd>{participants.length}</dd>
                </div>
                <div>
                  <dt>Фото</dt>
                  <dd>{rating.total_photos}</dd>
                </div>
              </dl>
              <button className="giveaway-refresh" type="button" title="Обновить участников" disabled={loading || isSpinning} onClick={refreshRating}>
                <RefreshCw size={18} />
              </button>
            </div>

            <label className="giveaway-search">
              <img src={searchIcon} alt="" />
              <input value={search} placeholder="Поиск участника..." onChange={(event) => setSearch(event.target.value)} />
            </label>

            {error && <p className="giveaway-error">{error}</p>}

            <div className="giveaway-participant-list">
              {visibleParticipants.map((participant) => {
                const rowStyle: ParticipantRowStyle = {
                  "--giveaway-participant-color": participant.color
                };

                return (
                  <article className="giveaway-participant-row" key={participant.slug} style={rowStyle}>
                    <GuestAvatar avatarIndex={participant.avatarIndex} className="giveaway-color-avatar" nickname={participant.nickname} seed={participant.slug} />
                    <span className="giveaway-participant-copy">
                      <strong>{participant.nickname}</strong>
                      <small>{participant.photoCount > 0 ? `${participant.photoCount} фото` : "пока без фото"}</small>
                    </span>
                  </article>
                );
              })}
              {!loading && visibleParticipants.length === 0 && (
                <div className="empty-state compact">Участники появятся после первого входа гостей.</div>
              )}
              {loading && visibleParticipants.length === 0 && (
                <div className="empty-state compact">Загружаем участников...</div>
              )}
            </div>
          </section>
        </aside>
      </section>

      {winner && !isSpinning && (
        <WinnerResultModal winner={winner} onClose={closeWinner} onRepeat={repeatRaffle} />
      )}
    </main>
  );
}
