
# Bubble Pop Rush: Under the Sea

This is a 30-second tapping game that runs as a Facebook Instant Game. Bubbles float up on a sea background, and you tap them before they shrink away. You get points for each bubble you pop. You can play it on a phone with your finger or on a desktop with the mouse.

## Production & Other Documentations
**API Documentation** - This is backend API documentation for production.

```bash
https://bubble-pop-rush.fyi/api/docs
```

**Web App Version** - This is game is mainly hosted in Facebook but we have a version in web as well but it has limitation where it cannot participate with the leaderboards. Because outside Facebook there’s no way to verify who you are, and the leaderboard only accepts scores from a Facebook-verified player. A plain web page can’t get that verification, so it can only play practice rounds, which aren’t saved. It can still view the leaderboard, because reading it is public.
```bash
https://bubble-pop-rush.fyi/
```
**Figma** - Design / Prototype of the application.
```bash
https://www.figma.com/design/4x8XKjW811d7EmXo8o5MI7/Bubble-Pop-Rush-%C2%B7-Under-the-Sea?node-id=0-1&t=ChfQMZ5hFQGVpNeK-1
``` 
**Notion** - More documentation about the planning, architecture and structure of the app. I wrote this while developing the app.
```bash
https://tangible-fear-b14.notion.site/SUPERGENE-GLOBAL-SERVICES-INC-GAME-CHALLENGE-NOTES-403db32f353f80c394b3e26ba7373652
```

## Run it locally

### What you need
- Python 3.13
- Node 22 (with npm)
- PostgreSQL 16, installed on your machine
- Git

### 1. Clone it
```bash
git clone https://github.com/wdotgonzales/bubble-pop-rush-under-the-sea.git
cd bubble-pop-rush-under-the-sea
```

### 2. Install PostgreSQL and create the database
Install PostgreSQL 16 once:
- **Windows:** the installer from postgresql.org (keep the default port 5432 and remember the password you set for `postgres`)
- **macOS:** `brew install postgresql@16 && brew services start postgresql@16`
- **Ubuntu/Debian:** `sudo apt install postgresql` (it starts on its own)

Then open a SQL prompt and create a user and an empty database:
```bash
psql -U postgres          # Ubuntu: sudo -u postgres psql
```
```sql
CREATE USER bubble WITH PASSWORD 'choose_a_password' CREATEDB;
CREATE DATABASE bubble_pop_rush_db_local OWNER bubble;
\q
```
`CREATEDB` lets the test suite create its own `bubble_pop_rush_db_local_test` database. You do not create any tables by hand: the migrations in step 4 do that.

### 3. Set up the `.env` files
Backend settings live in a `.env` at the repo root:
```bash
cp .env.example .env
```
Open `.env` and fill in:

| Variable | What to put |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | The user and password from step 2 (`bubble` / your password) |
| `POSTGRES_DB` | `bubble_pop_rush_db_local` |
| `POSTGRES_HOST` / `POSTGRES_PORT` | `localhost` / `5432` (leave as is) |
| `SECRET_KEY` | A long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ENVIRONMENT` | `development` (leave as is) |
| `FB_APP_SECRET` | Any value works locally, but it must not be empty, or `POST /session` answers 503 |
| `CORS_ORIGINS` | Leave the default (`http://localhost:5173,http://127.0.0.1:5173`) |

The frontend has its own file, which tells it where the backend is:
```bash
cp frontend/.env.example frontend/.env
```
It should say `VITE_API_BASE_URL=http://localhost:8000`. `.env` files are never committed. A separate `frontend/.env.production` is used for Facebook builds (see "Build the game for Facebook" below).

### 4. Run the backend
Run backend commands from `backend/`: the settings are read from `../.env`.
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows Git Bash: source venv/Scripts/activate
pip install -r requirements.txt
alembic upgrade head            # creates the tables
uvicorn app.main:app --reload
```
- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs (`/` itself is a 404, which is expected)
- Check it works: http://localhost:8000/health

### 5. Run the frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173.

Outside Facebook there is no player sign-in, so the game runs in practice mode (rounds are not saved). The Leaderboards page still works because reading the leaderboard is public.

### 6. Put some scores on the leaderboard (optional)
With the backend running, a script signs in as fake players the way Facebook would and plays full rounds (about 31 seconds each). It needs `FB_APP_SECRET` to be set:
```bash
cd backend
python scripts/play_bot_round.py ana --name Ana --accuracy 60
for p in ana ben cy; do python scripts/play_bot_round.py $p --name $p & done; wait
```
Then open http://localhost:8000/leaderboard, http://localhost:8000/scores, or the Leaderboards page in the game.

To look at any screen without playing, open the frontend with a preview address, for example `http://localhost:5173/?preview=start`. The others are `over`, `dashboard`, `play` and `card`.

