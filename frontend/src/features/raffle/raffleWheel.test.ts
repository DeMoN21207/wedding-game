import { describe, expect, it } from "vitest";
import type { RatingGuest } from "../../api/client";
import {
  buildGiveawayParticipants,
  buildGiveawayWheelSlots,
  countGiveawayWheelSlots,
  getWinnerRotation,
  pickGiveawayWinner
} from "./raffleWheel";

const guests: RatingGuest[] = [
  {
    rank: 1,
    nickname: "Катя",
    slug: "katya",
    avatar_index: 1,
    active_photo_count: 4,
    contribution_percent: 40,
    created_at: "2026-06-17T10:00:00Z"
  },
  {
    rank: 2,
    nickname: "Андрей",
    slug: "andrey",
    avatar_index: 2,
    active_photo_count: 0,
    contribution_percent: 0,
    created_at: "2026-06-17T10:01:00Z"
  },
  {
    rank: 3,
    nickname: "Маша",
    slug: "masha",
    avatar_index: 3,
    active_photo_count: 2,
    contribution_percent: 20,
    created_at: "2026-06-17T10:02:00Z"
  }
];

describe("raffleWheel", () => {
  it("добавляет в розыгрыш всех зарегистрированных гостей, даже без фото", () => {
    expect(buildGiveawayParticipants(guests)).toEqual([
      { nickname: "Катя", slug: "katya", avatarIndex: 1, photoCount: 4, rank: 1 },
      { nickname: "Андрей", slug: "andrey", avatarIndex: 2, photoCount: 0, rank: 2 },
      { nickname: "Маша", slug: "masha", avatarIndex: 3, photoCount: 2, rank: 3 }
    ]);
  });

  it("выбирает победителя равномерно по позиции, а не по количеству фото", () => {
    const participants = buildGiveawayParticipants(guests);

    expect(pickGiveawayWinner(participants, () => 0.5)).toEqual({
      nickname: "Андрей",
      slug: "andrey",
      avatarIndex: 2,
      photoCount: 0,
      rank: 2
    });
  });

  it("пересчитывает финальный угол при другом количестве участников", () => {
    expect(getWinnerRotation({ participantCount: 3, spinIndex: 1, winnerIndex: 1 })).toBe(1260);
    expect(getWinnerRotation({ participantCount: 6, spinIndex: 1, winnerIndex: 1 })).toBe(1350);
  });

  it("создает ровно одну визуальную долю на каждого участника", () => {
    const slots = buildGiveawayWheelSlots(buildGiveawayParticipants(guests));

    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => slot.slug)).toEqual(["katya", "andrey", "masha"]);
  });

  it("считает количество долей для легенды участников", () => {
    const slots = buildGiveawayWheelSlots(buildGiveawayParticipants(guests));

    expect(Object.fromEntries(countGiveawayWheelSlots(slots))).toEqual({
      andrey: 1,
      katya: 1,
      masha: 1
    });
  });
});
