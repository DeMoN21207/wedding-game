const GUEST_TOKEN_KEY = "weddingPhotos.guestToken";
const GUEST_NICKNAME_KEY = "weddingPhotos.guestNickname";

const memoryStore = new Map<string, string>();

function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memoryStore.get(key) ?? null;
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeItem(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // В приватных режимах мобильные браузеры иногда показывают localStorage, но запрещают запись.
  }
}

function removeItem(key: string): void {
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Даже если постоянное хранилище заблокировано, временный fallback уже очищен выше.
  }
}

export function getGuestToken(): string | null {
  return readItem(GUEST_TOKEN_KEY);
}

export function setGuestToken(token: string): void {
  writeItem(GUEST_TOKEN_KEY, token);
}

export function clearGuestToken(): void {
  removeItem(GUEST_TOKEN_KEY);
}

export function getGuestNickname(): string | null {
  return readItem(GUEST_NICKNAME_KEY);
}

export function setGuestNickname(nickname: string): void {
  writeItem(GUEST_NICKNAME_KEY, nickname);
}

export function clearGuestSession(): void {
  clearGuestToken();
  removeItem(GUEST_NICKNAME_KEY);
}
