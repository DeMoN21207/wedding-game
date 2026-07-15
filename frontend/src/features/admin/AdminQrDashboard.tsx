import { Download, HardDrive, Image, Images, Play, QrCode, Users, Video } from "lucide-react";
import { memo } from "react";
import { appPath, type AdminQr, type AlbumDashboard, type AlbumPhoto } from "../../api/client";
import { GuestAvatar } from "../../components/GuestAvatar";
import { formatBytes } from "../../utils/format";

type TopGuest = AlbumDashboard["top_guests"][number];

type AdminQrDashboardProps = {
  album: AlbumDashboard;
  cameraQr: AdminQr | null;
  qr: AdminQr;
  recentPhotos: AlbumPhoto[];
  topGuests: TopGuest[];
  archiveUrl: string;
  onOpenRecentPhoto: (photo: AlbumPhoto) => void;
};

/**
 * Главный экран админки: QR, общая статистика и быстрый обзор загрузок.
 */
export const AdminQrDashboard = memo(function AdminQrDashboard({ album, cameraQr, qr, recentPhotos, topGuests, archiveUrl, onOpenRecentPhoto }: AdminQrDashboardProps) {
  return (
    <>
      <section className="admin-wedding-hero">
        <div className="admin-hero-copy">
          <p className="eyebrow">Обзор</p>
          <h2>Сбор медиа</h2>
          <p className="hero-copy">{album.name}: гости загружают фото и видео, вы скачиваете архив и чистите лишнее.</p>
          <a className="icon-text-button admin-download-all" href={archiveUrl} download>
            <Download size={17} />
            <span>Скачать всё</span>
          </a>
        </div>
        <div className="admin-qr-stack">
          <div className="admin-qr-card">
            <span className="admin-qr-label"><QrCode size={16} /> QR гостей</span>
            <img src={qr.qr_png_base64} alt="QR общего альбома" decoding="async" />
            <code>{qr.url}</code>
          </div>
          {cameraQr && (
            <div className="admin-qr-card admin-qr-card-camera">
              <span className="admin-qr-label"><CameraQrIcon /> QR камера</span>
              <img src={cameraQr.qr_png_base64} alt="QR быстрого открытия камеры" decoding="async" />
              <code>{cameraQr.url}</code>
            </div>
          )}
        </div>
      </section>

      <section className="admin-panel wedding-dashboard-card">
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <Images size={30} />
            <div>
              <span>Всего файлов</span>
              <strong>{album.total_photos}</strong>
            </div>
          </div>
          <div className="dashboard-stat">
            <Users size={30} />
            <div>
              <span>Гостей</span>
              <strong>{album.total_guests}</strong>
            </div>
          </div>
          <div className="dashboard-stat compact-stat">
            <Image size={24} />
            <div>
              <span>Фото</span>
              <strong>{album.total_images}</strong>
            </div>
          </div>
          <div className="dashboard-stat compact-stat">
            <Video size={24} />
            <div>
              <span>Видео</span>
              <strong>{album.total_videos}</strong>
            </div>
          </div>
          <div className="dashboard-stat compact-stat wide-stat">
            <HardDrive size={24} />
            <div>
              <span>Вес архива</span>
              <strong>{formatBytes(album.total_size_bytes)}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <h3>10 последних моментов</h3>
          <div className="recent-strip">
            {recentPhotos.map((photo) =>
              photo.thumbnail_url || photo.preview_url ? (
                <button
                  className="recent-thumb-button"
                  key={photo.id}
                  type="button"
                  title="Открыть файл"
                  onClick={() => onOpenRecentPhoto(photo)}
                >
                  {photo.media_type === "video" ? (
                    <div className="video-placeholder recent-thumb-video" aria-label={`Видео ${photo.number}`}>
                      <Video size={24} />
                      <Play size={16} fill="currentColor" />
                    </div>
                  ) : (
                    <img src={appPath(photo.thumbnail_url ?? photo.preview_url ?? "")} alt={`Фото ${photo.number}`} loading="lazy" decoding="async" />
                  )}
                </button>
              ) : (
                <div className="recent-thumb-placeholder" key={photo.id}>#{photo.number.toString().padStart(3, "0")}</div>
              )
            )}
            {recentPhotos.length === 0 && <div className="empty-state compact">Моменты появятся здесь после первых загрузок.</div>}
          </div>
        </div>

        <div className="dashboard-section">
          <h3>Кто поделился фото</h3>
          <div className="contributors-table">
            <div className="contributors-head">
              <span>#</span>
              <span>Гость</span>
              <span>Фото</span>
            </div>
            {topGuests.map((guest, index) => (
              <div className="contributors-row" key={guest.slug}>
                <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
                <GuestAvatar avatarIndex={guest.avatar_index} nickname={guest.nickname} seed={guest.slug} />
                <strong>{guest.nickname}</strong>
                <span>{guest.active_photo_count}</span>
              </div>
            ))}
            {topGuests.length === 0 && <div className="empty-state compact">Гости появятся после входа по QR.</div>}
          </div>
        </div>
      </section>
    </>
  );
});

function CameraQrIcon() {
  return <QrCode size={16} />;
}
