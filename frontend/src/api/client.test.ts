import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  appPath,
  deleteAdminPhoto,
  deleteMyPhoto,
  fetchAuthorizedBlob,
  getAdminAlbumQr,
  getAdminArchiveUrl,
  getAdminCameraQr,
  getAdminGuests,
  getAdminPhotos,
  getAdminSession,
  getAdminStorage,
  getAlbum,
  getGalleryPhotos,
  getMe,
  getMyPhotos,
  getRating,
  loginAdmin,
  logoutAdmin,
  permanentlyDeleteAdminPhoto,
  registerGuest,
  RequestError,
  restoreAdminPhoto,
  uploadPhoto
} from "./client";
import { clearGuestSession, getGuestToken, setGuestToken } from "../store/session";

type FetchCall = [RequestInfo | URL, RequestInit | undefined];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function mockFetch(response: Response): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

function lastFetchCall(fetchMock: ReturnType<typeof vi.spyOn>): FetchCall {
  return fetchMock.mock.calls.at(-1) as FetchCall;
}

async function expectJsonRequest<T>(
  request: () => Promise<T>,
  expectedUrl: string,
  expected: { method?: string; body?: unknown } = {}
): Promise<void> {
  const fetchMock = mockFetch(jsonResponse({ ok: true }));

  await request();

  const [url, init] = lastFetchCall(fetchMock);
  expect(url).toBe(expectedUrl);
  expect(init).toEqual(expect.objectContaining({ credentials: "same-origin" }));
  if (expected.method) {
    expect(init?.method).toBe(expected.method);
  }
  if (expected.body !== undefined) {
    expect(init?.body).toBe(JSON.stringify(expected.body));
  }
}

