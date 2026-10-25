# Decisions

Short records of the choices that shaped the backend, and what was traded away.
Newest PR at the bottom of each section.

## PR 1: Identity

### Trust Facebook's signature, not the client
`POST /session` accepts the `signature` string from `getSignedPlayerInfoAsync()`
and verifies it with HMAC-SHA256 using the app secret. The signature is checked
**before** the payload is parsed, so nothing attacker-controlled is trusted
until it is authenticated. The player ID comes only from the verified payload.
The client never tells us who it is.

### Fail closed when the secret is missing
If `FB_APP_SECRET` is empty, `/session` returns 503 and verification raises.
An empty secret would let anyone forge a signature, so "not configured" must
never degrade into "accept everything". Production returns 503 here until the
secret is set on the server.

### Signature freshness: 10 minutes, 60 seconds of clock skew
A signed payload is only accepted if `issued_at` is within 10 minutes (and not
more than 60 seconds in the future). This limits how long a leaked signature is
useful. **Known limit:** within that window a captured signature can be
replayed to get a session for that player. Cheap hardening for later:
pass a server-issued nonce into `getSignedPlayerInfoAsync(nonce)` and check it
(requires a nonce store). Not done: the session only grants access to that
player's own data, and score integrity is enforced separately by round replay.

### Session token: small, stateless, HMAC-signed
Format: `base64url({"sub","exp"}).base64url(HMAC-SHA256(SECRET_KEY))`, 1 hour
lifetime. `sub` is our own player UUID, not the Facebook ID, so the Facebook ID
never leaves the server. Chosen over a JWT library to avoid a dependency and
the algorithm-confusion class of bugs for a two-field token.
Trade-off: no server-side revocation. A token lives until it expires; the
mitigation is the short lifetime. `/me` also re-loads the player on every call,
so a deleted player is rejected immediately.

### Uniform auth errors
Missing, malformed, expired, wrong-key and unknown-player tokens all return the
same 401 with `WWW-Authenticate: Bearer`. Signature failures return one generic
401; the specific reason is only written to the server log.

### Atomic upsert for login
First login and re-login are one `INSERT ... ON CONFLICT (fb_player_id) DO
UPDATE`. Two simultaneous first logins cannot create two rows or raise a unique
violation. Login refreshes `last_seen_at` and overwrites name/avatar only when
a usable value was sent. It never touches `best_score`.

### Client-supplied profile fields are untrusted and cosmetic
Display name: control/format/zero-width/bidi characters removed, whitespace
collapsed, cut to 24 characters, `Diver` if nothing usable remains. Avatar:
plain `https` URLs only (no `http`, `data:`, `javascript:`), max 2048 chars,
no whitespace. These affect only how a row looks, never identity or score.

### Known risk: avatar URLs can point at any https host
Because the avatar is shown to other players, a malicious player can set it to
a URL they control and see the IP address and user agent of everyone who views
the leaderboard. Mitigation planned: once real Facebook avatar URLs have been
observed in the game, allowlist those hosts in `clean_avatar_url`. Until then
the risk is accepted for a low-traffic assessment build.

### Rank rule
Higher score first; on a tie, whoever reached that score earlier ranks higher.
Rank is `null` until a player has a verified score above zero. The same
ordering backs the leaderboard index and, in PR 4, the top-10 view.

### Secrets
`SECRET_KEY` and `FB_APP_SECRET` live only in `.env` / environment variables.
Both were rotated after being exposed once during setup. The `:?` guards in
`docker-compose.prod.yml` make a deploy fail loudly if a required value is
missing rather than starting half-configured.

## PR 2: Rounds

### The server picks the seed, the client never does
`POST /rounds/start` creates the round and returns a seed from
`secrets.randbits(32)`. The bubble schedule is a pure function of that seed, so
the server can later regenerate exactly what the player saw and replay their
taps against it. A client cannot choose a friendly seed, and a score is never
accepted without a round the server issued.

### One generator, two languages, integers only
The schedule is generated twice: `backend/app/game/spawn.py` (server) and
`shared/spawn.js` (client). They must agree exactly, or honest players would
fail validation. Three rules keep them identical:
- No floating point anywhere. Positions are integers in a 0..10000 field, times
  are whole milliseconds, chances are per-thousand, and every division is
  floor-division of non-negative integers.
- Our own PRNG (mulberry32), not `random`. Python's `random` algorithm is an
  implementation detail; mulberry32 is a few lines that behave the same in both
  languages.
- A fixed order of random draws per bubble: kind, x, y, then the gap to the next
  spawn. Adding or reordering a draw changes every later bubble.

