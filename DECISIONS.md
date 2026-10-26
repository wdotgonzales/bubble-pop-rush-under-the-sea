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
- No floating point anywhere. Positions are integers in a 10000 x 21640 field, times
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
- Hit radius is the bubble's current radius, but never below 900 units
  (about 9% of the field width, 35 px on a 390 px wide phone). Without a floor a shrinking bubble becomes untappable
  just before it pops, which feels broken and breaks the 48 px tap-target rule.
- Overlapping bubbles: the newest wins, matching what is drawn on top.
- Taps on empty water cost nothing, as the concept doc says.

### Play area
Taps are sent in the same field the generator uses. This started as a square and
became portrait in PR 6 (below). Either way the server's hit test stays a plain
circle check in field units, with no screen size to trust.

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

## PR 5: Maintenance and handoff

### Cleanup is a command, run by cron, not a scheduler inside the app
`python -m app.jobs.cleanup` does one pass and exits. The alternative, a background
scheduler inside the web process, would run once per worker (so several times over
if the app is ever scaled), die with the web process, and add a dependency. A
command is trivial to run by hand, to test, and to put in a crontab. The cost is that
someone must add one cron line on the server; the README gives it verbatim. Every
step is idempotent, so a missed or doubled run is harmless.

### Retention
- Unsubmitted rounds past their expiry become `expired`, and are deleted 7 days
  later. They never produced a score, so nothing refers to them.
- Accepted and rejected rounds are never deleted: they are the audit trail for the
  leaderboard.
- The stored tap log (the bulky part, up to ~400 taps) is dropped after 30 days,
  except for each player's best round, which stays as the evidence behind their
  rank. Score, status and timings stay on every round.

### nginx is recreated on every deploy
nginx's config is a bind-mounted single file. When `git pull` replaces that file,
the running container keeps seeing the old inode and silently serves a stale
config. This caused a real 404 on the first production deploy (every API call
arrived as `/api/api/...`). Reloading nginx does not help, because the container's
view of the file is what is stale. Recreating the container fixes it and costs about a second
of downtime per deploy, which is acceptable for this project.

### README as the entry point
The README is written for someone who has never seen the project: what it is, how
to run it, how to try the full flow without a game client (the bot and signature
scripts), how deployment works, and what is knowingly not solved.

## PR 6: Portrait field, design-sized bubbles

> Superseded in part by PR 10b: the field is still integer units and the client still scales both axes
> equally, but its shape is now chosen per round to fit the window instead of being fixed at 10000 x 21640.

### Why the square field was replaced
The design is portrait: phone screens are 390 x 844, and the desktop layout shows
the same portrait play column with the timer and score on either side. A square
field on that screen has two bad options. Letterbox it, and more than half the
screen is dead space. Stretch it to fill, and every bubble becomes an oval on
screen while the server still tests hits as circles, so taps near the top or
bottom of a bubble would miss.

The field is now 10000 wide and 21640 tall (the 390:844 ratio). The client scales
both axes by the same factor to fit the play area, so bubbles stay round and the
server's circle test matches what is drawn. On desktop the column is simply
narrower than on a phone.

Alternatives considered and rejected:
- Send the screen size and let the server adapt: one more client-controlled input
  to validate, and a different schedule on every device, so players would not be
  comparable.
- Several field shapes by device: the same problem, plus more to test.

### Bubble sizes follow the design
The largest bubbles in the mockups are about 135 px across on a 390 px wide
screen. The old radii (900 and 800 on a 10000 wide field) would have drawn fresh
bubbles about 70 px across, half the intended size. Radii are now 1700 (standard)
and 1400 (pearl), and the minimum tap radius is 900. The spawn timings, lifetimes,
pearl chance and the number of random draws are unchanged, so every round has the
same rhythm and the same number of bubbles as before. Only positions and sizes
differ. Bigger bubbles make the game a little easier; the difficulty comes from
the phases (faster spawns, shorter lifetimes), which is where it should come from.

### Config version 3
The change alters every generated schedule, so `CONFIG_VERSION` is 3 and the shared
vectors were regenerated. A round started under version 2 that is submitted after
the deploy gets 409 (the client build is out of date) and is dropped. That is the
designed behaviour; with no real players yet it costs nothing.

## PR 7: Client foundation

### React and TypeScript, not plain TypeScript
The concept doc proposed plain TypeScript with a hand-written screen switcher. The
project already used React and Vite, and Start, Game Over and the leaderboard are
ordinary UI with a little state, which React expresses well. The part that should not
go through React is the 60 fps game loop, so gameplay will be one Canvas driven by
requestAnimationFrame, mounted by a React component. Tailwind styles the screens.
Cost: React adds about 45 KB gzipped, well inside Facebook's 5 MB guidance.

