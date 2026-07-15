const avatarModules = import.meta.glob("../assets/avatars/avatar-*.jpg", {
  eager: true,
  import: "default",
  query: "?url"
}) as Record<string, string>;

const avatarUrls = Object.entries(avatarModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, url]) => url);

export const GUEST_AVATAR_COUNT = avatarUrls.length;

/**
 * Стабильно превращает slug или ник в индекс аватара, если backend еще не прислал avatar_index.
 */
function fallbackAvatarIndex(seed: string): number {
  if (GUEST_AVATAR_COUNT === 0) {
    return 0;
  }

  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % GUEST_AVATAR_COUNT) + 1;
}

/**
 * Нормализует номер аватара под реальное количество ассетов.
 */
export function normalizeAvatarIndex(avatarIndex: number | null | undefined, fallbackSeed = ""): number {
  if (GUEST_AVATAR_COUNT === 0) {
    return 0;
  }
  if (typeof avatarIndex === "number" && Number.isFinite(avatarIndex) && avatarIndex > 0) {
    return ((Math.floor(avatarIndex) - 1) % GUEST_AVATAR_COUNT) + 1;
  }
  return fallbackAvatarIndex(fallbackSeed);
}

/**
 * Возвращает URL картинки гостевого аватара.
 */
export function guestAvatarUrl(avatarIndex: number | null | undefined, fallbackSeed = ""): string {
  const normalizedIndex = normalizeAvatarIndex(avatarIndex, fallbackSeed);
  return normalizedIndex > 0 ? avatarUrls[normalizedIndex - 1] : "";
}
