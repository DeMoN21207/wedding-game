import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const loadAlbumPage = () => import("./pages/AlbumPage").then((module) => ({ default: module.AlbumPage }));
const loadAdminPage = () => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage }));
const loadGalleryPage = () => import("./pages/GalleryPage").then((module) => ({ default: module.GalleryPage }));
const loadRafflePage = () => import("./pages/RafflePage").then((module) => ({ default: module.RafflePage }));
const loadRatingPage = () => import("./pages/RatingPage").then((module) => ({ default: module.RatingPage }));

const AlbumPage = lazy(loadAlbumPage);
const AdminPage = lazy(loadAdminPage);
const GalleryPage = lazy(loadGalleryPage);
const RafflePage = lazy(loadRafflePage);
const RatingPage = lazy(loadRatingPage);

function RouteFallback() {
  return <div className="route-fallback" aria-live="polite">Загружаем...</div>;
}

export function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<AlbumPage />} />
          <Route path="/camera" element={<AlbumPage cameraMode />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/raffle" element={<RafflePage />} />
          <Route path="/rating" element={<RatingPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/e/:eventToken" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
