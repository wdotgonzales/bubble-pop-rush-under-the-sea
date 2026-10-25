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
