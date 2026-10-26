import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, StrictInt


class RoundStartRequest(BaseModel):
    """The shape of the play field the game wants, in game units (see app.game.config).

    Optional: a round started without a body uses the default portrait field. The route
    checks the numbers against the allowed bounds.
    """

    field_width: StrictInt
    field_height: StrictInt


class RoundStartResponse(BaseModel):
    round_id: uuid.UUID
    # The client feeds this to the shared generator to get the bubble schedule.
    seed: int
    # Which version of the game config the schedule is built from.
    config_version: int
    # The field this round is played on. The client must build the schedule with it.
    field_width: int
    field_height: int
    duration_ms: int
    started_at: datetime
    # After this the server will no longer accept a submission for the round.
    expires_at: datetime


class SubmitRequest(BaseModel):
    # What the player did, not what they scored: [{"t": ms, "x": 0..field width, "y": 0..field height}, ...].
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
