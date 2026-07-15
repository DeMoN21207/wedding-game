from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Guest

AVATAR_COUNT = 20


def avatar_index_for_position(position: int) -> int:
    """Возвращает номер аватара для порядковой позиции гостя внутри события."""

    normalized_position = max(1, position)
    return ((normalized_position - 1) % AVATAR_COUNT) + 1


def next_guest_avatar_index(db: Session, event_id: int) -> int:
    """Выбирает следующий аватар: первые 20 гостей получают уникальные номера."""

    guest_count = db.query(func.count(Guest.id)).filter(Guest.event_id == event_id).scalar() or 0
    return avatar_index_for_position(guest_count + 1)
