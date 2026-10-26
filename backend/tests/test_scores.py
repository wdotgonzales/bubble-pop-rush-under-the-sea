from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.config import settings
from app.core.security import create_session_token
from app.models.player import Player
from app.models.round import Round

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def _player(db, name, fb_id=None, avatar=None):
    player = Player(fb_player_id=fb_id or f"fb-{name}", display_name=name, avatar_url=avatar)
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _round(db, player, score, minutes, status="accepted", round_id=None):
    row = Round(
        player_id=player.id,
        seed=1,
        config_version=1,
        status=status,
        expires_at=T0 + timedelta(hours=1),
        score=score if status == "accepted" else None,
        submitted_at=T0 + timedelta(minutes=minutes) if status in ("accepted", "rejected") else None,
        tap_log=[{"t": 100, "x": 1, "y": 2}] if status == "accepted" else None,
    )
    if round_id is not None:
        row.id = round_id
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _get(client, **params):
    response = client.get("/scores", params=params)
    assert response.status_code == 200
    return response.json()


def _names_and_scores(body):
    return [(e["display_name"], e["score"]) for e in body["entries"]]


def test_scores_can_be_read_without_signing_in_and_show_no_ids(client, db):
    ana = _player(db, "Ana", fb_id="fb-ana-private", avatar="https://cdn.example/a.png")
    row = _round(db, ana, 70, 1)

    response = client.get("/scores")

    assert response.status_code == 200
    body = response.json()
    [entry] = body["entries"]
    played_at = entry.pop("played_at")
    assert entry == {"display_name": "Ana", "avatar_url": "https://cdn.example/a.png", "score": 70}
    assert datetime.fromisoformat(played_at.replace("Z", "+00:00")) == T0 + timedelta(minutes=1)
    for private in ("fb-ana-private", str(ana.id), str(row.id), "tap_log", "seed"):
        assert private not in response.text


def test_every_attempt_is_listed_so_one_player_can_appear_many_times(client, db):
    ana = _player(db, "Ana")
    bo = _player(db, "Bo")
    _round(db, ana, 30, 1)
    _round(db, ana, 80, 2)
    _round(db, bo, 50, 3)
    _round(db, ana, 10, 4)

    body = _get(client)

    assert _names_and_scores(body) == [("Ana", 80), ("Bo", 50), ("Ana", 30), ("Ana", 10)]
    assert (body["total"], body["total_pages"]) == (4, 1)


def test_only_scored_attempts_are_listed(client, db):
    ana = _player(db, "Ana")
    _round(db, ana, 40, 1)
    _round(db, ana, 0, 2, status="rejected")
    _round(db, ana, 0, 3, status="started")
    _round(db, ana, 0, 4, status="expired")

    body = _get(client)

    assert _names_and_scores(body) == [("Ana", 40)]
    assert body["total"] == 1


def test_a_score_of_zero_is_still_an_attempt(client, db):
    ana = _player(db, "Ana")
    _round(db, ana, 0, 1)
    _round(db, ana, 5, 2)

    assert _names_and_scores(_get(client)) == [("Ana", 5), ("Ana", 0)]


def test_nothing_scored_yet_is_an_empty_list_with_no_pages(client, db):
    _player(db, "idle")

    body = _get(client)

    assert (body["entries"], body["total"], body["total_pages"]) == ([], 0, 0)


def test_best_is_the_default_order_and_ties_go_to_whoever_got_there_first(client, db):
    late = _player(db, "late")
    early = _player(db, "early")
    _round(db, late, 50, 30)
    _round(db, early, 50, 5)
    _round(db, late, 90, 40)

    default = _get(client)
    best = _get(client, sort="best")

    assert default == best
    assert _names_and_scores(best) == [("late", 90), ("early", 50), ("late", 50)]
    assert best["sort"] == "best"


