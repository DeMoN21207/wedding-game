from __future__ import annotations

import errno
import hashlib
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Literal, Optional, Tuple

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:
    pass

from .config import Settings

FORMAT_INFO = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
    "HEIF": ("heic", "image/heic"),
    "HEIC": ("heic", "image/heic"),
}

VIDEO_INFO_BY_EXTENSION = {
    "mp4": "video/mp4",
    "m4v": "video/mp4",
    "mov": "video/quicktime",
    "webm": "video/webm",
}

VIDEO_EXTENSION_BY_MIME = {
    "video/mp4": "mp4",
    "video/x-m4v": "m4v",
    "video/quicktime": "mov",
    "video/webm": "webm",
}


class ImageValidationError(Exception):
    """Файл не является поддерживаемым изображением."""

    pass


class UploadTooLargeError(Exception):
    """Файл превышает лимит по байтам."""

    pass


class ImageTooLargeError(Exception):
    """Изображение превышает лимит по пикселям и может перегрузить обработку."""

    pass


class StorageFullError(Exception):
    """На диске недостаточно места с учетом обязательного резерва."""

    pass


def tmp_upload_path(settings: Settings) -> Path:
    """Создает уникальный путь для временного файла загрузки."""

    tmp_dir = settings.data_dir / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    return tmp_dir / f"{uuid.uuid4().hex}.part"


def stream_upload(
    file: UploadFile,
    destination: Path,
    max_bytes: int,
    min_free_bytes: int = 0,
) -> Tuple[int, str]:
    """Потоково сохраняет upload на диск, считая размер и SHA-256 без чтения целиком в память."""

    digest = hashlib.sha256()
    size = 0
    try:
        with destination.open("wb") as output:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise UploadTooLargeError()
                if (
                    min_free_bytes
                    and size % (16 * 1024 * 1024) < len(chunk)
                    and shutil.disk_usage(destination.parent).free - len(chunk) < min_free_bytes
                ):
                    raise StorageFullError()
                digest.update(chunk)
                output.write(chunk)
    except OSError as exc:
        destination.unlink(missing_ok=True)
        if exc.errno == errno.ENOSPC:
            raise StorageFullError() from exc
        raise
    except (StorageFullError, UploadTooLargeError):
        destination.unlink(missing_ok=True)
        raise
    return size, digest.hexdigest()


def inspect_image(path: Path, max_pixels: int) -> Tuple[str, str, str]:
    """Проверяет формат изображения и отсекает слишком большие по пикселям файлы."""

    try:
        with Image.open(path) as image:
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > max_pixels:
                raise ImageTooLargeError("Image has too many pixels")
            image_format = (image.format or "").upper()
            image.verify()
    except Image.DecompressionBombError as exc:
        raise ImageTooLargeError("Image has too many pixels") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageValidationError("Unsupported image") from exc

    if image_format not in FORMAT_INFO:
        raise ImageValidationError("Unsupported image")
    extension, mime = FORMAT_INFO[image_format]
    return image_format, extension, mime


def normalized_content_type(content_type: str | None) -> str:
    """Приводит MIME из upload-заголовка к стабильному виду без параметров."""

    return (content_type or "").split(";", 1)[0].strip().lower()


def video_extension(filename: str | None) -> str:
    """Достает поддерживаемое расширение видео из имени файла."""

    return Path(filename or "").suffix.lower().lstrip(".")


def looks_like_video_file(path: Path, extension: str) -> bool:
    """Проверяет базовую сигнатуру видео, чтобы не принимать произвольный файл по одному имени."""

    with path.open("rb") as source:
        header = source.read(16)
    if extension in {"mp4", "m4v", "mov"}:
        return len(header) >= 12 and header[4:8] == b"ftyp"
    if extension == "webm":
        return header.startswith(b"\x1a\x45\xdf\xa3")
    return False


def inspect_video(path: Path, filename: str | None, content_type: str | None) -> Tuple[str, str]:
    """Проверяет поддерживаемое видео из iPhone/браузера и возвращает расширение с MIME."""

    upload_mime = normalized_content_type(content_type)
    filename_extension = video_extension(filename)
    if filename_extension in VIDEO_INFO_BY_EXTENSION:
        extension = filename_extension
        mime = upload_mime if upload_mime in VIDEO_EXTENSION_BY_MIME else VIDEO_INFO_BY_EXTENSION[extension]
    elif upload_mime in VIDEO_EXTENSION_BY_MIME:
        extension = VIDEO_EXTENSION_BY_MIME[upload_mime]
        mime = upload_mime
    else:
        raise ImageValidationError("Unsupported video")

    if not looks_like_video_file(path, extension):
        raise ImageValidationError("Unsupported video")
    return extension, mime


