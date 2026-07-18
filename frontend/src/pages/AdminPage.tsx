import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminGuest,
  AdminPhoto,
  AdminQr,
  AdminStorage,
  AlbumPhoto,
  AlbumDashboard,
  deleteAdminPhoto,
  getAdminArchiveUrl,
  getAdminAlbumQr,
  getAdminCameraQr,
  getAdminGuests,
  getAdminPhotos,
  getAdminSession,
  getAdminStorage,
  getAlbum,
  logoutAdmin,
  permanentlyDeleteAdminPhoto,
  restoreAdminPhoto,
  RequestError
} from "../api/client";
import { AdminLogin } from "./AdminLogin";
import { LightboxPhoto, PhotoLightbox } from "../components/PhotoLightbox";
import { appConfig } from "../config/appConfig";
import { AdminGuestsTable } from "../features/admin/AdminGuestsTable";
import { AdminHeader } from "../features/admin/AdminHeader";
import { AdminPhotoGrid } from "../features/admin/AdminPhotoGrid";
import { AdminQrDashboard } from "../features/admin/AdminQrDashboard";
import { AdminTab, AdminTabs } from "../features/admin/AdminTabs";

const EMPTY_ALBUM: AlbumDashboard = {
  name: appConfig.albumTitle,
  qr_url: "",
  total_photos: 0,
  total_guests: 0,
  total_images: 0,
  total_videos: 0,
  total_size_bytes: 0,
  recent_photos: [],
  top_guests: []
};

type AdminAuthState = "checking" | "logged-in" | "logged-out";

export function AdminPage() {
  const [authState, setAuthState] = useState<AdminAuthState>("checking");
  const [tab, setTab] = useState<AdminTab>("qr");
  const [album, setAlbum] = useState<AlbumDashboard>(EMPTY_ALBUM);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [qr, setQr] = useState<AdminQr | null>(null);
  const [cameraQr, setCameraQr] = useState<AdminQr | null>(null);
  const [storage, setStorage] = useState<AdminStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);
  const qrCache = useRef<{ qr: AdminQr; cameraQr: AdminQr } | null>(null);

  const topGuests = useMemo(() => album.top_guests.filter((guest) => guest.active_photo_count > 0).slice(0, 5), [album.top_guests]);
  const recentPhotos = useMemo(() => album.recent_photos.slice(0, 10), [album.recent_photos]);

  const loadQrCodes = useCallback(async () => {
    if (qrCache.current) {
      return qrCache.current;
    }
    const [nextQr, nextCameraQr] = await Promise.all([getAdminAlbumQr(), getAdminCameraQr()]);
    qrCache.current = { qr: nextQr, cameraQr: nextCameraQr };
    setQr(nextQr);
    setCameraQr(nextCameraQr);
    return qrCache.current;
  }, []);

  const loadSection = useCallback(async () => {
    try {
      if (tab === "qr") {
        const [nextAlbum, nextStorage, nextQrCodes] = await Promise.all([
          getAlbum(),
          getAdminStorage(),
          loadQrCodes()
        ]);
        setAlbum(nextAlbum);
        setStorage(nextStorage);
        setQr(nextQrCodes.qr);
        setCameraQr(nextQrCodes.cameraQr);
      }
      if (tab === "guests") {
        const [nextAlbum, nextGuests] = await Promise.all([getAlbum(), getAdminGuests()]);
        setAlbum(nextAlbum);
        setGuests(nextGuests);
      }
      if (tab === "active" || tab === "trashed") {
        const [nextAlbum, nextPhotos] = await Promise.all([getAlbum(), getAdminPhotos(tab)]);
        setAlbum(nextAlbum);
        setPhotos(nextPhotos);
      }
      setError(null);
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        setAuthState("logged-out");
        return;
      }
      setError(err instanceof Error ? err.message : "Ошибка админки.");
    }
  }, [loadQrCodes, tab]);

  useEffect(() => {
    void getAdminSession()
      .then(() => setAuthState("logged-in"))
      .catch((err: unknown) => {
        if (!(err instanceof RequestError && err.status === 401)) {
          setError(err instanceof Error ? err.message : "Не удалось проверить вход в админку.");
        }
        setAuthState("logged-out");
      });
  }, []);

  useEffect(() => {
    if (authState !== "logged-in") {
      return;
    }
    void loadSection();
  }, [authState, loadSection]);

  const handleLoggedIn = useCallback(() => {
    setAuthState("logged-in");
  }, []);

  const remove = useCallback(async (photo: AdminPhoto) => {
    await deleteAdminPhoto(photo.id);
    await loadSection();
  }, [loadSection]);

  const restore = useCallback(async (photo: AdminPhoto) => {
    await restoreAdminPhoto(photo.id);
    await loadSection();
  }, [loadSection]);

  const permanentlyRemove = useCallback(async (photo: AdminPhoto) => {
    const confirmed = window.confirm(`Удалить файл ${photo.guest_nickname} #${photo.number.toString().padStart(3, "0")} навсегда?`);
    if (!confirmed) {
      return;
    }
    await permanentlyDeleteAdminPhoto(photo.id);
    await loadSection();
  }, [loadSection]);

  const handleLogout = useCallback(async () => {
    await logoutAdmin();
    setAuthState("logged-out");
  }, []);

  const openRecentPhoto = useCallback((photo: AlbumPhoto) => {
    if (!photo.preview_url) {
      return;
    }
    setLightboxPhoto({
      src: photo.preview_url,
      alt: `${photo.media_type === "video" ? "Видео" : "Фото"} ${photo.number}`,
      title: photo.guest_nickname,
      mediaType: photo.media_type,
      meta: `#${photo.number.toString().padStart(3, "0")}`
    });
  }, []);

  const openAdminPhoto = useCallback((photo: AdminPhoto) => {
    setLightboxPhoto({
      src: photo.original_url || photo.preview_url || "",
      alt: `${photo.media_type === "video" ? "Видео" : "Фото"} ${photo.number}`,
      title: photo.guest_nickname,
      mediaType: photo.media_type,
      meta: `#${photo.number.toString().padStart(3, "0")} · ${Math.round(photo.size_bytes / 1024)} КБ`,
      downloadUrl: photo.original_url
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxPhoto(null);
  }, []);

  if (authState === "checking") {
    return <main className="admin-login" aria-busy="true">Проверяем вход...</main>;
  }

  if (authState === "logged-out") {
    return <AdminLogin onLoggedIn={handleLoggedIn} />;
  }

  return (
    <main className="admin-shell wedding-admin-screen">
      <AdminHeader onLogout={handleLogout} />
      <AdminTabs tab={tab} onChange={setTab} />

      {error && <p className="form-error">{error}</p>}

      {tab === "qr" && qr && (
        <AdminQrDashboard
          album={album}
          cameraQr={cameraQr}
          qr={qr}
          storage={storage}
          recentPhotos={recentPhotos}
          topGuests={topGuests}
          archiveUrl={getAdminArchiveUrl("active")}
          onOpenRecentPhoto={openRecentPhoto}
        />
      )}

      {tab === "guests" && <AdminGuestsTable guests={guests} />}

      {(tab === "active" || tab === "trashed") && (
        <AdminPhotoGrid
          mode={tab}
          photos={photos}
          onOpenPhoto={openAdminPhoto}
          onRemove={remove}
          onRestore={restore}
          onPermanentRemove={permanentlyRemove}
        />
      )}

      <PhotoLightbox photo={lightboxPhoto} onClose={closeLightbox} />
    </main>
  );
}
