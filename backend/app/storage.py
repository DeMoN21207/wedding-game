import shutil
from pathlib import Path
from typing import Optional

from .config import Settings
from .models import Guest, Photo


def ensure_storage(settings: Settings) -> None:
    """Создает базовые директории данных при старте приложения."""

    (settings.data_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "tmp").mkdir(parents=True, exist_ok=True)


def relative_to_data(settings: Settings, path: Path) -> str:
    """Сохраняет путь в БД относительно DATA_DIR, чтобы переносить каталог между серверами."""

    return str(path.relative_to(settings.data_dir))


def absolute_from_data(settings: Settings, relative_path: str) -> Path:
    """Восстанавливает абсолютный путь из относительного значения в БД."""

    return settings.data_dir / relative_path


def guest_root(settings: Settings, guest: Guest) -> Path:
    """Возвращает корневую папку гостя внутри upload-хранилища."""

    return settings.data_dir / "uploads" / guest.slug


def ensure_guest_dirs(settings: Settings, guest: Guest) -> None:
    """Создает папки оригиналов, превью и корзины для конкретного гостя."""

    root = guest_root(settings, guest)
    for name in ("originals", "previews", "thumbs", "trash/originals", "trash/previews", "trash/thumbs"):
        (root / name).mkdir(parents=True, exist_ok=True)


def original_path(settings: Settings, guest: Guest, number: int, extension: str) -> Path:
    """Строит путь оригинала фото по slug гостя и порядковому номеру."""

    ensure_guest_dirs(settings, guest)
    return guest_root(settings, guest) / "originals" / f"{guest.slug}_{number:03d}.{extension}"


def preview_path(settings: Settings, guest: Guest, number: int) -> Path:
    """Строит путь JPEG-превью по slug гостя и порядковому номеру."""

    ensure_guest_dirs(settings, guest)
    return guest_root(settings, guest) / "previews" / f"{guest.slug}_{number:03d}.jpg"


def thumbnail_path(settings: Settings, guest: Guest, number: int) -> Path:
    """Строит путь маленького JPEG-thumbnail для карточек и слайдеров."""

    ensure_guest_dirs(settings, guest)
    return guest_root(settings, guest) / "thumbs" / f"{guest.slug}_{number:03d}.jpg"


def trash_path(settings: Settings, path: Path) -> Path:
    """Преобразует активный путь файла в соответствующий путь корзины."""

    parts = path.relative_to(settings.data_dir).parts
    if len(parts) < 4 or parts[0] != "uploads":
        raise ValueError(f"Unexpected media path: {path}")
    return settings.data_dir / parts[0] / parts[1] / "trash" / parts[2] / parts[3]


def restore_path(settings: Settings, path: Path) -> Path:
    """Преобразует путь корзины обратно в активный путь."""

    parts = path.relative_to(settings.data_dir).parts
    if len(parts) < 5 or parts[0] != "uploads" or parts[2] != "trash":
        raise ValueError(f"Unexpected trash path: {path}")
    return settings.data_dir / parts[0] / parts[1] / parts[3] / parts[4]


def move_file(src: Optional[Path], dst: Optional[Path]) -> Optional[Path]:
    """Перемещает файл с заменой существующего назначения."""

    if src is None or dst is None:
        return None
    if not src.exists():
        return dst if dst.exists() else src
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    shutil.move(str(src), str(dst))
    return dst


def move_photo_to_trash(settings: Settings, photo: Photo) -> None:
    """Перемещает файлы фото в корзину и обновляет пути модели."""

    original = absolute_from_data(settings, photo.original_path)
    new_original = move_file(original, trash_path(settings, original))
    photo.original_path = relative_to_data(settings, new_original)
    if photo.preview_path:
        preview = absolute_from_data(settings, photo.preview_path)
        new_preview = move_file(preview, trash_path(settings, preview))
        photo.preview_path = relative_to_data(settings, new_preview)
        thumbnail = thumbnail_path(settings, photo.guest, photo.number)
        move_file(thumbnail, trash_path(settings, thumbnail))


def restore_photo_from_trash(settings: Settings, photo: Photo) -> None:
    """Возвращает файлы фото из корзины в активные папки."""

    original = absolute_from_data(settings, photo.original_path)
    new_original = move_file(original, restore_path(settings, original))
    photo.original_path = relative_to_data(settings, new_original)
    if photo.preview_path:
        preview = absolute_from_data(settings, photo.preview_path)
        new_preview = move_file(preview, restore_path(settings, preview))
        photo.preview_path = relative_to_data(settings, new_preview)
        thumbnail = trash_path(settings, thumbnail_path(settings, photo.guest, photo.number))
        move_file(thumbnail, restore_path(settings, thumbnail))


def delete_file(path: Optional[Path]) -> None:
    """Физически удаляет файл, если он есть."""

    if path is not None:
        path.unlink(missing_ok=True)


def delete_photo_files(settings: Settings, photo: Photo) -> None:
    """Физически удаляет оригинал, превью и thumbnail активного или удаленного фото."""

    delete_file(absolute_from_data(settings, photo.original_path))
    if photo.preview_path:
        delete_file(absolute_from_data(settings, photo.preview_path))

    active_thumbnail = thumbnail_path(settings, photo.guest, photo.number)
    delete_file(active_thumbnail)
    delete_file(trash_path(settings, active_thumbnail))
