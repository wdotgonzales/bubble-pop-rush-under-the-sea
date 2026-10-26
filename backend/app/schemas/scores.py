from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ScoreEntry(BaseModel):
    display_name: str
    avatar_url: str | None
    score: int
    # When the server accepted the round.
    played_at: datetime


class ScoresResponse(BaseModel):
    # One page of attempts in the order asked for. Empty when nothing has been scored yet, or when
    # the page is past the end.
    entries: list[ScoreEntry]
    # Which page this is (1-based), how big pages are and which order was used.
    page: int
    page_size: int
    sort: Literal["best", "recent"]
    # Scored attempts over all pages, and how many pages that makes (0 when there are none).
    total: int
    total_pages: int
