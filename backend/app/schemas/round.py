import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RoundStartResponse(BaseModel):
    round_id: uuid.UUID
    # The client feeds this to the shared generator to get the bubble schedule.
    seed: int
    # Which version of the game config the schedule is built from.
    config_version: int
    duration_ms: int
    started_at: datetime
    # After this the server will no longer accept a submission for the round.
    expires_at: datetime


class SubmitRequest(BaseModel):
    # What the player did, not what they scored: [{"t": ms, "x": 0..10000, "y": 0..21640}, ...].
    # Each entry is checked by the validator; the cap here only bounds the parse.
    taps: list[Any] = Field(max_length=2000)
    # Recorded for audit. The server's own clock decides whether a round was long enough.
    client_duration_ms: int = Field(ge=0, le=600_000)


class SubmitResponse(BaseModel):
    round_id: uuid.UUID
    status: Literal["accepted"] = "accepted"
    # Computed by the server from the tap log.
    score: int
    best_score: int
    is_new_best: bool
    # None only if the player has no score above zero yet.
    rank: int | None
