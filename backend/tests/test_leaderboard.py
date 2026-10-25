from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_session_token
from app.models.player import Player
from app.services.players import get_rank

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def _player(db, name, score=0, minutes=0, fb_id=None, avatar=None, player_id=None):
    player = Player(
        fb_player_id=fb_id or f"fb-{name}",
        display_name=name,
        avatar_url=avatar,
        best_score=score,
        best_score_at=T0 + timedelta(minutes=minutes) if score > 0 else None,
    )
    if player_id is not None:
        player.id = player_id
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _auth(player):
    token = create_session_token(str(player.id), settings.SECRET_KEY)
    return {"Authorization": f"Bearer {token}"}


def _board(client, player):
    response = client.get("/leaderboard", headers=_auth(player))
    assert response.status_code == 200
    return response.json()


def test_leaderboard_requires_a_session(client):
    assert client.get("/leaderboard").status_code == 401


def test_empty_leaderboard(client, db):
    me = _player(db, "me")
    body = _board(client, me)
    assert body["entries"] == []
    assert body["me"] == {"rank": None, "best_score": 0}


def test_players_without_a_score_are_not_listed(client, db):
    me = _player(db, "me")
    _player(db, "idle")
    assert _board(client, me)["entries"] == []


def test_entries_are_ordered_best_first_with_ranks(client, db):
    me = _player(db, "me", 10, 0)
    _player(db, "high", 90, 1)
    _player(db, "mid", 50, 2)

    entries = _board(client, me)["entries"]

    assert [(e["rank"], e["display_name"], e["score"]) for e in entries] == [
        (1, "high", 90),
        (2, "mid", 50),
        (3, "me", 10),
    ]


def test_a_tie_goes_to_whoever_got_there_first(client, db):
    late = _player(db, "late", 50, 30)
    early = _player(db, "early", 50, 5)

    entries = _board(client, late)["entries"]

    assert [e["display_name"] for e in entries] == ["early", "late"]
    assert [e["rank"] for e in entries] == [1, 2]
    assert get_rank(db, early) == 1 and get_rank(db, late) == 2


def test_a_dead_heat_is_resolved_by_id_and_agrees_with_rank(client, db):
    from uuid import UUID

    low = _player(db, "low-id", 50, 5, player_id=UUID(int=1))
    high = _player(db, "high-id", 50, 5, player_id=UUID(int=2))

    entries = _board(client, high)["entries"]

    assert [e["display_name"] for e in entries] == ["low-id", "high-id"]
    assert get_rank(db, low) == 1 and get_rank(db, high) == 2


def test_only_the_top_ten_are_returned(client, db):
    players = [_player(db, f"p{i:02d}", 100 - i, i) for i in range(12)]

    body = _board(client, players[0])

    assert len(body["entries"]) == 10
    assert [e["display_name"] for e in body["entries"]] == [f"p{i:02d}" for i in range(10)]


def test_my_row_is_flagged(client, db):
    me = _player(db, "me", 50, 2)
    _player(db, "other", 90, 1)

    entries = _board(client, me)["entries"]

    assert [(e["display_name"], e["is_me"]) for e in entries] == [("other", False), ("me", True)]


def test_my_rank_is_reported_even_outside_the_top_ten(client, db):
    for i in range(10):
        _player(db, f"top{i}", 100 - i, i)
    me = _player(db, "me", 5, 99)

    body = _board(client, me)

    assert len(body["entries"]) == 10
    assert not any(e["is_me"] for e in body["entries"])
    assert body["me"] == {"rank": 11, "best_score": 5}


def test_ranks_in_the_list_match_the_rank_route(client, db):
    players = [_player(db, f"p{i}", 40 + (i * 7) % 23, i) for i in range(8)]
    me = players[3]

    body = _board(client, me)

    for entry in body["entries"]:
        player = next(p for p in players if p.display_name == entry["display_name"])
        db.refresh(player)
        assert entry["rank"] == get_rank(db, player)
    assert body["me"]["rank"] == get_rank(db, me)


def test_entries_show_name_avatar_and_score_but_no_ids(client, db):
    me = _player(db, "Ana", 70, 1, fb_id="fb-ana-private", avatar="https://cdn.example/a.png")

    response = client.get("/leaderboard", headers=_auth(me))

    entry = response.json()["entries"][0]
    assert entry == {
        "rank": 1,
        "display_name": "Ana",
        "avatar_url": "https://cdn.example/a.png",
        "score": 70,
        "is_me": True,
    }
    assert "fb-ana-private" not in response.text
    assert str(me.id) not in response.text


def test_the_view_itself_caps_at_ten_and_ranks(db):
    for i in range(13):
        _player(db, f"v{i:02d}", 10 + i, i)

    rows = db.execute(text("SELECT rank, display_name, score FROM leaderboard_top ORDER BY rank")).all()

    assert len(rows) == 10
    assert [r.rank for r in rows] == list(range(1, 11))
    assert rows[0].score == 22 and rows[-1].score == 13


def test_the_view_follows_score_changes_immediately(client, db):
    me = _player(db, "me", 10, 0)
    _player(db, "rival", 20, 1)
    assert _board(client, me)["me"]["rank"] == 2

    me.best_score, me.best_score_at = 99, T0 + timedelta(minutes=5)
    db.commit()

    body = _board(client, me)
    assert body["me"] == {"rank": 1, "best_score": 99}
    assert [e["display_name"] for e in body["entries"]] == ["me", "rival"]
