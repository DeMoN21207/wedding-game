"""add guest avatar index

Revision ID: 20260619_0002
Revises: 20260617_0001
Create Date: 2026-06-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260619_0002"
down_revision: Union[str, None] = "20260617_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AVATAR_COUNT = 20


def upgrade() -> None:
    """Добавляет гостям стабильный номер аватарки."""

    connection = op.get_bind()
    guest_columns = {column["name"] for column in sa.inspect(connection).get_columns("guests")}
    if "avatar_index" not in guest_columns:
        with op.batch_alter_table("guests") as batch_op:
            batch_op.add_column(sa.Column("avatar_index", sa.Integer(), nullable=True))

    positions_by_event: dict[int, int] = {}
    rows = connection.execute(
        sa.text(
            """
            SELECT id, event_id
            FROM guests
            WHERE event_id IS NOT NULL
            ORDER BY event_id ASC, created_at ASC, id ASC
            """
        )
    ).mappings().all()
    for row in rows:
        event_id = int(row["event_id"])
        positions_by_event[event_id] = positions_by_event.get(event_id, 0) + 1
        avatar_index = ((positions_by_event[event_id] - 1) % AVATAR_COUNT) + 1
        connection.execute(
            sa.text("UPDATE guests SET avatar_index = :avatar_index WHERE id = :guest_id"),
            {"avatar_index": avatar_index, "guest_id": row["id"]},
        )

    with op.batch_alter_table("guests") as batch_op:
        batch_op.alter_column("avatar_index", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    """Удаляет номер аватарки гостя."""

    with op.batch_alter_table("guests") as batch_op:
        batch_op.drop_column("avatar_index")
