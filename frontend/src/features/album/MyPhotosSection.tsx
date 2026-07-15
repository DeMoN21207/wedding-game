import { memo } from "react";
import type { Photo } from "../../api/client";
import { PhotoCard } from "../../components/PhotoCard";

type MyPhotosSectionProps = {
  photos: Photo[];
  isLoggedIn: boolean;
  onDelete: (photo: Photo) => void;
  onOpen: (photo: Photo) => void;
};

/**
 * Секция личных фотографий текущего гостя.
 */
export const MyPhotosSection = memo(function MyPhotosSection({ photos, isLoggedIn, onDelete, onOpen }: MyPhotosSectionProps) {
  return (
    <section className="my-photos-section" id="my-photos">
      <div className="section-heading-row">
        <h2>Мои фото</h2>
        <span>{photos.length}</span>
      </div>
      <div className="photo-grid wedding-photo-grid" aria-live="polite">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} onDelete={onDelete} onOpen={onOpen} />
        ))}
        {photos.length === 0 && <div className="empty-state">{isLoggedIn ? "Пока пусто" : "После входа здесь будут ваши фото."}</div>}
      </div>
    </section>
  );
});
