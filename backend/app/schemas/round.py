import uuid
from datetime import datetime

from pydantic import BaseModel


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