class MockUploadTarget {
  onprogress: ((event: ProgressEvent) => void) | null = null;
}

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  upload = new MockUploadTarget();
  headers = new Map<string, string>();
  method = "";
  url = "";
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentBody: FormData | null = null;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  send(body: FormData): void {
    this.sentBody = body;
  }

  succeed(body: unknown): void {
    this.status = 201;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }

  fail(status: number, body: unknown): void {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearGuestSession();
    MockXMLHttpRequest.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearGuestSession();
  });

  it("builds app paths without touching absolute, data and blob urls", () => {
    expect(appPath("/api/album")).toBe("/api/album");
    expect(appPath("api/album")).toBe("/api/album");
    expect(appPath("https://example.test/file.jpg")).toBe("https://example.test/file.jpg");
    expect(appPath("data:image/png;base64,test")).toBe("data:image/png;base64,test");
    expect(appPath("blob:https://example.test/id")).toBe("blob:https://example.test/id");
  });

  it("adds json content type and guest authorization to API requests", async () => {
    setGuestToken("guest-token");
    const fetchMock = mockFetch(jsonResponse({ saved: true }));

    await api("/api/test", { method: "POST", body: JSON.stringify({ value: 1 }) });

    const [, init] = lastFetchCall(fetchMock);
    const headers = init?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer guest-token");
  });

  it("clears stale guest token only when profile request returns 401", async () => {
    setGuestToken("expired-token");
    mockFetch(jsonResponse({ detail: { code: "UNAUTHORIZED", message: "Нужен вход." } }, 401));

    await expect(api("/api/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });

    expect(getGuestToken()).toBeNull();
  });

  it("turns html API responses into a clear client error", async () => {
    mockFetch(new Response("<!doctype html>", { headers: { "Content-Type": "text/html" }, status: 200 }));

    await expect(api("/api/album")).rejects.toMatchObject({
      code: "BAD_API_RESPONSE",
      message: "API вернул HTML вместо данных. Перезапусти backend и открой приложение через его адрес."
    });
  });

  it("calls public album, gallery, rating and guest endpoints with stable routes", async () => {
    await expectJsonRequest(() => getAlbum(), "/api/album");
    await expectJsonRequest(() => getGalleryPhotos(), "/api/gallery/photos?limit=60&offset=0");
    await expectJsonRequest(() => getGalleryPhotos(24, 48), "/api/gallery/photos?limit=24&offset=48");
    await expectJsonRequest(() => getRating(), "/api/rating");
    await expectJsonRequest(() => registerGuest("Дима"), "/api/guests", { method: "POST", body: { nickname: "Дима" } });
    await expectJsonRequest(() => getMe(), "/api/me");
    await expectJsonRequest(() => getMyPhotos(), "/api/me/photos");
  });

  it("calls admin endpoints with stable routes and methods", async () => {
    await expectJsonRequest(() => loginAdmin("admin-pass"), "/api/admin/login", {
      method: "POST",
      body: { password: "admin-pass" }
    });
    await expectJsonRequest(() => logoutAdmin(), "/api/admin/logout", { method: "POST" });
    await expectJsonRequest(() => getAdminSession(), "/api/admin/session");
    await expectJsonRequest(() => getAdminGuests(), "/api/admin/guests");
    await expectJsonRequest(() => getAdminGuests(7), "/api/admin/guests?event_id=7");
    await expectJsonRequest(() => getAdminPhotos("active"), "/api/admin/photos?status=active");
    await expectJsonRequest(() => getAdminPhotos("trashed", 7), "/api/admin/photos?status=trashed&event_id=7");
    await expectJsonRequest(() => getAdminAlbumQr(), "/api/admin/album/qr");
    await expectJsonRequest(() => getAdminCameraQr(), "/api/admin/album/camera-qr");
    await expectJsonRequest(() => getAdminStorage(), "/api/admin/storage");
    await expectJsonRequest(() => restoreAdminPhoto(42), "/api/admin/photos/42/restore", { method: "POST" });
  });

  it("sends delete requests for personal and admin media operations", async () => {
    for (const [request, expectedUrl] of [
      [() => deleteMyPhoto(11), "/api/photos/11"],
      [() => deleteAdminPhoto(12), "/api/admin/photos/12"],
      [() => permanentlyDeleteAdminPhoto(13), "/api/admin/photos/13/permanent"]
    ] as const) {
      const fetchMock = mockFetch(emptyResponse());

      await request();

      const [url, init] = lastFetchCall(fetchMock);
      expect(url).toBe(expectedUrl);
      expect(init).toEqual(expect.objectContaining({ credentials: "same-origin", method: "DELETE" }));
    }
  });

  it("builds archive download URLs for every admin archive mode", () => {
    expect(getAdminArchiveUrl()).toBe("/api/admin/photos/archive.zip?status=active");
    expect(getAdminArchiveUrl("active")).toBe("/api/admin/photos/archive.zip?status=active");
    expect(getAdminArchiveUrl("trashed")).toBe("/api/admin/photos/archive.zip?status=trashed");
    expect(getAdminArchiveUrl("all")).toBe("/api/admin/photos/archive.zip?status=all");
  });

  it("uploads media with guest token, multipart body and progress callback", async () => {
    setGuestToken("upload-token");
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const progress = vi.fn();
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
    const resultPromise = uploadPhoto(file, progress);
    const xhr = MockXMLHttpRequest.instances[0];

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent);
    xhr.succeed({ id: 5, number: 1, media_type: "image", preview_url: "/p", thumbnail_url: "/t" });

    await expect(resultPromise).resolves.toMatchObject({ id: 5, number: 1 });
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/photos");
    expect(xhr.headers.get("Authorization")).toBe("Bearer upload-token");
    expect(xhr.sentBody?.get("file")).toBe(file);
    expect(progress).toHaveBeenCalledWith(25);
  });

  it("rejects upload before creating XHR when guest token is missing", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);

    await expect(uploadPhoto(new File(["image"], "photo.jpg"), vi.fn())).rejects.toBeInstanceOf(RequestError);

    expect(MockXMLHttpRequest.instances).toHaveLength(0);
  });

  it("turns upload API errors into RequestError", async () => {
    setGuestToken("upload-token");
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const resultPromise = uploadPhoto(new File(["image"], "photo.jpg"), vi.fn());
    const xhr = MockXMLHttpRequest.instances[0];

    xhr.fail(413, { detail: { code: "FILE_TOO_LARGE", message: "Файл слишком большой." } });

    await expect(resultPromise).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
  });

  it("preserves the friendly storage-full upload message", async () => {
    setGuestToken("upload-token");
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const resultPromise = uploadPhoto(new File(["image"], "photo.jpg"), vi.fn());
    const xhr = MockXMLHttpRequest.instances[0];

    xhr.fail(507, {
      detail: {
        code: "STORAGE_FULL",
        message: "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
      }
    });

    await expect(resultPromise).rejects.toMatchObject({
      status: 507,
      code: "STORAGE_FULL",
      message: "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
    });
  });

  it("opens authorized blobs with guest token and object url", async () => {
    setGuestToken("blob-token");
    const blob = new Blob(["image"]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(blob, { status: 200 }));
    const createObjectURL = vi.fn(() => "blob:preview");
    vi.stubGlobal("URL", { ...URL, createObjectURL });

    await expect(fetchAuthorizedBlob("/media/originals/1")).resolves.toBe("blob:preview");

    const [url, init] = lastFetchCall(fetchMock);
    expect(url).toBe("/media/originals/1");
    expect(init).toEqual(expect.objectContaining({
      credentials: "same-origin",
      headers: { Authorization: "Bearer blob-token" }
    }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });
});
