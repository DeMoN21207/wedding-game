import type { RatingGuest } from "../../api/client";

export type GiveawayParticipant = {
  nickname: string;
  slug: string;
  avatarIndex: number;
  photoCount: number;
  rank: number;
};

export type GiveawayWheelSlot = GiveawayParticipant & {
  slotId: string;
};

type WinnerRotationInput = {
  participantCount: number;
  spinIndex: number;
  winnerIndex: number;
};

/**
 * Собирает участников розыгрыша из рейтинга: шанс не зависит от количества фото.
 */
export function buildGiveawayParticipants(guests: RatingGuest[]): GiveawayParticipant[] {
  return guests.map((guest) => ({
    nickname: guest.nickname,
    slug: guest.slug,
    avatarIndex: guest.avatar_index,
    photoCount: guest.active_photo_count,
    rank: guest.rank
  }));
}

/**
 * Возвращает одного случайного победителя с равным шансом для каждого участника.
 */
export function pickGiveawayWinner(
  participants: GiveawayParticipant[],
  random: () => number = Math.random
): GiveawayParticipant | null {
  if (participants.length === 0) {
    return null;
  }

  const index = Math.min(participants.length - 1, Math.floor(random() * participants.length));
  return participants[index];
}

/**
 * Создает визуальные слоты колеса: один участник всегда получает ровно одну долю.
 */
export function buildGiveawayWheelSlots(participants: GiveawayParticipant[]): GiveawayWheelSlot[] {
  return participants.map((participant, index) => {
    return {
      ...participant,
      slotId: `${participant.slug}-${index}`
    };
  });
}

/**
 * Считает, сколько визуальных долей колеса получил каждый участник.
 */
export function countGiveawayWheelSlots(wheelSlots: GiveawayWheelSlot[]): Map<string, number> {
  return wheelSlots.reduce((counts, slot) => {
    counts.set(slot.slug, (counts.get(slot.slug) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

/**
 * Считает поворот колеса так, чтобы центр сектора победителя остановился под верхним указателем.
 */
export function getWinnerRotation({ participantCount, spinIndex, winnerIndex }: WinnerRotationInput): number {
  if (participantCount <= 0) {
    return 0;
  }

  const segmentAngle = 360 / participantCount;
  const winnerCenterOffset = winnerIndex * segmentAngle + segmentAngle / 2;
  return spinIndex * 1440 - winnerCenterOffset;
}