### Golden vectors instead of trusting two copies to match
`shared/spawn-vectors.json` holds the config plus expected PRNG output, full
schedules for six seeds, and shrinking-radius probes. The Python tests check
against it, and `node shared/check-vectors.mjs` checks the JavaScript against
the same file. A test also compares `config.py` to the config stored in the
vectors, so changing a number without regenerating them fails loudly.
Changing any rule means: bump `CONFIG_VERSION`, run
`scripts/generate_spawn_vectors.py`, and update `shared/spawn.js`.
Trade-off: the vectors are generated by the Python side, so they prove the two
implementations agree, not that the algorithm is "right". That is the property
that matters here. The check is a manual command, not CI.

### Config duplicated, not shared as a file
Ideally one config file feeds both sides. The backend Docker image is built from
`backend/` alone and cannot read `../shared`, so the numbers live in
`config.py` and `spawn.js` and the vectors file keeps them honest.

### Round lifetime of 24 hours
A round can be submitted for 24 hours after it starts. The game queues finished
rounds when offline and sends them later (concept doc, section 8), so a short
expiry would silently drop honest scores. The cost is a longer window for a bot
to submit, which does not matter much: submission is still gated by a minimum
elapsed time, per-round single use, and full replay validation. As the concept
doc already says, a bot that plays perfectly valid taps cannot be stopped
without server-side gameplay.

### Start rate limit: 10 per minute per player
Counted from the `rounds` table itself, so there is no Redis or extra moving
part. The player's row is locked (`SELECT ... FOR UPDATE`) during the check, so
simultaneous requests cannot both slip under the limit. Real play starts a round
every 30+ seconds, so honest players never see a 429.

### Abandoned rounds are allowed to pile up
Players close the game mid-round all the time, so starting a new round does not
require finishing the old one. The scheduled cleanup (PR 5) expires and deletes
stale `started` rounds.

### Schema choices
- `seed` is a `BIGINT` with a check that it fits in 32 bits (a plain `INTEGER`
  tops out at 2^31 - 1), and `config_version` is an integer.
- `players.best_round_id` points back at `rounds` with `ON DELETE SET NULL`, and
  is added with `use_alter` because the two tables reference each other.
- Deleting a player deletes their rounds (`ON DELETE CASCADE`).

## PR 3a: Score validation

### The score is computed, never received
`validate_round(seed, taps)` takes the seed the server issued, regenerates the
bubble schedule, checks the tap log is humanly possible, and replays it. There
is no score field in the request at all, so there is nothing to forge. The
function is pure (no database, no clock), which is why it is tested so heavily.

### The client and server use the same hit test
`find_hit` and `replay` exist twice, in `backend/app/game/replay.py` and
`shared/spawn.js`, and are checked against the same golden vectors. The player
sees the score the server will compute. If the server were stricter or looser
than the client, honest players would see one number and the leaderboard another.
This also made `CONFIG_VERSION` 2: the hit rules are part of the config.

### Hit rules
- One tap pops at most one bubble; a bubble pops once.
- A bubble is poppable from spawn until 50 ms after it expires. The grace absorbs
  frame jitter between when the client decided a bubble was gone and when the
  tap event was stamped.
- Hit radius is the bubble's current radius, but never below 600 units
  (about 6% of the field). Without a floor a shrinking bubble becomes untappable
  just before it pops, which feels broken and breaks the 48 px tap-target rule.
- Overlapping bubbles: the newest wins, matching what is drawn on top.
- Taps on empty water cost nothing, as the concept doc says.

### Square play area
Taps are sent in the same 0..10000 square the generator uses. The client draws
the play area as a centred square (or letterboxed region). This keeps the server's
hit test a plain circle check with no aspect ratio to trust. Cost: on tall phones
some screen area is outside the bubble field; the HUD and background can use it.

### Rhythm limits
Rejected as impossible for a human: more than 400 taps, taps closer than 25 ms,
taps out of time order, and more than 16 taps inside any 1000 ms window.
Fast human tapping tops out around 10-14 taps per second. The limits are
generous on purpose: wrongly rejecting an honest round is worse than letting a
slightly fast one through, because the replay already caps what taps can earn.
The client must ignore a second touch within 25 ms of the previous one (a single
`pointerdown` handler does this naturally).

### Fail whole rounds, not partial ones
A malformed or implausible log rejects the round outright with a reason, rather
than trimming it and scoring the rest. Partial credit would make the behaviour
unpredictable and turn the validator into something to probe.

### What this does not stop
A bot that knows the seed (everyone does; the server hands it out) can tap the
exact centre of every bubble at plausible human speed and score the maximum. A
perfect-replay bot cannot be stopped without running the game on the server.
What the validator does stop: forged scores, impossible speeds, taps that do not
land on a real bubble, double-scoring a bubble, and tampered or out-of-range
logs. Leaderboard abuse of the perfect-bot kind is bounded by the maximum score
of the schedule (about 75-90) and by per-player rate limits.

