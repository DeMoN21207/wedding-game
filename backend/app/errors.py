from fastapi import HTTPException


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    """Создает единый JSON-формат ошибок API."""

    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )
