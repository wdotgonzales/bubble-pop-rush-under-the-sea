"""create leaderboard_top view

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-25 16:10:00

A view, not a table: the top 10 is always computed from players, so it can never
drift out of sync with the scores. Alembic does not track views, so this one is
written by hand and `alembic check` ignores it.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE VIEW leaderboard_top AS
        SELECT
            ROW_NUMBER() OVER (ORDER BY best_score DESC, best_score_at ASC, id ASC) AS rank,
            id,
            display_name,
            avatar_url,
            best_score AS score,
            best_score_at
        FROM players
        WHERE best_score > 0
        ORDER BY rank
        LIMIT 10
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW leaderboard_top")