### Facebook is behind one interface, with a mock
Every Facebook call (init, signed player info, player data, share) goes through the
`Platform` interface, so the game never touches `window.FBInstant`. Outside Facebook
a mock stands in. Facebook's signature can only be made with the app secret, so the
mock takes a signature produced by `backend/scripts/make_test_signature.py` (valid for
10 minutes) from the URL: `?mock_signature=...`. During `npm run dev` the mock is used
automatically; `?mock=1` forces it in a production build.

### One small API client
A typed fetch wrapper with a timeout and a bearer token, and two error types: `ApiError`
(the server answered with an error; carries the status and the machine-readable code)
and `NetworkError` (no usable answer: offline, CORS, timeout). `isRetryable` encodes the
submit route's contract: network errors, 429 and 5xx are retried, every other 4xx means
the round is finished for good. A 401 signs in again and retries once.

### Session renewal
The backend accepts Facebook's signed player info for 10 minutes and gives back a
one-hour token. The session manager signs in again a minute before expiry, always with
a fresh signature from Facebook, and shares one sign-in between overlapping callers so
a burst of requests cannot trigger several. A failed sign-in is not remembered.

### The client imports `shared/` directly
The spawn generator is imported from `../shared` through an alias, not copied. The
golden vectors the server's tests use also run through the client's own toolchain, so
a drift between the generator, the build and the server fails a test. Cost: the
frontend Docker image can no longer be built from `frontend/` alone. Its build context
is now the repository root (`frontend/Dockerfile`, with a `.dockerignore` beside it
that keeps `node_modules`, `.env` and the backend out).

### A version guard on every round
A round carries the server's `config_version`. If it differs from this build's, the
schedule would differ too, so the client refuses to play it. The server would answer 409
on submit anyway; this fails earlier and says why.

### A connection check as the first screen
The home screen is a temporary page that walks the real path: platform, backend,
sign-in, profile, start a round, build its schedule. It exists so a first build can be
staged on Facebook early. Two things have only been tested with our own stand-ins until
then: a real Facebook signature against the backend, and the Facebook origin against
CORS. The page prints its own origin, which is exactly what `CORS_ORIGINS` needs.

### Facebook bundle settings
`fbapp-config.json` sets `NAV_BAR` (a fixed bar, so the menu cannot cover the timer and
score pills), `PORTRAIT` for phones, and a `LANDSCAPE` override for desktop, matching
the two layouts in the design. The SDK script tag is `fbinstant.8.0.js`, the version
Facebook's upload documentation currently names. `npm run pack` zips `dist/` with
`index.html` and `fbapp-config.json` at the root of the archive, as Facebook requires.
The zip writer is about 70 lines on Node's built-in zlib rather than a dependency, and
produces identical bytes for identical input.

### Facebook's SDK 8.0 has no player names or photos
The first staged build found this: `FBInstant.player.getName()` and `getPhoto()` do not
exist in SDK 8.0 ("Network Enabled Zero Permissions"). Facebook removed them; names and
photos can only be shown inside Facebook-controlled overlay views, and a game may not
store them on its own server. `getID()` and `getSignedPlayerInfoAsync()` still exist, so
sign-in is unaffected. The client therefore treats name and photo as optional: it sends
them when an older SDK offers them and sends nothing otherwise. What the leaderboard
shows as a name is a separate decision (see the next PR).

### Production builds point at the production API
Vite reads `frontend/.env` in every build, so the first Facebook zip had the local
`http://localhost:8000` baked in. The fix is in the build, not in a second env file: `npm run build` runs Vite through
`scripts/build.mjs`, which sets `VITE_API_BASE_URL` to an empty string. Variables that exist
when Vite starts win over `.env` files, and `config.ts` treats empty as unset, so a build uses
its default, the public API. `frontend/.env` stays the one file for local development, with
nothing to flip before a build. `npm run pack` also refuses to zip a bundle that contains a
localhost address. The production address lives only in `config.ts`.

### TypeScript is pinned to 6
A fresh install pulls TypeScript 7, which `typescript-eslint` does not support yet, so
`npm run lint` fails to start. TypeScript 6 type-checks the same code and keeps lint
working. Revisit once `typescript-eslint` supports 7. `.npmrc` sets `legacy-peer-deps`,
matching the Docker build, because the lint plugins' peer ranges lag behind ESLint 10.

### Not here yet
The game itself, the real screens, the offline queue and sharing. This PR is the
foundation they stand on.

## PR 8: Generated nicknames

### Why
Facebook Instant Games SDK 8.0 no longer gives a game the player's name or photo, and
games may not store them on their own servers. Names and photos only appear inside
overlays that Meta controls. Without a name from somewhere, every leaderboard row would
read `Diver`. So the server gives each player a friendly nickname of its own.

