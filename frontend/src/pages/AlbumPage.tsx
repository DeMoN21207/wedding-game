import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlbumDashboard,
  AlbumPhoto,
  deleteMyPhoto,
  getAlbum,
  getMe,
  getMyPhotos,
  Me,
  Photo,
  registerGuest,
  RequestError
} from "../api/client";
import { LightboxPhoto, PhotoLightbox } from "../components/PhotoLightbox";
import { UploadButton } from "../components/UploadButton";
import { appConfig } from "../config/appConfig";
import { AlbumHeader } from "../features/album/AlbumHeader";
import { AlbumHero } from "../features/album/AlbumHero";
import { AlbumQuickLinks } from "../features/album/AlbumQuickLinks";
import { DashboardRecent } from "../features/album/DashboardRecent";
import { LockedUploadPanel } from "../features/album/LockedUploadPanel";
import { MyPhotosSection } from "../features/album/MyPhotosSection";
import { WelcomeDialog } from "../features/album/WelcomeDialog";
import {
  clearGuestSession,
  getGuestNickname,
  getGuestToken,
  setGuestNickname,
  setGuestToken
} from "../store/session";

type Props = {
  cameraMode?: boolean;
};

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

export function AlbumPage({ cameraMode = false }: Props) {
  const uploadRef = useRef<HTMLDivElement | null>(null);
  const [album, setAlbum] = useState<AlbumDashboard>(EMPTY_ALBUM);
  const [me, setMe] = useState<Me | null>(null);
  const [myPhotos, setMyPhotos] = useState<Photo[]>([]);
  const [nickname, setNickname] = useState(getGuestNickname() ?? "");
  const [needsIntro, setNeedsIntro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  const loadAlbum = useCallback(async () => {
    const nextAlbum = await getAlbum();
    setAlbum(nextAlbum);
  }, []);

  const loadGuest = useCallback(async () => {
    if (!getGuestToken()) {
      setMe(null);
      setMyPhotos([]);
      setNeedsIntro(true);
      return;
    }

    try {
      const [profile, photos] = await Promise.all([getMe(), getMyPhotos()]);
      setMe(profile);
      setMyPhotos(photos);
      setNickname(profile.nickname);
      setGuestNickname(profile.nickname);
      setNeedsIntro(false);
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        clearGuestSession();
        setMe(null);
        setMyPhotos([]);
        setNeedsIntro(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось открыть ваши фото.");
    }
  }, []);

  const loadMyPhotos = useCallback(async () => {
    if (!getGuestToken()) {
      setMyPhotos([]);
      return;
    }
    setMyPhotos(await getMyPhotos());
  }, []);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      await Promise.all([loadAlbum(), loadGuest()]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть альбом.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [loadAlbum, loadGuest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (cameraMode && me) {
      window.setTimeout(() => uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    }
  }, [cameraMode, me]);

  const showIntro = useCallback(() => {
    setNeedsIntro(true);
  }, []);

  const handleNicknameChange = useCallback((nextNickname: string) => {
    setNickname(nextNickname);
  }, []);

  const submitNickname = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const guest = await registerGuest(trimmed);
      setGuestToken(guest.guest_token);
      setGuestNickname(guest.nickname);
      setNickname(guest.nickname);
      await loadGuest();
      setNeedsIntro(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти.");
    } finally {
      setSaving(false);
    }
  }, [loadGuest, nickname]);

  const remove = useCallback(async (photo: Photo) => {
    if (!confirm(appConfig.deletePhotoConfirm(photo.number))) {
      return;
    }
    await deleteMyPhoto(photo.id);
    await refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    clearGuestSession();
    setMe(null);
    setMyPhotos([]);
    setNeedsIntro(true);
  }, []);

  const openAlbumPhoto = useCallback((photo: AlbumPhoto) => {
    if (!photo.preview_url) {
      return;
    }
    setLightboxPhoto({
      src: photo.preview_url,
      alt: `${photo.guest_nickname}, ${photo.media_type === "video" ? "видео" : "фото"} ${photo.number}`,
      title: photo.guest_nickname,
      mediaType: photo.media_type,
      meta: `${photo.media_type === "video" ? "Видео" : "Фото"} #${photo.number.toString().padStart(3, "0")}`,
      downloadUrl: `/media/downloads/${photo.id}`
    });
  }, []);

  const openMyPhoto = useCallback((photo: Photo) => {
    if (!photo.preview_url) {
      return;
    }
    setLightboxPhoto({
      src: photo.preview_url,
      alt: `Мое ${photo.media_type === "video" ? "видео" : "фото"} ${photo.number}`,
      title: photo.media_type === "video" ? "Мое видео" : "Мое фото",
      mediaType: photo.media_type,
      meta: `#${photo.number.toString().padStart(3, "0")}`,
      downloadUrl: `/media/downloads/${photo.id}`
    });
  }, []);

  const handleUploaded = useCallback(() => {
    void Promise.all([loadAlbum(), loadMyPhotos()]).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Не удалось обновить загруженные файлы.");
    });
  }, [loadAlbum, loadMyPhotos]);

  const closeLightbox = useCallback(() => {
    setLightboxPhoto(null);
  }, []);

  return (
    <main className="guest-shell album-shell wedding-screen album-redesign">
      <AlbumHeader me={me} onLogout={logout} onShowIntro={showIntro} showHomeLink={cameraMode} />
      <AlbumHero />

      <section className="album-redesign-layout">
        <div className="album-main-column">
          <div className="album-upload-showcase" ref={uploadRef}>
            {me ? (
              <UploadButton autoOpenCamera={cameraMode} variant="hero" label={cameraMode ? "Снять" : "Открыть камеру"} onUploaded={handleUploaded} />
            ) : (
              <LockedUploadPanel onShowIntro={showIntro} />
            )}
          </div>

          <AlbumQuickLinks />
        </div>
      </section>

      {error && <p className="form-error album-error">{error}</p>}

      <DashboardRecent photos={album.recent_photos} loading={loading} onOpenPhoto={openAlbumPhoto} />

      <MyPhotosSection photos={myPhotos} isLoggedIn={Boolean(me)} onDelete={remove} onOpen={openMyPhoto} />

      {needsIntro && (
        <WelcomeDialog nickname={nickname} saving={saving} onNicknameChange={handleNicknameChange} onSubmit={submitNickname} />
      )}

      <PhotoLightbox photo={lightboxPhoto} onClose={closeLightbox} />
    </main>
  );
}
