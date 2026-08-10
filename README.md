# StudyReset

StudyReset is a full-stack study planner for organizing subjects and tasks, recording focus sessions, scheduling revision, and building realistic daily plans. The browser application is plain HTML, CSS, and JavaScript; one Express process serves both the static client and the REST API, with MongoDB providing persistence.

## Requirements

- Node.js 20.19.0 or newer (Node.js 22 is used in CI; the container is pinned to 22.22.0)
- npm
- A reachable MongoDB deployment for normal development and production

By default, the automated API and browser tests use `mongodb-memory-server` and do not read `MONGO_URI`. Its MongoDB binary and Playwright's browser may need to be downloaded the first time the suites run.

## Install and run locally

From the repository root:

```bash
npm run setup
cp server/.env.example server/.env
```

Set at least `MONGO_URI` and `JWT_SECRET` in `server/.env`, then start the development server:

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000). To exercise the production-style entry point without file watching, run:

```bash
npm start
```

There is no frontend compilation step. `npm run setup` performs the lockfile-based backend install; the Express server directly serves the files under `client/`.

## Environment variables

`server/.env.example` contains names only. Keep real values in `server/.env` locally and use the deployment platform's secret manager in production.

| Variable | Requirement | Behavior |
| --- | --- | --- |
| `MONGO_URI` | Required | MongoDB connection URI. Startup fails when it is missing or the database cannot be reached. |
| `JWT_SECRET` | Required | Signs authentication tokens. It must be at least 32 characters when `NODE_ENV=production`; use a long, randomly generated value. |
| `NODE_ENV` | Set to `production` when deployed | Enables production secret validation, static caching, and production CORS behavior. Locally managed test servers set `test` themselves. |
| `PORT` | Optional | HTTP port; defaults to `5000`. When set, it must be an integer from `1` through `65535`. |
| `CLIENT_ORIGIN` | Required when `NODE_ENV=production` | Comma-separated exact browser origins allowed by CORS, for example `https://studyreset.example.com,https://www.studyreset.example.com`. Do not include paths. Development permits an unconfigured origin. |
| `TRUST_PROXY` | Optional | Set to exactly `1` only when the app is behind one trusted reverse-proxy hop so client IP-based rate limiting works correctly. |
| `RESET_PASSWORD_URL` | Reserved; currently unused | Intended base URL for emailed reset links once a mail provider is integrated. Setting it currently has no effect. |

Test runners accept these optional overrides:

| Variable | Purpose |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | Run browser tests against an already-running, disposable StudyReset test instance instead of starting the in-memory test server. |
| `PLAYWRIGHT_CHROME_PATH` | Use a specific Chrome/Chromium executable; otherwise common system locations and then Playwright's managed Chromium are tried. |
| `TEST_PORT` | Override the managed browser-test server port; defaults to `4173`. |
| `MONGOMS_DOWNLOAD_DIR` | Cache directory for the MongoDB binary downloaded by `mongodb-memory-server`. |

Do not point the automated suites—or `PLAYWRIGHT_BASE_URL`—at development or production data. Without that external URL override, the test harness creates an isolated, ephemeral database and supplies its URI internally.

## Commands

Run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install the exact backend dependency versions from `server/package-lock.json`. |
| `npm run dev` | Start Express through Nodemon for local development. |
| `npm start` | Start the single Express/static application normally. |
| `npm run check` | Parse-check all project JavaScript, including tests and configuration. |
| `npm run test:unit` | Run deterministic service unit tests. |
| `npm run test:api` | Run the Supertest API suite with an isolated in-memory MongoDB. |
| `npm test` | Run the unit and API suites. |
| `npm run test:e2e` | Run the essential Playwright browser flows. |
| `npm run test:all` | Run syntax checks, unit tests, API tests, and browser tests. |

Install Playwright's managed Chromium once if the machine has no compatible browser:

```bash
npm --prefix server exec -- playwright install chromium
```

## Production container

The included Dockerfile installs only lockfile-pinned production dependencies, runs as the unprivileged `node` user, and packages the Express server plus static client. `.dockerignore` excludes local environment files, dependency directories, tests, logs, coverage, and browser-test artifacts from the build context.

Build the image from the repository root:

```bash
docker build --pull -t studyreset:local .
```

Create a runtime-only environment file outside the repository, for example `/secure/path/studyreset.env`:

```dotenv
NODE_ENV=production
PORT=5000
MONGO_URI=<production MongoDB connection string>
JWT_SECRET=<long random secret of at least 32 characters>
CLIENT_ORIGIN=https://studyreset.example.com
```

Add `TRUST_PROXY=1` only when there is exactly one trusted proxy in front of the container. Run the image without baking that file into an image layer:

```bash
docker run --rm --name studyreset \
  --env-file /secure/path/studyreset.env \
  -p 5000:5000 \
  studyreset:local
```

Use a managed or separately persisted MongoDB database. If MongoDB is on the host, remember that `localhost` inside the container refers to the container itself. Terminate the container with `SIGTERM`; the server stops accepting connections and disconnects from MongoDB before exit.

### Health and readiness

Use `GET /api/health` as the deployment readiness check:

```bash
curl --fail --silent http://localhost:5000/api/health
```

A ready instance returns HTTP `200` with:

```json
{"status":"ok","service":"StudyReset API","database":"connected"}
```

The endpoint returns HTTP `503` with `status: "not-ready"` when MongoDB is disconnected. The Docker image checks this endpoint every 30 seconds after a 20-second startup grace period. Because it is database-aware, configure it as a readiness check; a platform liveness policy should allow temporary database outages rather than immediately entering a restart loop.

## API overview

`GET /api/health` is public. Authentication registration, login, forgot-password, and reset-password endpoints are under `/api/auth`; `GET /api/auth/me` requires a bearer token. All resource APIs below require `Authorization: Bearer <token>` and scope records to that user.

| Prefix | Resource |
| --- | --- |
| `/api/subjects` | Subjects, including archive and restore |
| `/api/tasks` | Study tasks and status changes |
| `/api/focus-sessions` | Persistent focus sessions, completion, and cancellation |
| `/api/topics` | Revision topics, archiving, and review scheduling |
| `/api/exams` | Exams and linked syllabus topics |
| `/api/check-ins` | Daily mood, energy, and availability check-ins |
| `/api/plans` | Daily plan retrieval, deterministic generation, and adjustment |

## Password-reset delivery limitation

The backend creates a cryptographically random reset token, stores only its hash with a 30-minute expiration, accepts it once, and invalidates existing authentication tokens after a successful password change. It deliberately returns the raw reset token only while `NODE_ENV=test` so automated tests can complete the flow.

No email provider is integrated yet. In development and production, `POST /api/auth/forgot-password` always returns the same non-enumerating response but cannot deliver the reset link (`deliveryConfigured` is `false`). Production password recovery is therefore not operational until a mail provider is added. That work must send the raw one-time token only to the account email, use `RESET_PASSWORD_URL` to construct the link, and keep the token out of responses and logs; provider credentials should be injected as secrets, not committed.

## Security and release checklist

- Serve production traffic through HTTPS and set `CLIENT_ORIGIN` to every exact trusted browser origin.
- Generate a unique production `JWT_SECRET`; do not reuse the example or a development value.
- Restrict the MongoDB account and network rules to this application and its deployment environment.
- Never commit `.env` files, database URIs, JWT secrets, reset tokens, or email-provider credentials.
- Rotate the MongoDB password and JWT secret if either was ever shared or committed. Rotation is an operator action; the application does not rotate credentials automatically. Rotating the JWT secret logs every user out.
- Monitor `/api/health`, application exits, authentication rate-limit responses, and MongoDB availability.
- Run `npm run test:all` before a release.

This repository currently has no commit history and its project files are untracked. After verification, make a clean initial commit rather than pushing an unreviewed working tree. Confirm that ignored secret files remain ignored, inspect everything staged, and only then commit:

```bash
git status --short
git check-ignore -v server/.env
git add .
git diff --cached --check
git diff --cached --stat
git diff --cached
git status --short
git commit -m "Initial StudyReset application"
```

Do not push until the target remote and branch have been explicitly reviewed.

## Project structure

```text
client/                 Static browser application
server/
  config/               Database configuration
  controllers/          Request handlers
  middleware/           Authentication and rate limiting
  models/               Mongoose data models
  routes/               REST API routes
  services/             Deterministic planning, revision, and reset helpers
  e2e/                  Playwright browser flows
  tests/                Unit/API tests and isolated test-server helpers
  app.js                 Express application factory
  playwright.config.js   Browser-test configuration
  server.js              Database connection and process entry point
Dockerfile              Production container image
```
