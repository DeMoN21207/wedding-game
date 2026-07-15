from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session, joinedload

from ..album import album_url, get_or_create_album_event
from ..config import Settings
from ..db import get_db
from ..deps import get_app_settings
from ..media_urls import photo_media_type, photo_preview_url, photo_thumbnail_url
from ..models import Event, Guest, Photo
from ..schemas import (
    AlbumContributorOut,
    AlbumOut,
    AlbumPhotoOut,
    GalleryOut,
    GalleryPhotoOut,
    RatingGuestOut,
    RatingOut,
)

router = APIRouter()


def album_photo_out(photo: Photo) -> AlbumPhotoOut:
    """Преобразует фото для главной страницы альбома."""

    return AlbumPhotoOut(
        id=photo.id,
        number=photo.number,
        media_type=photo_media_type(photo),
        preview_url=photo_preview_url(photo),
        thumbnail_url=photo_thumbnail_url(photo),
        guest_nickname=photo.guest.nickname,
        guest_slug=photo.guest.slug,
        created_at=photo.created_at,
    )


def gallery_photo_out(photo: Photo) -> GalleryPhotoOut:
    """Преобразует фото для общей галереи с публичной ссылкой скачивания."""

    return GalleryPhotoOut(
        id=photo.id,
        number=photo.number,
        media_type=photo_media_type(photo),
        preview_url=photo_preview_url(photo),
        thumbnail_url=photo_thumbnail_url(photo),
        download_url=f"/media/downloads/{photo.id}",
        guest_nickname=photo.guest.nickname,
        guest_slug=photo.guest.slug,
        created_at=photo.created_at,
    )


def album_out(event: Event, settings: Settings, db: Session) -> AlbumOut:
    """Собирает дашборд общего альбома: счетчики, последние фото и топ гостей."""

    guest_query = db.query(Guest).filter(Guest.event_id == event.id)
    total_guests = guest_query.count()
    active_photo_query = db.query(Photo).join(Guest).filter(Guest.event_id == event.id, Photo.status == "active")
    total_photos, total_videos, total_size_bytes = (
        db.query(
            func.count(Photo.id),
            func.coalesce(func.sum(case((Photo.mime.like("video/%"), 1), else_=0)), 0),
            func.coalesce(func.sum(Photo.size_bytes), 0),
        )
        .join(Guest)
        .filter(Guest.event_id == event.id, Photo.status == "active")
        .one()
    )
    total_photos = int(total_photos or 0)
    total_videos = int(total_videos or 0)
    total_size_bytes = int(total_size_bytes or 0)
    recent_photos = (
        active_photo_query
        .options(joinedload(Photo.guest))
        .order_by(Photo.created_at.desc(), Photo.id.desc())
        .limit(10)
        .all()
    )

    contributors = [
        AlbumContributorOut(
            nickname=guest.nickname,
            slug=guest.slug,
            avatar_index=guest.avatar_index,
            active_photo_count=active_count,
            created_at=guest.created_at,
        )
        for guest, active_count in (
            db.query(Guest, func.count(Photo.id).label("active_count"))
            .outerjoin(Photo, and_(Photo.guest_id == Guest.id, Photo.status == "active"))
            .filter(Guest.event_id == event.id)
            .group_by(Guest.id, Guest.nickname, Guest.slug, Guest.created_at)
            .order_by(func.count(Photo.id).desc(), Guest.created_at.asc())
            .limit(10)
            .all()
        )
    ]

    return AlbumOut(
        name=event.name,
        qr_url=album_url(settings),
        total_photos=total_photos,
        total_guests=total_guests,
        total_images=total_photos - total_videos,
        total_videos=total_videos,
        total_size_bytes=total_size_bytes,
        recent_photos=[album_photo_out(photo) for photo in recent_photos],
        top_guests=contributors[:10],
    )


@router.get("/album", response_model=AlbumOut)
def get_album(
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> AlbumOut:
    """Публичный endpoint главного дашборда альбома."""

    event = get_or_create_album_event(db, settings)
    return album_out(event, settings, db)


@router.get("/rating", response_model=RatingOut)
def get_rating(
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> RatingOut:
    """Публичный endpoint рейтинга гостей по активным фото."""

    event = get_or_create_album_event(db, settings)
    total_photos = (
        db.query(func.count(Photo.id))
        .join(Guest)
        .filter(Guest.event_id == event.id, Photo.status == "active")
        .scalar()
        or 0
    )
    rows = (
        db.query(Guest, func.count(Photo.id).label("active_count"))
        .outerjoin(Photo, and_(Photo.guest_id == Guest.id, Photo.status == "active"))
        .filter(Guest.event_id == event.id)
        .group_by(Guest.id, Guest.nickname, Guest.slug, Guest.created_at)
        .order_by(func.count(Photo.id).desc(), Guest.created_at.asc())
        .all()
    )
    guests = [
        RatingGuestOut(
            rank=index + 1,
            nickname=guest.nickname,
            slug=guest.slug,
            avatar_index=guest.avatar_index,
            active_photo_count=active_count,
            contribution_percent=round((active_count / total_photos) * 100, 2) if total_photos else 0.0,
            created_at=guest.created_at,
        )
        for index, (guest, active_count) in enumerate(rows)
    ]
    return RatingOut(total_photos=total_photos, total_guests=len(guests), guests=guests)


@router.get("/gallery/photos", response_model=GalleryOut)
def get_gallery_photos(
    limit: int = Query(60, ge=1, le=120),
    offset: int = Query(0, ge=0),
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> GalleryOut:
    """Публичный endpoint общей галереи с пагинацией."""

    event = get_or_create_album_event(db, settings)
    query = (
        db.query(Photo)
        .join(Guest)
        .filter(Guest.event_id == event.id, Photo.status == "active")
    )
    total = query.count()
    photos = (
        query
        .options(joinedload(Photo.guest))
        .order_by(Photo.created_at.desc(), Photo.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return GalleryOut(
        photos=[gallery_photo_out(photo) for photo in photos],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(photos) < total,
    )
