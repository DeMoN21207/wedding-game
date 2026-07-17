import { clearGuestToken, getGuestToken } from "../store/session";

export type ApiError = {
  code: string;
  message: string;
};

export type GuestCreated = {
  guest_token: string;
  nickname: string;
  slug: string;
  avatar_index: number;
};

export type Me = {
  nickname: string;
  slug: string;
  avatar_index: number;
  active_photo_count: number;
};

export type MediaType = "image" | "video";

export type Photo = {
  id: number;
  number: number;
  media_type: MediaType;
  preview_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  status: "active" | "trashed";
};

export type AlbumPhoto = {
  id: number;
  number: number;
  media_type: MediaType;
  preview_url: string | null;
  thumbnail_url: string | null;
  guest_nickname: string;
  guest_slug: string;
  created_at: string;
};

export type AlbumContributor = {
  nickname: string;
  slug: string;
  avatar_index: number;
  active_photo_count: number;
  created_at: string;
};

export type AlbumDashboard = {
  name: string;
  qr_url: string;
  total_photos: number;
  total_guests: number;
  total_images: number;
  total_videos: number;
  total_size_bytes: number;
  recent_photos: AlbumPhoto[];
  top_guests: AlbumContributor[];
};

export type RatingGuest = AlbumContributor & {
  rank: number;
  contribution_percent: number;
};

export type Rating = {
  total_photos: number;
  total_guests: number;
  guests: RatingGuest[];
};

export type GalleryPhoto = AlbumPhoto & {
  download_url: string;
};

export type GalleryPhotos = {
  photos: GalleryPhoto[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type AdminGuest = {
  id: number;
  nickname: string;
  slug: string;
  avatar_index: number;
  active_photo_count: number;
  trashed_photo_count: number;
  created_at: string;
};

export type AdminPhoto = Photo & {
  guest_id: number;
  guest_nickname: string;
  original_url: string;
  size_bytes: number;
  trashed_at: string | null;
};

export type AdminQr = {
  url: string;
  qr_png_base64: string;
};

export type AdminStorage = {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  reserve_bytes: number;
  max_upload_bytes: number;
  estimated_max_video_uploads: number;
  is_low_space: boolean;
  warning: string | null;
};

export type AdminArchiveStatus = "active" | "trashed" | "all";

export class RequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.status = status;
    this.code = error.code;
  }
}

export function appPath(path: string): string {
  if (/^(?:https?:|data:|blob:)/.test(path)) {
    return path;
  }
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    return body.detail ?? { code: "ERROR", message: "Что-то пошло не так." };
  } catch {
    return { code: "ERROR", message: "Что-то пошло не так." };
  }
}

async function parseJson<T>(response: Response, path: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    const looksLikeHtml = text.trimStart().startsWith("<");
    throw new RequestError(response.status, {
      code: "BAD_API_RESPONSE",
      message: looksLikeHtml
        ? "API вернул HTML вместо данных. Перезапусти backend и открой приложение через его адрес."
        : `API вернул неожиданный ответ для ${path}.`
    });
  }
  return response.json() as Promise<T>;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getGuestToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(appPath(path), {
    ...options,
    headers,
    credentials: "same-origin"
  });

  if (response.status === 401 && path.startsWith("/api/me")) {
    clearGuestToken();
  }
  if (!response.ok) {
    throw new RequestError(response.status, await parseError(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return parseJson<T>(response, path);
}

export function getAlbum(): Promise<AlbumDashboard> {
  return api<AlbumDashboard>("/api/album");
}

export function getGalleryPhotos(limit = 60, offset = 0): Promise<GalleryPhotos> {
  return api<GalleryPhotos>(`/api/gallery/photos?limit=${limit}&offset=${offset}`);
}

export function getRating(): Promise<Rating> {
  return api<Rating>("/api/rating");
}

export function registerGuest(nickname: string): Promise<GuestCreated> {
  return api<GuestCreated>("/api/guests", {
    method: "POST",
    body: JSON.stringify({ nickname })
  });
}

export function getMe(): Promise<Me> {
  return api<Me>("/api/me");
}

export function getMyPhotos(): Promise<Photo[]> {
  return api<Photo[]>("/api/me/photos");
}

export function deleteMyPhoto(id: number): Promise<void> {
  return api<void>(`/api/photos/${id}`, { method: "DELETE" });
}

export function loginAdmin(password: string): Promise<void> {
  return api<void>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function logoutAdmin(): Promise<void> {
  return api<void>("/api/admin/logout", { method: "POST" });
}

export function getAdminGuests(eventId?: number): Promise<AdminGuest[]> {
  const query = eventId ? `?event_id=${eventId}` : "";
  return api<AdminGuest[]>(`/api/admin/guests${query}`);
}

export function getAdminPhotos(status: "active" | "trashed", eventId?: number): Promise<AdminPhoto[]> {
  const eventQuery = eventId ? `&event_id=${eventId}` : "";
  return api<AdminPhoto[]>(`/api/admin/photos?status=${status}${eventQuery}`);
}

export function deleteAdminPhoto(id: number): Promise<void> {
  return api<void>(`/api/admin/photos/${id}`, { method: "DELETE" });
}

export function restoreAdminPhoto(id: number): Promise<AdminPhoto> {
  return api<AdminPhoto>(`/api/admin/photos/${id}/restore`, { method: "POST" });
}

export function getAdminAlbumQr(): Promise<AdminQr> {
  return api<AdminQr>("/api/admin/album/qr");
}

export function getAdminCameraQr(): Promise<AdminQr> {
  return api<AdminQr>("/api/admin/album/camera-qr");
}

export function getAdminStorage(): Promise<AdminStorage> {
  return api<AdminStorage>("/api/admin/storage");
}

export function permanentlyDeleteAdminPhoto(id: number): Promise<void> {
  return api<void>(`/api/admin/photos/${id}/permanent`, { method: "DELETE" });
}

export function getAdminArchiveUrl(status: AdminArchiveStatus = "active"): string {
  return appPath(`/api/admin/photos/archive.zip?status=${status}`);
}

export function uploadPhoto(
  file: File,
  onProgress: (progress: number) => void
): Promise<Photo> {
  const token = getGuestToken();
  if (!token) {
    return Promise.reject(new RequestError(401, { code: "UNAUTHORIZED", message: "Сначала представьтесь." }));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const data = new FormData();
    data.append("file", file);

    xhr.open("POST", appPath("/api/photos"));
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as Photo);
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new RequestError(xhr.status, body.detail));
        } catch {
          reject(new Error("Не удалось загрузить файл."));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Связь оборвалась. Попробуйте еще раз."));
    xhr.send(data);
  });
}

export async function fetchAuthorizedBlob(url: string): Promise<string> {
  const token = getGuestToken();
  const response = await fetch(appPath(url), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "same-origin"
  });
  if (!response.ok) {
    throw new Error("Не удалось открыть файл.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
