from fastapi import HTTPException

STORAGE_FULL_MESSAGE = "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    """Создает единый JSON-формат ошибок API."""

    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )
