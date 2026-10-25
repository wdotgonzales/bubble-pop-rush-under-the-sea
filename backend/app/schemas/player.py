import uuid

from pydantic import BaseModel, ConfigDict, Field


class SessionRequest(BaseModel):
    # The string returned by FBInstant.player.getSignedPlayerInfoAsync().signature
    signed_player_info: str = Field(min_length=1, max_length=4096)
    # Cosmetic. Cleaned server-side; the generous caps only stop huge payloads.
    display_name: str | None = Field(default=None, max_length=200)
    avatar_url: str | None = Field(default=None, max_length=4096)


class PlayerOut(BaseModel):
    """What the client may see about a player. Never includes the Facebook ID."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    avatar_url: str | None
    best_score: int


class SessionResponse(BaseModel):
    token: str
    expires_in: int
    player: PlayerOut


class MeResponse(BaseModel):
    player: PlayerOut
    # None until the player has a verified score above zero.
    rank: int | None
