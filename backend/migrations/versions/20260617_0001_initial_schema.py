"""initial schema

Revision ID: 20260617_0001
Revises:
Create Date: 2026-06-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Создает начальную схему свадебного альбома."""

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("token", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_events_token", "events", ["token"], unique=True)

    op.create_table(
        "guests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("nickname", sa.String(length=30), nullable=False),
        sa.Column("nickname_norm", sa.String(length=30), nullable=False),
        sa.Column("slug", sa.String(length=40), nullable=False),
        sa.Column("token", sa.String(length=80), nullable=False),
        sa.Column("next_photo_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "nickname_norm", name="uq_guests_event_nickname"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_guests_event_id", "guests", ["event_id"], unique=False)
    op.create_index("ix_guests_token", "guests", ["token"], unique=True)

    op.create_table(
        "photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("guest_id", sa.Integer(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("original_path", sa.Text(), nullable=False),
        sa.Column("preview_path", sa.Text(), nullable=True),
        sa.Column("original_name", sa.Text(), nullable=True),
        sa.Column("mime", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("trashed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["guest_id"], ["guests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("guest_id", "number", name="uq_photos_guest_number"),
    )
    op.create_index("ix_photos_guest_id", "photos", ["guest_id"], unique=False)
    op.create_index("idx_photos_guest_status", "photos", ["guest_id", "status"], unique=False)
    op.create_index(
        "uq_photos_guest_active_sha",
        "photos",
        ["guest_id", "sha256"],
        unique=True,
        sqlite_where=sa.text("status = 'active'"),
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    """Удаляет начальную схему свадебного альбома."""

    op.drop_index("uq_photos_guest_active_sha", table_name="photos")
    op.drop_index("idx_photos_guest_status", table_name="photos")
    op.drop_index("ix_photos_guest_id", table_name="photos")
    op.drop_table("photos")
    op.drop_index("ix_guests_token", table_name="guests")
    op.drop_index("ix_guests_event_id", table_name="guests")
    op.drop_table("guests")
    op.drop_index("ix_events_token", table_name="events")
    op.drop_table("events")
