import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

Base = declarative_base()
engine = None
SessionLocal = None
AVATAR_COUNT = 20
POSTGRES_MIGRATION_LOCK_KEY = 2026061101


def configure_database(database_url: str) -> None:
    """Создает SQLAlchemy engine и session factory для текущего процесса."""

    global engine, SessionLocal
    if database_url.startswith("sqlite:///") and database_url != "sqlite:///:memory:":
        db_path = Path(database_url.removeprefix("sqlite:///"))
        db_path.parent.mkdir(parents=True, exist_ok=True)
    if database_url.startswith("sqlite"):
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )
    else:
        engine = create_engine(
            database_url,
            future=True,
            pool_pre_ping=True,
            pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "5")),
            pool_recycle=1800,
        )

    if database_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def set_sqlite_pragmas(dbapi_connection, _connection_record):
            """Включает WAL, timeout и foreign keys для каждого SQLite-соединения."""

            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def create_schema() -> None:
    """Создает отсутствующие таблицы для первого запуска приложения."""

    if engine is None:
        raise RuntimeError("Database is not configured")
    Base.metadata.create_all(bind=engine)


def migrate_legacy_schema(default_event_token: str) -> None:
    """Поддерживает старые схемы БД, чтобы не потерять ранних гостей и фото."""

    if engine is None:
        raise RuntimeError("Database is not configured")
    with engine.begin() as connection:
        is_postgres = connection.dialect.name == "postgresql"
        if is_postgres:
            _acquire_postgres_migration_lock(connection)
        try:
            _migrate_legacy_schema(connection, default_event_token)
        finally:
            if is_postgres:
                _release_postgres_migration_lock(connection)


def _migrate_legacy_schema(connection, default_event_token: str) -> None:
    """Выполняет миграции старой схемы внутри одного DB-соединения."""

    guest_columns = _guest_column_names(connection)
    if not guest_columns:
        return

    if connection.dialect.name != "sqlite":
        _ensure_guest_avatar_index(connection, guest_columns)
        return

    if "event_id" not in guest_columns:
        connection.execute(text("ALTER TABLE guests ADD COLUMN event_id INTEGER"))
        guest_columns.add("event_id")

    guest_count = connection.execute(text("SELECT COUNT(*) FROM guests")).scalar_one()
    if guest_count > 0:
        event = connection.execute(
            text("SELECT id FROM events WHERE token = :token"),
            {"token": default_event_token},
        ).fetchone()
        if event is None:
            connection.execute(
                text(
                    """
                    INSERT INTO events (name, token, slug, created_at)
                    VALUES (:name, :token, :slug, CURRENT_TIMESTAMP)
                    """
                ),
                {
                    "name": "Imported wedding",
                    "token": default_event_token,
                    "slug": "imported-wedding",
                },
            )
            event_id = connection.execute(
                text("SELECT id FROM events WHERE token = :token"),
                {"token": default_event_token},
            ).scalar_one()
        else:
            event_id = event[0]

        connection.execute(
            text("UPDATE guests SET event_id = :event_id WHERE event_id IS NULL"),
            {"event_id": event_id},
        )

    _ensure_guest_avatar_index(connection, guest_columns)

    if _has_legacy_guest_uniques(connection):
        _rebuild_guests_table(connection)


def _acquire_postgres_migration_lock(connection) -> None:
    """Блокирует параллельные миграции при запуске нескольких uvicorn-воркеров."""

    connection.execute(text("SELECT pg_advisory_lock(:lock_key)"), {"lock_key": POSTGRES_MIGRATION_LOCK_KEY})


def _release_postgres_migration_lock(connection) -> None:
    """Освобождает PostgreSQL advisory lock миграции схемы."""

    connection.execute(text("SELECT pg_advisory_unlock(:lock_key)"), {"lock_key": POSTGRES_MIGRATION_LOCK_KEY})


def _guest_column_names(connection) -> set[str]:
    """Возвращает имена колонок таблицы гостей для текущего SQL dialect."""

    if connection.dialect.name == "sqlite":
        return {row[1] for row in connection.execute(text("PRAGMA table_info(guests)")).fetchall()}
    if not inspect(connection).has_table("guests"):
        return set()
    return {column["name"] for column in inspect(connection).get_columns("guests")}