### Run the tests
```bash
cd backend && pytest                      # needs the database from step 2
cd frontend && npm test                   # Vitest
node shared/check-vectors.mjs             # JS and Python bubble generators agree
```

### Troubleshooting
- **`password authentication failed`:** the `.env` user or password does not match step 2.
- **`database ... does not exist`:** run the `CREATE DATABASE` line from step 2.
- **`SECRET_KEY` or `POSTGRES_*` "field required":** you ran the command outside `backend/`, or `.env` is missing.
- **Frontend says `VITE_API_BASE_URL is not set`:** copy `frontend/.env.example` to `frontend/.env` and restart `npm run dev`.
- **Browser blocks the API call (CORS):** open the game at `http://localhost:5173`, or add your address to `CORS_ORIGINS` and restart the backend.

---

## Build the game for Facebook

The game is hosted by Facebook (Instant Games > Web Hosting), so it is uploaded as a zip. The backend is not part of the zip: the build only needs to know the public address of the backend, and the backend must already be running there.

### Before you start
- The backend is deployed and reachable over **HTTPS** (for example `https://bubble-pop-rush.fyi/api`). Check that `https://<your-domain>/api/health` answers.
- The production server's `CORS_ORIGINS` includes the origin Facebook serves the game from. If the game loads on Facebook but every request fails, this is the first thing to check (the browser's Network tab shows the origin).
- `npm install` has been run in `frontend/`.

### 1. Create `frontend/.env.production`
This file holds the public backend address. It is **not committed** (it is in `.gitignore`), so a fresh clone has to create it:
```bash
cd frontend
cp .env.example .env.production
```
Edit it so it has exactly one line, with your public address and **no trailing slash**:
```
VITE_API_BASE_URL=https://bubble-pop-rush.fyi/api
```
A build reads `.env.production` instead of `.env`, so you never switch anything by hand between local development and a Facebook build. The address is never written in the code.

### 2. Build and pack
```bash
cd frontend
npm run pack
```
This does three things:
1. Type-checks the code, then builds it with Vite into `frontend/dist/`.
2. Stops with a message if `VITE_API_BASE_URL` is missing, so you never ship a build that cannot find its backend.
3. Zips the contents of `dist/` into **`frontend/fb-build.zip`**, and refuses to pack a build that still contains `localhost:8000`.

When it finishes you should see `Wrote fb-build.zip: ... files`. The zip is roughly 0.5 MB. Facebook asks for an initial load under about 5 MB, and the script warns if you go over.

### 3. Check the zip
- It must be the file at **`frontend/fb-build.zip`** (not an older copy somewhere else, such as on the Desktop).
- `index.html` and `fbapp-config.json` must be at the **root** of the zip, not inside a folder. `npm run pack` does this correctly. Only a zip you made by hand can go wrong here.

### 4. Upload it to Facebook
1. Open your app in the Meta for Developers dashboard.
2. Go to **Instant Games > Web Hosting**.
3. Click **Upload Version** and choose `frontend/fb-build.zip`. Wait until the upload finishes and the new version appears in the list.
4. Set the new version to **Testing** (or **Staging**) with the flask icon next to it. **Until you do this, Facebook keeps serving the old version.**

### 5. Play it
Open the play link for the app: `https://www.facebook.com/gaming/play/<YOUR_APP_ID>/`. Only people with a role on the app (admin, developer, tester) can open a version that is not live yet, so add reviewers as testers under the app's roles.

Then check that a round starts, finishes, and shows up on the Leaderboards page.

### If something is wrong
- **The page still shows the old game:** you uploaded but did not set the new version to Testing/Staging, or the browser cached it. Set the version, then hard-reload (Ctrl+Shift+R).
- **`VITE_API_BASE_URL is not set` while packing:** `frontend/.env.production` is missing or empty (step 1).
- **`contains a localhost address. Refusing to pack`:** the address in `.env.production` is the local one. Put the public HTTPS address there and run `npm run pack` again.
- **The game opens but cannot sign in or load scores:** the backend address in `.env.production` is wrong, the backend is down, or `CORS_ORIGINS` on the server does not include Facebook's origin.
- **Upload rejected or game will not start:** check that `index.html` and `fbapp-config.json` are at the root of the zip.