### What
`generate_nickname(fb_player_id, secret)` returns `<Adjective><SeaCreature><3 digits>`,
for example `BrightTurtle482`. The word lists have 32 entries each, so a digest byte maps
onto a list with no bias, and the digits make about a million combinations.

- **Derived, not random.** The name comes from HMAC-SHA256 under `SECRET_KEY`, so the same
  player always gets the same name, and the name carries nothing that can be traced back to
  the Facebook id.
- **Stored once.** It is written when the player is created and then lives in
  `display_name` like any other name. Rotating the secret later renames nobody.
- **Not unique, on purpose.** The leaderboard identifies rows by rank, so two players with
  the same nickname are harmless. Enforcing uniqueness would add a retry loop and a failure
  mode to sign-in for no visible benefit.
- **Fits the design.** The Figma leaderboard shows names such as SeaExplorer and PearlDiver;
  these read the same way.

### Rules at sign-in
- The client sent a name: it is used, as before.
- No name, new player: the nickname is stored.
- No name, existing player still called `Diver` (a row from before this change): the next
  sign-in replaces the placeholder with the nickname. This runs in the same atomic upsert
  and no data migration is needed.
- No name, existing player with any other name: left alone. A real name is never replaced.

The database default stays `Diver`; it is only a placeholder now.

### Rejected
- **Fall back to SDK 7.1** so names exist: that SDK is legacy and its availability is
  uncertain, and the policy against storing names would still apply.
- **Guest-1234 style names:** work, but read as anonymous. The themed names make the
  leaderboard feel like part of the game.

## PR 9: Start and Game Over screens

### What
The Start screen and the Game Over screen with the top-10 leaderboard, built from the Figma
frames in portrait (mobile) and landscape (desktop). The real flow is Start, then a
placeholder where the game goes. The Game Over screen is complete but is not reachable
until the gameplay PR wires it in; `?preview=start` and `?preview=over` show it now.

### How the layout works
- **A fixed stage, scaled.** Each screen is laid out in Figma pixels on a stage (390x844
  portrait, 1024x559 or 1024x576 landscape) and scaled with one `transform: scale()` to fit
  the window. This keeps the Figma proportions exact on any phone or browser size, and it
  is the same approach the canvas will use. The scale is capped at 2.5 so nothing blows up
  on a large monitor.
- **Portrait or landscape** is picked from the window shape: landscape when width/height is
  at least 1.15. Geometry for both lives in one file (`screens/geometry.ts`).
- **Built in CSS where possible.** Buttons, panels, titles, bubbles and the leaderboard are
  CSS and live text, so they stay sharp at any scale and the labels can change. Only the
  background scenes, the shell and the character art are images.
- **Fonts are bundled** with `@fontsource` (latin subsets only) instead of loaded from Google
  Fonts. Inside Facebook the game must not depend on a third-party request, and the preload
  step waits for the fonts so text never jumps.
- **Boot preload never blocks.** `runPreload` times out a slow asset after 4 seconds and
  never rejects, so a failed image cannot leave the player on the loading screen.

### Leaderboard states
Loading skeleton, error with a retry button, empty ("be the first"), and rows. Rank 1 is
highlighted as in the design, the player's own row has a ring, and a player outside the top
10 sees their rank pinned under the list. The list scrolls on a small screen; the pinned
row is opaque so scrolling rows never show through.

### Smaller choices
- The gear button is a mute toggle, saved with the platform's `setData`. It is the only
  setting the game has, so a settings screen would be empty.
- The Share button only renders when a share handler exists, so it never shows as a dead
  button before the share card PR.
- Preview routes (`?preview=...`) exist so the screens can be reviewed without playing a
  round: `layout`, `score`, `best`, `new` and `board=loading|error|empty` are supported.
- The old connection check moved to `?debug=1`.

### Known limits
- **Desktop layout is approximate.** The Figma API call limit on the free plan ran out
  before the desktop frames' details could be read, so the desktop layout follows
  screenshots and layer sizes. The Game Over turtle on desktop reuses the mobile art and
  leaves out the flippers that overlap the score pill.
- **Backgrounds and the shell are 1x images.** They are soft gradients, so this is hard to
  see, but they would be softer on a very high-density screen.
- **Floating bubbles are CSS approximations** of the glossy bubbles in the design.
- Character and icon art are SVGs fetched by `fetch-art.sh`; the download links Figma gives
  out expire, so the files are committed and the script is not.

## The API hostname changed to bubble-pop-rush.fyi

