const DEFAULT_UPLOAD_LIMIT_MB = 300;
const uploadLimitBytes = positiveIntFromEnv(import.meta.env.VITE_MAX_UPLOAD_BYTES, DEFAULT_UPLOAD_LIMIT_MB * 1024 * 1024);

function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const appConfig = {
  albumTitle: import.meta.env.VITE_ALBUM_TITLE || "Свадебный альбом",
  uploadLimitBytes,
  uploadLimitMb: Math.floor(uploadLimitBytes / 1024 / 1024),
  shareTitle: import.meta.env.VITE_SHARE_TITLE || "Свадебный альбом",
  deletePhotoConfirm: (number: number) => `Удалить файл #${number.toString().padStart(3, "0")}?`
};
