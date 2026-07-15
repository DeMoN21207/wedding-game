import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminGuest,
  AdminPhoto,
  AdminQr,
  AlbumPhoto,
  AlbumDashboard,
  deleteAdminPhoto,
  getAdminArchiveUrl,
  getAdminAlbumQr,
  getAdminCameraQr,
  getAdminGuests,
  getAdminPhotos,
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

export function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(true);
  const [tab, setTab] = useState<AdminTab>("qr");
  const [album, setAlbum] = useState<AlbumDashboard>(EMPTY_ALBUM);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [qr, setQr] = useState<AdminQr | null>(null);
  const [cameraQr, setCameraQr] = useState<AdminQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  const topGuests = useMemo(() => album.top_guests.filter((guest) => guest.active_photo_count > 0).slice(0, 5), [album.top_guests]);
  const recentPhotos = useMemo(() => album.recent_photos.slice(0, 10), [album.recent_photos]);

  const loadSection = useCallback(async () => {
    try {
      if (tab === "qr") {
        const [nextAlbum, nextQr, nextCameraQr] = await Promise.all([
          getAlbum(),
          getAdminAlbumQr(),
          getAdminCameraQr()
        ]);
        setAlbum(nextAlbum);
        setQr(nextQr);
        setCameraQr(nextCameraQr);
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
      setLoggedIn(true);
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        setLoggedIn(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Ошибка админки.");
    }
  }, [tab]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  const handleLoggedIn = useCallback(() => {
    setLoggedIn(true);
    void loadSection();
  }, [loadSection]);

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
    setLoggedIn(false);
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

  if (!loggedIn) {
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
