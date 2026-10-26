"""add the play field size to rounds

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-26 10:30:00

Each round now records the shape of the play field it was played on, so the server can
rebuild the same bubbles and check the same bounds when the taps come back. Rounds that
already exist were all played on the original portrait field, so that is the default.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rounds",
        sa.Column("field_width", sa.Integer(), server_default=sa.text("10000"), nullable=False),
    )
    op.add_column(
        "rounds",
        sa.Column("field_height", sa.Integer(), server_default=sa.text("21640"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rounds", "field_height")
    op.drop_column("rounds", "field_width")
