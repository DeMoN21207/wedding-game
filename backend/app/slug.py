import re
from typing import Callable

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def normalize_nickname(value: str) -> str:
    """Нормализует ник для сравнения уникальности без лишних пробелов."""

    return " ".join(value.strip().lower().split())


def clean_nickname(value: str) -> str:
    """Приводит ник к аккуратному отображаемому виду."""

    return " ".join(value.strip().split())


def slugify(value: str) -> str:
    """Делает безопасный латинский slug для путей файлов и публичных идентификаторов."""

    pieces = []
    for char in normalize_nickname(value):
        lower = char.lower()
        pieces.append(TRANSLIT.get(lower, lower))
    slug = "".join(pieces)
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return (slug or "guest")[:30].strip("-") or "guest"


def unique_slug(value: str, exists: Callable[[str], bool]) -> str:
    """Подбирает уникальный slug с числовым суффиксом при конфликте."""

    base = slugify(value)
    candidate = base
    suffix = 2
    while exists(candidate):
        candidate = f"{base[:27]}-{suffix}"
        suffix += 1
    return candidate