### What happened
The backend first lived at `bubble-pop-rush.xyz`, bought on Namecheap. The registrar sent a
"verify your contact information" email that went unnoticed. When the deadline passed it
cancelled and refunded the order, locked the account, and the name stopped resolving
(NXDOMAIN on every public resolver). Verifying the email afterwards did not bring it back,
and the name was taken by someone else within minutes. Nothing was wrong with the server:
all containers stayed healthy throughout.

### Decision
Buy a new name at Cloudflare Registrar, where DNS, the proxy and the certificate already
live, so the registrar, DNS and TLS are one account. The new name is `bubble-pop-rush.fyi`.
The only places that name the host are the default in `frontend/src/config.ts` and the README
link. The server, nginx and `CORS_ORIGINS` did not change, because CORS lists the game's
origin, not the API's, and nginx answers any hostname.

The zone needed the same two things as before: an `A` record to the server and SSL mode
**Flexible**. A new zone does not start in Flexible, and until it was set the site returned
Cloudflare error 521, because the server has no TLS on port 443.

### Lessons
- Verify the registrant email the moment a domain is bought. Registries suspend or cancel
  an unverified domain after a short window.
- Turn on auto-renew and keep the contact email current.
- The host is set in one place, `config.ts`, so a future move is a one-line change.
- The staged Facebook build from before the move calls a hostname that is no longer ours.
  Replace staged builds after any hostname change.

## PR 10: Gameplay

### What
The round itself, on a canvas, and the whole loop around it: DIVE IN, a short countdown,
30 seconds of popping, the game over screen with the server's verdict and the refreshed
leaderboard, and PLAY AGAIN. `?preview=play&seed=123` runs a round with no network, for
reviewing the look.

### The rules are separate from the drawing
`game/engine.ts` (`GameRound`) knows nothing about the screen, a timer or React. The caller
passes in the clock, so the same code is tested with a fake clock and used with
`performance.now()`. It uses the same schedule and the same hit test as the server
(`shared/spawn.js`) and records every tap in the format the server replays. A test plays a
round with a perfect player and with a flood of random taps and checks that the score the
screen shows equals `replay()` of the tap log, which is what the server computes.

### The tap limiter
The server refuses a whole round that breaks its rhythm rules (taps at least 25 ms apart,
at most 16 in any second, at most 400 in all). An honest player must never lose a round to
that, so the game drops a tap that would break a rule instead of recording it. A dropped
tap does nothing on screen. The limits are copied from `validator.py` into `engine.ts` and a
test re-implements the server's check and runs a button-masher through it. If the server
limits change, change both, and the test fails if the engine ever produces a log the server
would refuse.

### Time
Round time is the time actually played. A pause stops the clock and is never counted, so a
tap after a long pause is logged at the time it would have had without it. The server
measures the minimum time from its own `started_at` (30 seconds minus 1), so the 1.8 second
countdown before the round only makes the player wait longer than needed, never too short.
The score the game over screen shows first is the local one; once the server answers, its
score replaces it, so what the player sees at the end is what is saved.

### Drawing
- **The field fits the window.** The play field is a rectangle of game units whose shape is
  chosen for each round to fill the window: tall on a phone, wide on a desktop, in between on a
  tablet (see "PR 10b"). The first version used one fixed portrait field everywhere, which left
  a narrow column on a desktop. A tap is converted back into field units, so the server can
  replay it, and a tap outside the field is ignored.
- **The score and timer have a strip of their own.** The field is fitted below it, and the
  game asks for a field that fits the space that is left, so a bubble can never spawn behind
  them (the first version drew the field under the HUD). The strip grows with the safe-area
  inset on a phone with a notch.
- **Canvas for the bubbles, DOM for the text.** The score and timer are normal elements
  over the canvas, updated directly when they change, so no frame re-renders React.
  Only the sound button takes taps.
- **Bubbles keep the look of the menu bubbles** (tint, rim, glint), drawn with gradients.
  A pearl is gold with a twinkling star, so it is easy to spot.
- **A slow drift** of up to 70 units on each axis (4 px on a phone) makes bubbles feel alive.
  Hit tests always use the real position. The hit radius is never below 900 units, far more
  than the drift, so what you tap is what you hit.
- **Effects are cosmetic.** `game/effects.ts` holds bursts, rings, "+1" text, ripples and the
  streak message at 5, 10, 15 and every 5 after. It never touches the score or the tap log.
- **The last 5 seconds**, the timer turns pink and beats.

### Pausing
Leaving the tab or the app pauses the round (`visibilitychange`). The player taps CONTINUE
when ready. A countdown interrupted this way starts again from 3. There is no pause
button, so a round cannot be paused to wait for a better bubble.

