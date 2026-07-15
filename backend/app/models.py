from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from .db import Base


def utc_now() -> datetime:
    """Возвращает текущее UTC-время для timestamp-полей SQLAlchemy."""

    return datetime.utcnow()


class Event(Base):
    """Техническое событие или общий альбом, к которому привязаны гости."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    token = Column(String(80), nullable=False, unique=True, index=True)
    slug = Column(String(40), nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    guests = relationship("Guest", back_populates="event", cascade="all, delete-orphan")


class Guest(Base):
    """Гость альбома с ником, токеном доступа и счетчиком номеров фото."""

    __tablename__ = "guests"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    nickname = Column(String(30), nullable=False)
    nickname_norm = Column(String(30), nullable=False)
    slug = Column(String(40), nullable=False, unique=True)
    token = Column(String(80), nullable=False, unique=True, index=True)
    avatar_index = Column(Integer, nullable=False, default=1)
    next_photo_number = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    event = relationship("Event", back_populates="guests")
    photos = relationship("Photo", back_populates="guest", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("event_id", "nickname_norm", name="uq_guests_event_nickname"),
    )


class Photo(Base):
    """Фото гостя с путями к оригиналу, превью и статусом корзины."""

    __tablename__ = "photos"

    id = Column(Integer, primary_key=True)
    guest_id = Column(Integer, ForeignKey("guests.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    original_path = Column(Text, nullable=False)
    preview_path = Column(Text)
    original_name = Column(Text)
    mime = Column(String(80), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=utc_now)
    trashed_at = Column(DateTime)

    guest = relationship("Guest", back_populates="photos")

    __table_args__ = (
        UniqueConstraint("guest_id", "number", name="uq_photos_guest_number"),
        Index("idx_photos_guest_status", "guest_id", "status"),
        Index(
            "uq_photos_guest_active_sha",
            "guest_id",
            "sha256",
            unique=True,
            sqlite_where=text("status = 'active'"),
            postgresql_where=text("status = 'active'"),
        ),
    )