def _ensure_guest_avatar_index(connection, guest_columns: set[str]) -> None:
    """Создает и заполняет avatar_index для старых баз."""

    if "avatar_index" not in guest_columns:
        connection.execute(text("ALTER TABLE guests ADD COLUMN avatar_index INTEGER"))
        guest_columns.add("avatar_index")

    _backfill_guest_avatar_indexes(connection)
    if connection.dialect.name != "sqlite":
        connection.execute(text("ALTER TABLE guests ALTER COLUMN avatar_index SET NOT NULL"))


def _has_legacy_guest_uniques(connection) -> bool:
    """Проверяет, остался ли старый уникальный индекс гостей только по нику."""

    for index in connection.execute(text("PRAGMA index_list(guests)")).fetchall():
        index_name = index[1]
        is_unique = bool(index[2])
        if not is_unique:
            continue
        columns = [
            row[2]
            for row in connection.execute(text(f"PRAGMA index_info({index_name})")).fetchall()
        ]
        if columns == ["nickname_norm"]:
            return True
    return False


def _backfill_guest_avatar_indexes(connection) -> None:
    """Назначает аватары старым гостям по порядку создания внутри события."""

    positions_by_event: dict[int, int] = {}
    rows = connection.execute(
        text(
            """
            SELECT id, event_id, avatar_index
            FROM guests
            WHERE event_id IS NOT NULL
            ORDER BY event_id ASC, created_at ASC, id ASC
            """
        )
    ).mappings().all()
    for row in rows:
        event_id = int(row["event_id"])
        positions_by_event[event_id] = positions_by_event.get(event_id, 0) + 1
        if row["avatar_index"] is not None:
            continue
        connection.execute(
            text("UPDATE guests SET avatar_index = :avatar_index WHERE id = :guest_id"),
            {
                "avatar_index": ((positions_by_event[event_id] - 1) % AVATAR_COUNT) + 1,
                "guest_id": row["id"],
            },
        )


def _rebuild_guests_table(connection) -> None:
    """Пересобирает SQLite-таблицу гостей под уникальность ника внутри события."""

    connection.execute(text("PRAGMA foreign_keys=OFF"))
    connection.execute(
        text(
            """
            CREATE TABLE guests_new (
                id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                nickname VARCHAR(30) NOT NULL,
                nickname_norm VARCHAR(30) NOT NULL,
                slug VARCHAR(40) NOT NULL,
                token VARCHAR(80) NOT NULL,
                avatar_index INTEGER NOT NULL,
                next_photo_number INTEGER NOT NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                FOREIGN KEY(event_id) REFERENCES events (id) ON DELETE CASCADE,
                CONSTRAINT uq_guests_event_nickname UNIQUE (event_id, nickname_norm),
                UNIQUE (slug)
            )
            """
        )
    )
    connection.execute(
        text(
            """
            INSERT INTO guests_new (
                id, event_id, nickname, nickname_norm, slug, token, avatar_index, next_photo_number, created_at
            )
            SELECT id, event_id, nickname, nickname_norm, slug, token, COALESCE(avatar_index, 1), next_photo_number, created_at
            FROM guests
            WHERE event_id IS NOT NULL
            """
        )
    )
    connection.execute(text("DROP TABLE guests"))
    connection.execute(text("ALTER TABLE guests_new RENAME TO guests"))
    connection.execute(text("CREATE INDEX ix_guests_event_id ON guests (event_id)"))
    connection.execute(text("CREATE UNIQUE INDEX ix_guests_token ON guests (token)"))
    connection.execute(text("PRAGMA foreign_keys=ON"))


def get_db() -> Iterator[Session]:
    """FastAPI dependency: выдает DB-сессию на один запрос и гарантирует закрытие."""

    if SessionLocal is None:
        raise RuntimeError("Database is not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Открывает транзакционную сессию для фоновых или сервисных операций."""

    if SessionLocal is None:
        raise RuntimeError("Database is not configured")
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