def test_a_dead_heat_is_resolved_by_id(client, db):
    ana = _player(db, "Ana")
    _round(db, ana, 50, 5, round_id=UUID(int=2))
    _round(db, _player(db, "Bo"), 50, 5, round_id=UUID(int=1))

    assert [e["display_name"] for e in _get(client)["entries"]] == ["Bo", "Ana"]


def test_recent_lists_the_newest_attempt_first(client, db):
    ana = _player(db, "Ana")
    bo = _player(db, "Bo")
    _round(db, ana, 80, 1)
    _round(db, bo, 10, 3)
    _round(db, ana, 20, 2)

    body = _get(client, sort="recent")

    assert _names_and_scores(body) == [("Bo", 10), ("Ana", 20), ("Ana", 80)]
    assert body["sort"] == "recent"


def test_the_response_says_where_it_is_in_the_list(client, db):
    ana = _player(db, "Ana")
    for i in range(25):
        _round(db, ana, 100 - i, i)

    body = _get(client)

    assert (body["page"], body["page_size"], body["total"], body["total_pages"]) == (1, 10, 25, 3)
    assert len(body["entries"]) == 10


def test_later_pages_continue_the_list(client, db):
    ana = _player(db, "Ana")
    for i in range(25):
        _round(db, ana, 100 - i, i)

    second = _get(client, page=2)
    last = _get(client, page=3)

    assert [e["score"] for e in second["entries"]] == [90 - i for i in range(10)]
    assert [e["score"] for e in last["entries"]] == [80, 79, 78, 77, 76]


def test_the_page_size_can_be_changed(client, db):
    ana = _player(db, "Ana")
    for i in range(25):
        _round(db, ana, 100 - i, i)

    body = _get(client, page=2, page_size=4)

    assert [e["score"] for e in body["entries"]] == [96, 95, 94, 93]
    assert (body["page_size"], body["total_pages"]) == (4, 7)


def test_a_page_past_the_end_is_empty_and_not_an_error(client, db):
    ana = _player(db, "Ana")
    _round(db, ana, 10, 1)

    body = _get(client, page=5)

    assert body["entries"] == []
    assert (body["page"], body["total"], body["total_pages"]) == (5, 1, 1)


def test_paging_never_repeats_or_drops_an_attempt_even_with_ties(client, db):
    # Plenty of equal scores and equal times, so only the tie-breaks decide the order. Every
    # attempt has its own player name, so a repeated or missing row would show up in the lists.
    for i in range(17):
        _round(db, _player(db, f"p{i:02d}"), 50 if i % 3 else 40, i % 4, round_id=UUID(int=i + 1))

    for sort in ("best", "recent"):
        whole = _get(client, page_size=50, sort=sort)["entries"]
        pieces = []
        for page in range(1, 6):
            pieces += _get(client, page=page, page_size=4, sort=sort)["entries"]
        assert pieces == whole, sort
        assert sorted(e["display_name"] for e in whole) == [f"p{i:02d}" for i in range(17)], sort


def test_bad_parameters_are_refused(client, db):
    for params in (
        {"page": 0},
        {"page": -1},
        {"page": 10_001},
        {"page": 10**30},
        {"page": "abc"},
        {"page_size": 0},
        {"page_size": 51},
        {"page_size": "ten"},
        {"sort": "oldest"},
        {"sort": ""},
    ):
        assert client.get("/scores", params=params).status_code == 422, params


def test_a_session_is_not_needed_and_changes_nothing(client, db):
    ana = _player(db, "Ana")
    _round(db, ana, 10, 1)
    token = create_session_token(str(ana.id), settings.SECRET_KEY)

    anonymous = client.get("/scores")
    signed_in = client.get("/scores", headers={"Authorization": f"Bearer {token}"})
    garbage = client.get("/scores", headers={"Authorization": "Bearer not-a-token"})

    assert anonymous.status_code == signed_in.status_code == garbage.status_code == 200
    assert anonymous.json() == signed_in.json() == garbage.json()