## PR 3b: Submitting a round

### A round is decided once, and retrying is safe
`POST /rounds/{id}/submit` locks the round row (`SELECT ... FOR UPDATE`) for the
whole call. Two simultaneous submits run one after the other, and the second
finds a finished round. What it gets back depends on the outcome:
- accepted: the same stored result again (200), so a lost response is harmless;
- rejected: the same rejection again, so a refused round cannot be retried with
  better taps;
- expired: 410.

This matters because the game queues rounds while offline and resends them.
Idempotent accept is what makes "retry until it works" correct instead of risky.

### Status codes tell the client whether to retry
200 accepted. 404 unknown round or not yours (the two are deliberately
indistinguishable, so round ids cannot be probed). 410 expired. 422 refused.
409 the round was issued under an older game config, meaning the player needs
the new build. Any 4xx means the round is finished for good and the client
should drop it from its queue. Network errors, 429 and 5xx are the only retries.

### Only the server's clock decides if a round was long enough
A round cannot be submitted until it has lasted its full 30 seconds, minus 1
second of slack, measured from the server's own `started_at`. The client's
reported duration is stored for audit but never trusted. An honest client always
passes: its timer starts after it receives the start response, so its submission
reaches the server after at least 30 seconds. This is what stops a script
from starting a round and instantly submitting a long tap log.

### Best score: raise only on strictly higher, decided inside the UPDATE
`UPDATE players SET best_score = :s ... WHERE best_score < :s` makes the
comparison and the write one atomic step, so two rounds finishing together can
never overwrite a better score with a worse one. A tie does not move
`best_score_at`, so the player who reached a score first keeps the higher rank,
matching the leaderboard rule. `best_round_id` always points at the round that
produced the best.

### Rejected rounds are kept, their tap logs are not
A refused round is stored with its reason (`status = 'rejected'`) so abuse is
visible in the data. The raw tap log is only stored for accepted rounds: a
rejected log is attacker-controlled input, and persisting it adds nothing the
reason does not already say.

### Rate limiting submissions
There is no separate limit on submit. Each round can be submitted once and rounds
are limited to 10 starts per minute per player, so submissions are bounded by
that. Malformed requests are rejected by the request schema before touching the
database.

### Not tested: true concurrency
The locking is a few lines of standard PostgreSQL behaviour, but the suite uses
sequential requests. A test with two real simultaneous connections would be the
next addition if this ran at scale.

## PR 4: Leaderboard

### A view, not a table
`leaderboard_top` is a Postgres view over `players`, so the top 10 is computed on
read and can never drift out of sync with the scores. A separate leaderboard
table would need to be kept in step with every score change, and any bug in that
upkeep would show up as a wrong public ranking. The existing
`players_leaderboard_idx` (score descending, time ascending) serves the query,
so it is an index scan of ten rows. Alembic does not track views, so the
migration is handwritten and `alembic check` ignores it.

### One ordering rule, in two places
Higher score first; on a tie the player who reached it first; on a dead heat
(same score at the same microsecond) the lower id. The view applies this with
`ROW_NUMBER()`, and `get_rank` applies the same rule for players outside the top
10. A test checks that the ranks in the list and the ranks from `get_rank`
always agree, because a player seeing "3rd" on one screen and "4th" on another
would look like a bug.

### Only players with a score are ranked
Anyone with a best score of 0 is not listed and has no rank (`null`). The game
shows "play a round to get ranked" instead of inventing a last place.

### The caller always learns their own standing
`GET /leaderboard` returns the top 10 plus `me: {rank, best_score}`, even if the
caller is 400th. Rows carry `is_me` so the game can highlight the player's own
line without matching on names (display names are not unique).

### Nothing identifying leaves the server
Entries expose rank, display name, avatar URL and score. Not the internal player
id, and never the Facebook id. Display names and avatars are player-supplied and
cleaned on the way in (PR 1), but the avatar host risk recorded in PR 1 still
applies to everyone who views the board.

### Authenticated, not public
The route needs a session token. The board is not secret, but every legitimate
caller already has a token (the game over screen only appears after a round), it
lets the response include `me` and `is_me`, and it keeps player names off the open
internet and out of crawlers.

### Always top 10, not paginated
The concept doc shows a top-10 board. A `limit` parameter or pagination would be
easy to add on the view, but nothing in the design needs it, and a fixed small
query is the easiest to keep fast and to reason about.

### Computed live, no caching
Every request runs the query. For ten indexed rows this is cheaper than the
invalidation logic a cache would need, and a new best score shows up on the very
next request. If traffic ever justified a cache, a few seconds of `max-age` on
the response would be the first step.