### Sending the score
The game over screen shows at once and the score is sent in the background, so the player
can already start the next round. `submitWithRetry` follows the submit contract: 404, 409,
410 and 422 mean the server has decided and are not retried; a network error, 429 or 5xx is
retried after 0.8, 2.5 and 6 seconds (a longer `Retry-After` is respected, up to 10 s).
The submit is idempotent, so a retry never counts twice. While it is in flight the line
under the score reads "Saving score...", and if every try fails, "Score not saved". The
leaderboard is refreshed once the score is accepted.

### Sound
A few short tones made with the Web Audio API, so there are no audio files to load. The
pitch rises with the streak, a pearl rings twice and the end of a round has three notes.
The context is created on the first tap, because browsers refuse sound before one. The
gear in the corner mutes it, and the choice is kept.
(Replaced in PR 12: one engine for the whole visit, music, and a settings window.)

### Smaller choices
- DIVE IN and PLAY AGAIN show "DIVING..." and wait for the server, so a double tap cannot
  start two rounds (the server allows 10 starts a minute).
- If a round cannot be started, the player stays on the start screen with a plain reason
  (no connection, too many rounds, or an out-of-date build). No technical detail is shown.
- `GameStub` and its styles are gone.

### Known limits
- **A failed submit is not kept.** (Fixed in PR 11: the score is now written down before it is
  sent and kept until the server has answered.)
- **No Figma frame for the playfield was available**, so the HUD and effects follow the style of
  the Start and Game Over screens. The canvas is drawn on the CPU every frame; with at most
  about ten bubbles on screen that is cheap, but I have not measured it on a low-end phone.
- **I could not listen to the sound**, only check that it is created and respects the mute.
- **Resizing mid-round.** The field is fixed when the round starts. If the window is resized or
  the phone is turned during a round, the field is fitted into the new window (with margins on
  the sides) and the next round asks for a shape that fits.

## PR 10b: The play field fits the window

### What
The playing area now uses the whole window on every device: tall on a phone, wide on a
desktop, in between on a tablet. Before, the field was one fixed portrait rectangle
(10000 x 21640 units), so a desktop window showed a narrow column in the middle.

### Why this reaches the server
The score is computed on the server by replaying the tap log against the bubbles it rebuilds
from the seed (`validator.py`). Both sides must therefore agree on the size of the field: it
decides where bubbles spawn and which taps are in range. A wider field cannot be done in the
client alone, or taps would land where the server has no bubbles.

### How it works
- `POST /rounds/start` takes an optional body `{field_width, field_height}`. Without a body the
  round uses the default portrait field, so nothing that calls it without one breaks.
- The server checks the shape (`config.is_valid_field`): integers, each side from 8,000 to
  64,000 units, and the long side at most 3 times the short one. Anything else is `422
  invalid_field` and no round is created or counted against the rate limit.
- The field is stored on the round (`field_width`, `field_height`, migration `0004`, default
  10000 x 21640 for existing rows) and returned in the start response. Submit rebuilds the
  schedule and bounds-checks the taps with the round's own field, never with anything the client
  sends later.
- `generate_schedule(seed, field)` / `generateSchedule(seed, field)`: the field only sets the size
  of the x and y draws. The number of random draws is the same, so a seed gives the same bubbles at
  the same moments (spawn times, kinds, lifetimes, the top score) on every field. Only the positions
  differ. A test checks this.
- Config version 3 became 4, because positions for a given seed changed shape. A round started under
  version 3 is refused with 409 on submit, and an old client sees "out of date, reload".
- The golden vectors (`shared/spawn-vectors.json`) now carry a field for every schedule and replay and
  include a desktop, a tablet, the largest and the smallest field. Python, JavaScript and the client
  tests all check them.

### How the client chooses the field
A standard bubble should be a comfortable size on every screen, so the size is chosen first and the
field is whatever fits in the window at that size (`game/field.ts`):
- the on-screen radius of a standard bubble is 17% of the window's shorter side, kept between 56 and
  78 px (about 66 px on a phone, 78 px on a desktop);
- pixels per unit is that radius over 1700 units, raised a little on a huge window so the field stays
  within the server's maximum;
- the field is the window (minus the strip for the score and timer) divided by that scale, rounded
  and clamped to the server's bounds and its 3:1 limit.
On a 390 x 844 phone this is 10000 x 19231, nearly the original field. On 1280 x 720 it is about
27900 x 13600.

### Does the field shape make the leaderboard unfair?
It cannot raise the maximum score: every field offers the same bubbles at the same times, so the best
possible score is the same everywhere. It can change how far apart bubbles are. A mouse crossing a wide
window and a thumb on a phone are different in any case, and the leaderboard has never been split by
device. I judged this acceptable for a game of this size, and the next step if it matters would be a
leaderboard per device class.

