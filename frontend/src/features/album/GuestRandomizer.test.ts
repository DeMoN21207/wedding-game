import { describe, expect, it } from "vitest";
import type { AlbumContributor } from "../../api/client";
import { buildRaffleParticipants, pickRaffleWinner } from "./GuestRandomizer";

const contributors: AlbumContributor[] = [
  {
    nickname: "Катя",
    slug: "katya",
    avatar_index: 1,
    active_photo_count: 4,
    created_at: "2026-06-17T10:00:00Z"
  },
  {
    nickname: "Гость без фото",
    slug: "empty",
    avatar_index: 2,
    active_photo_count: 0,
    created_at: "2026-06-17T10:01:00Z"
  },
  {
    nickname: "Андрей",
    slug: "andrey",
    avatar_index: 3,
    active_photo_count: 2,
    created_at: "2026-06-17T10:02:00Z"
  }
];

describe("GuestRandomizer", () => {
  it("оставляет в розыгрыше только гостей с фото", () => {
    expect(buildRaffleParticipants(contributors)).toEqual([
      { nickname: "Катя", slug: "katya", avatarIndex: 1, photoCount: 4 },
      { nickname: "Андрей", slug: "andrey", avatarIndex: 3, photoCount: 2 }
    ]);
  });

  it("выбирает победителя по переданному random-значению", () => {
    const participants = buildRaffleParticipants(contributors);

    expect(pickRaffleWinner(participants, () => 0.76)).toEqual({
      nickname: "Андрей",
      slug: "andrey",
      avatarIndex: 3,
      photoCount: 2
    });
  });
});