def inspect_upload_media(
    path: Path,
    max_pixels: int,
    filename: str | None,
    content_type: str | None,
) -> Tuple[Literal["image", "video"], str, str]:
    """Определяет тип загруженного файла и валидирует фото или видео одним входом."""

    upload_mime = normalized_content_type(content_type)
    filename_extension = video_extension(filename)
    if upload_mime.startswith("video/") or filename_extension in VIDEO_INFO_BY_EXTENSION:
        extension, mime = inspect_video(path, filename, content_type)
        return "video", extension, mime

    _image_format, extension, mime = inspect_image(path, max_pixels)
    return "image", extension, mime


def image_as_rgb(image: Image.Image) -> Image.Image:
    """Готовит изображение к JPEG-сохранению, сохраняя EXIF-поворот и белый фон для прозрачности."""

    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        return background
    if image.mode != "RGB":
        return image.convert("RGB")
    return image


def optimize_original_image(
    path: Path,
    min_bytes: int,
    max_edge: int,
    quality: int,
) -> Optional[Tuple[int, str, str]]:
    """Сжимает большой оригинал изображения в JPEG, если оптимизированная версия меньше исходника."""

    original_size = path.stat().st_size
    if original_size < min_bytes:
        return None

    optimized_path = path.with_name(f"{path.name}.optimized.jpg")
    with Image.open(path) as image:
        image = image_as_rgb(image)
        if max(image.size) > max_edge:
            image.thumbnail((max_edge, max_edge))
        image.save(
            optimized_path,
            format="JPEG",
            quality=max(1, min(quality, 95)),
            optimize=True,
            progressive=True,
        )

    optimized_size = optimized_path.stat().st_size
    if optimized_size >= original_size:
        optimized_path.unlink(missing_ok=True)
        return None

    optimized_path.replace(path)
    return optimized_size, "jpg", "image/jpeg"


def save_optimized_image(
    original: Path,
    destination: Path,
    min_bytes: int,
    max_edge: int,
    quality: int,
) -> Optional[Tuple[int, str, str]]:
    """Создает уменьшенную JPEG-копию, не изменяя оригинал до успешной DB-транзакции."""

    original_size = original.stat().st_size
    if original_size < min_bytes:
        return None

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    try:
        with Image.open(original) as image:
            image = image_as_rgb(image)
            if max(image.size) > max_edge:
                image.thumbnail((max_edge, max_edge))
            image.save(
                destination,
                format="JPEG",
                quality=max(1, min(quality, 95)),
                optimize=True,
                progressive=True,
            )
        optimized_size = destination.stat().st_size
        if optimized_size >= original_size:
            destination.unlink(missing_ok=True)
            return None
        return optimized_size, "jpg", "image/jpeg"
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def save_preview(original: Path, preview: Path) -> None:
    """Создает JPEG-превью с учетом EXIF-поворота и прозрачности."""

    preview.parent.mkdir(parents=True, exist_ok=True)
    temporary_preview = preview.with_name(f"{preview.name}.{uuid.uuid4().hex}.tmp.jpg")
    try:
        with Image.open(original) as image:
            image = image_as_rgb(image)
            image.thumbnail((1600, 1600))
            image.save(temporary_preview, format="JPEG", quality=82, optimize=True)
        temporary_preview.replace(preview)
    except Exception:
        temporary_preview.unlink(missing_ok=True)
        raise


def save_thumbnail(source: Path, thumbnail: Path) -> None:
    """Создает маленький WebP-thumbnail для сеток и слайдеров, чтобы быстрее декодировать галерею."""

    thumbnail.parent.mkdir(parents=True, exist_ok=True)
    temporary_thumbnail = thumbnail.with_name(f"{thumbnail.name}.{uuid.uuid4().hex}.tmp.webp")
    try:
        with Image.open(source) as image:
            image = image_as_rgb(image)
            image.thumbnail((640, 640))
            image.save(temporary_thumbnail, format="WEBP", quality=76, method=4)
        temporary_thumbnail.replace(thumbnail)
    except Exception:
        temporary_thumbnail.unlink(missing_ok=True)
        raise


def save_video_preview(original: Path, preview: Path) -> bool:
    """Достает JPEG-poster из видео через ffmpeg, чтобы видео в галерее имело нормальную превьюшку."""

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False

    preview.parent.mkdir(parents=True, exist_ok=True)
    temporary_preview = preview.with_name(f"{preview.name}.{uuid.uuid4().hex}.tmp.jpg")
    temporary_preview.unlink(missing_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "0.4",
        "-i",
        str(original),
        "-frames:v",
        "1",
        "-vf",
        "scale=1280:-2:force_original_aspect_ratio=decrease",
        "-q:v",
        "4",
        str(temporary_preview),
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        temporary_preview.unlink(missing_ok=True)
        return False

    if result.returncode != 0 or not temporary_preview.exists() or temporary_preview.stat().st_size == 0:
        temporary_preview.unlink(missing_ok=True)
        return False

    temporary_preview.replace(preview)
    return True