### Does letting the client choose the field open a hole?
A player could ask for the smallest field (8000 x 8000). Bubbles then overlap more, which hides older
ones (the newest wins) and does not raise the maximum. A bot that knows the seed could already tap
every bubble on any field, which is the documented limit of this design, and the field gives it nothing
more. The server never takes the field from a later request, only from the start.

### Deploying
The migration only adds two columns with defaults, so the old backend code keeps working against the new
schema. Backend and client ship together (merging builds and deploys both). A client built before this
change sees config version 4 and shows the out-of-date notice. A new client talking to an old server
would see version 3 and do the same.

### Known limits
- **The field is fixed per round.** Resizing the window or turning the phone during a round fits the
  same field into the new window with margins (see PR 10).
- **Very wide or tall windows** beyond the 3:1 limit keep margins at the sides.
- **The Start and Game Over screens are unchanged:** a 1024-wide desktop stage and a 390 x 844 phone
  stage, scaled to fit. Only the round uses the whole window.
- **The hit radius is in units.** The smallest tappable bubble is 900 units, which is 34 px on a
  phone and 41 px on a desktop.

## PR 11: When the network is not there

### What goes wrong in real use
A 30-second game is played on a phone, often on a bus or on a weak connection. The three failures
that matter are: the score cannot be sent (the player has just earned it and it vanishes), a new round
cannot be started (the button does nothing), and the page itself crashes (a blank screen). Each now has
a defined behaviour instead of a silent one.

### The score is written down before it is sent
`ScoreQueue` (`game/pending.ts`) owns every finished round until the server has answered:

| What the send did | What happens |
|---|---|
| accepted | forget it, show the server's score, refresh the board |
| 404, 409, 410, 422 | the server decided; sending again cannot change that, so forget it ("Score not saved") |
| network error, 429, 5xx | keep it and try again later ("Will save later") |
| round past its 24-hour expiry | forget it; the server would refuse it |
| an error nobody expected | keep it (losing a score is worse than one pointless retry) |

This is the same contract `submitWithRetry` already followed (PR 10); the queue adds memory. The submit
is idempotent on the server (PR 5), so sending a score twice, from two tabs or after a crash between
"sent" and "forgotten", can never count it twice. That property is what makes "keep trying" safe.

- **Write first, then send.** The write starts before the request, so a page closed mid-send still
  has the score next time. Writes are chained so the stored list is always the latest.
- **Where it is stored.** In the platform's player data (Facebook's, which follows the player) AND in
  this device's `localStorage`. Facebook's call needs a connection, which is exactly when a score is
  waiting; the local copy is what survives closing the page offline. Reading merges both and drops
  repeats by round id. Either can fail (private mode, blocked storage, offline) without breaking the
  game; the in-memory queue still works for that visit.
- **When it is retried.** Right after a round (the same 0.8 / 2.5 / 6 second tries as before), then
  when the browser reports it is back online, when the game becomes visible again, every 30 seconds
  while anything is waiting, and once at start-up for scores left by an earlier visit. A retry sends
  the oldest score first and stops at the first one that cannot get through, so a dead connection costs
  one request, not ten.
- **Stored data is not trusted.** What is read back is validated field by field (integers, at most 400
  taps, not expired); damaged entries are skipped. At most 10 scores are kept; if there are more, the
  oldest are dropped.
- **The screen follows.** The game over screen shows "Saving score…", then "Will save later" if the
  tries ran out, then the real result if it gets through while the player is still there. If the score
  gets through after the player has moved on, the best score on the start screen is refreshed.

### Practice mode
If a round cannot be started (no connection, server down, rate limit, the game could not sign in), the
start screen offers "Play a practice round" under the reason. It uses the same shared schedule and the
same engine as a real round with a random local seed, so it plays identically, but nothing is sent: its
game over says "Practice round" and it cannot reach the leaderboard. A practice round cannot be used to
cheat for the obvious reason that its score is never submitted; the server never hears of it. PLAY AGAIN
after a practice round asks for a real round, so the player is back on the board as soon as the connection is.

### The next round is fetched ahead
While the game over screen is showing, the next round is requested. PLAY AGAIN then starts at once, and
works even if the connection dropped in between. A fetched round is used only if it is under 5 minutes old
and its field still fits the window (within 10% per side, so a turned phone gets a new one). Otherwise it
is thrown away and a new one is requested. The cost is one extra start request per game, well inside the
10 per minute allowed, and an unplayed round now and then (harmless: it is never submitted).

### The pictures stay in memory
Found by testing offline: after the network was cut, the Game Over screen showed a broken-image icon where
the turtle should be and had lost its background. The game already downloaded every picture at start-up,
but that is only a hint to the browser's cache. A picture that nothing on screen is using can be dropped,
and a screen opened for the first time later asks again, with no connection to answer. So each picture is
downloaded once at start-up, kept in memory as a blob, and the screens draw from the in-memory copy
(`ui/artCache.ts`, read through `art` in `ui/art.ts`). If a server sends a picture without an image type,
the file extension is used, because a blob without one will not draw. If the download fails (offline at
start-up) the original address is used, as before.

The screens wait for the pictures before the first draw (a plain sea-coloured screen, hidden behind
Facebook's own loading screen in the game), so a screen is never redrawn from the network address to the
in-memory one while the player is looking at it.

### A blank screen found after deploying, and what it taught
The first deploy of PR 11 showed an empty sea-coloured page when the game's address was opened in a plain
browser. The cause was my own: the screens waited for the "booting" step to finish before drawing, and that
step starts with Facebook's `initializeAsync()`, which never answers outside Facebook. So the wait never ended.
The same missing limit hid a second, older problem: signing in also asks Facebook for the signed player
info, so outside Facebook "DIVING..." would have waited for ever instead of failing.

Two fixes, both about never waiting on something that may not answer:
- The screens now wait only for the pictures (which come from our own server), and at most 3 seconds
  (`useArtReady`). They no longer depend on Facebook at all.
- Signing in gives Facebook 10 seconds to hand over the signed player info (`withTimeout`, `api/timeout.ts`).
  After that the start fails with a clear reason, a practice round is offered, and a later tap tries again.

The lesson is general: any wait on the platform needs a limit, and "the first screen" must not be behind one.
The test that would have caught it is to open the deployed address in a normal browser, which I had not done
before merging.

### Smaller choices
- A start is not attempted when the browser says it is offline, so the reason appears at once instead of
  after the 10-second timeout.
- A crash screen (`ErrorBoundary`) replaces a blank page if drawing a screen throws: a plain message and a
  Reload button. A waiting score is already written down, so reloading does not lose it.
- A queued score is never shown as saved. The line under the score says what is true.
- On a wide screen the Game Over layout has SHARE on the left and PLAY AGAIN on the right. With no SHARE
  (it is not offered yet, and will not be for a practice round) PLAY AGAIN used to stay in the right-hand
  slot, off to the side of the score. It now sits under the score when SHARE is absent
  (`OVER.landscape.playAlone`), and `tests/geometry.test.ts` checks it stays centred and clear of the board.
  The phone layout stacks the buttons in a centred column, so it was never affected.

### Known limits
- **A score only survives if some storage worked.** If both Facebook's player data and localStorage are
  unavailable (a private window offline), a score waiting when the page is closed is lost. It is kept for
  the whole visit in memory.
- **Offline at start-up.** If the game is opened with no connection at all, the pictures cannot be kept and
  the screens cannot draw them. The game does not work without its first load; only a network lost *after*
  loading is handled.
- **Playing offline is not ranked.** Practice rounds are local only; there is no way to play a ranked round
  without a connection, by design (the server issues the seed and the clock).
- **Not tested with a real flaky network.** The retry, queue, storage and expiry rules are unit tested
  with simulated failures. The page-level behaviour (offline events, closing the page mid-send) should be
  checked by hand: switch the network off in DevTools, finish a round, switch it on.
- **Two devices, one player.** If the same player has waiting scores on two devices, Facebook's copy is
  overwritten by whichever wrote last; each device keeps its own local copy, so neither loses its own.

## PR 12: Music, more sounds and a settings window

### What the player gets
Background music on every screen, a countdown beep and a "go" sound, a soft sound on every button, a tune
when the game over screen appears (and a brighter one for a new best), and the old pops. The gear in the
corner now opens a settings window instead of just muting: a switch and a volume slider for the music, and
the same for the sound effects. The choices are remembered. A slash on the gear means nothing can be heard.

### One audio engine for the whole visit
Before, each round made its own audio context and closed it at the end, so nothing could play across
screens. Now `audio/engine.ts` owns one context, with two volumes in front of it (music and effects) and a
compressor behind them so the music and a burst of pops never add up to a crackle. Screens ask for sounds by
name (`pop`, `tick`, `go`, `end`, `gameOver`, `newBest`) and never touch Web Audio.
- Sound is unlocked by the first tap or key press anywhere (`SoundProvider`), which also starts the music.
- Every button gets its tap sound from one click listener in the provider, so no screen has to ask for it.
- When the page is hidden everything is suspended, and the music picks up where it was when it comes back.
- Turning the music off or to zero stops the music writing itself, so it costs nothing while it is off.

### The music is written as notes, not recorded
There are no audio files. `audio/music.ts` is a table of notes (eight bars, four chords, a pad, a bass and
a plucked tune that echoes) and `audio/voices.ts` plays them with oscillators. Reasons: nothing to download
(Facebook's size guidance is 5 MB and the pictures already use most of it), no licence to worry about, and
it starts at once. The cost is that it sounds like a synthesiser, not a band. If a recorded track is wanted
later, only `startMusic` in the engine has to change to play an audio file instead.
I cannot listen, so I checked what a machine can check. I rendered the music and every sound offline in a
real browser engine and measured them:
- Nothing clips (the loudest peak with the music at full volume is well under 0 dB).
- At the default sliders the music sits about 7 dB under a pop, so pops stay clear. Turning the music slider
  all the way up lets it pass the pops, which is the player's choice.
- The three parts are about equally loud, and the bass has a quiet octave above it, because a phone speaker
  cannot play the low note.
Whether it is pleasant is a matter of taste that only a person can judge.

### Volume sliders are not straight lines
Loudness is heard on a curve, so a slider that maps 0 to 1 straight onto the volume feels as if nothing
happens until the very top. The slider position is squared (`gainFor`). Dragging the effects slider plays a
sample pop (at most every 140 ms) so the loudness can be heard while setting it; the music is already playing.

### The settings window
Designed in code from the pieces that already exist (the glass panel, the pearl button, Lilita One and
Fredoka), not in Figma first: it is one small window and it has to match the screens exactly. It can be
added to the Figma file afterwards if the design file should stay the source.
- It sits over everything in real pixels (not design pixels), so it is the same on every screen. On a big
  window it grows to match the screens (`modalScale`, never above 1.7 times).
- Opening it during a round pauses the round, like switching to another app. When it closes, the Paused
  screen is there and the player taps CONTINUE. If it is opened during the countdown, the countdown starts
  again from 3 afterwards.
- Switches are real switches (`role="switch"`), sliders are real range inputs, Tab stays inside the window,
  Escape closes it, and the focus goes back to the gear. A slider is greyed out while its switch is off.
- Letting go of a slider outside the window does not close it: closing needs the press and the release
  both on the dark backdrop.

### Saved choices, and the old mute switch
The settings are kept under the key `audio` in the same place as everything else (Facebook's player data, or
localStorage outside Facebook), saved 0.4 s after the last change so a slider drag is one save. A damaged
save is repaired field by field. Someone who had muted the game with the old switch (`muted`) is read as
both switches off, once, so nobody is surprised by sound.

### Which tune plays on the game over screen
The tune plays as the screen appears. If the server says in time that it is a new best, the brighter tune
plays instead, so two tunes never talk over each other; if the answer is slow (over 0.6 s) the tune plays
anyway and the new best tune follows. `state/gameOverJingle.ts` holds the rule and is tested.

### Smaller choices
- The pop, the end-of-round notes and the pearl ring are unchanged. The old `Sound` class and `useMuted`
  are gone.
- The countdown beeps are the same note, and the last one is higher, which is how a countdown is usually
  heard.
- There is no sound for a missed tap: it would be heard on every stray tap and soon tire.

### Known limits
- **I could not listen to any of it.** The levels, the clipping and the balance were measured, and the
  logic is tested, but the taste of the music and the sounds is untested by a person.
- **Chrome and Facebook's app decide when sound may start.** Nothing plays until the first tap, by the
  browsers' rules. On iPhones the silent switch can also mute web audio; I have not tested that.
- **Settings are not tested with a real Facebook account's saved data across devices**, only with the
  stand-in platform and unit tests of the parsing.

## Known limits and what I would do with more time

- **Perfect-replay bots.** A bot that knows the seed and taps every bubble at plausible human
  speed scores the maximum. Preventing it needs server-side gameplay. The damage is bounded by the
  maximum score of a schedule (~75-90) and the start rate limit.
- **Replay of a leaked signature.** Within its 10-minute window a captured Facebook signature can
  create a session for that player. Fix: pass a server-issued nonce to
  `getSignedPlayerInfoAsync(nonce)` and check it came from us, once.
- **No token revocation.** A session token is valid until it expires (1 hour). Fix: a token
  version on the player row, checked on each request.
- **Avatar hosts.** Any https avatar is accepted, which lets a player see the IP of everyone who views
  the leaderboard. Fix: allowlist Facebook's image hosts once real URLs are known.
- **Concurrency is not tested concurrently.** The single-use and best-score guarantees rest on a row lock
  and a conditional UPDATE. A test with two real simultaneous connections is the next test to add.
- **No database backups.** The production database lives in a Docker volume on one host. A nightly
  `pg_dump` to object storage would be the first operational improvement.
- **Single host.** Everything runs on one EC2 instance. That is a deliberate fit for the scale of this
  project, not an oversight.
- **Config is duplicated across languages.** The game rules live in Python and JavaScript, and golden
  vectors keep them honest. A build step that generates one from the other would remove the
  duplication.
