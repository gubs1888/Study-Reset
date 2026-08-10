<p align="center">
  <img src="https://raw.githubusercontent.com/gubs1888/Study-Reset/main/docs/banner.png" alt="StudyReset Banner" width="100%" />
</p>

<h1 align="center">📚 StudyReset</h1>

<p align="center">
  <strong>A student productivity app to organize, focus, plan, revise, and recover.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.19-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/express-5.x-000000?style=flat-square&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/mongodb-mongoose%209-47A248?style=flat-square&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/auth-JWT-FB015B?style=flat-square&logo=jsonwebtokens&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-api-endpoints">API</a> •
  <a href="#-project-structure">Structure</a> •
  <a href="#-testing">Testing</a> •
  <a href="#-deployment">Deployment</a>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Dashboard** | At-a-glance view of today's tasks, stats, upcoming exams, and study progress |
| 📖 **Subjects** | Create, color-code, archive, and restore academic subjects |
| ✅ **Tasks** | Track study tasks with priorities, due dates, status workflow (pending → in-progress → completed) |
| ⏱️ **Focus Timer** | Timed focus sessions with start/complete/cancel lifecycle, linked to tasks and subjects |
| 🧠 **Revision Scheduler** | Spaced-repetition scheduling for topics using confidence-based review intervals |
| 📅 **Daily Planner** | Deterministic daily study plans generated from check-in data (mood, energy, available hours) |
| 🔄 **Recovery Mode** | Detects when you've fallen behind and suggests lighter recovery plans |
| 📝 **Exams** | Track exams with dates and linked syllabus topics to prioritize revision |
| 🔐 **Authentication** | Secure JWT-based registration, login, and password reset with rate limiting |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML, CSS, JavaScript — no build step required |
| **Backend** | Node.js + Express 5 |
| **Database** | MongoDB with Mongoose 9 ODM |
| **Auth** | JSON Web Tokens (bcryptjs for password hashing) |
| **Testing** | Node test runner, Supertest, Playwright E2E |
| **DevOps** | Docker, GitHub Actions CI |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.19 (22.x recommended)
- **npm**
- **MongoDB** — local instance, [Atlas free tier](https://www.mongodb.com/atlas), or the app auto-falls back to an in-memory database for local dev

### Install & Run

```bash
# 1. Clone the repository
git clone https://github.com/gubs1888/Study-Reset.git
cd Study-Reset

# 2. Install dependencies
npm run setup

# 3. Configure environment
cp server/.env.example server/.env
# Edit server/.env → set MONGO_URI and JWT_SECRET

# 4. Start the development server
npm run dev
```

Open **[http://localhost:5000](http://localhost:5000)** in your browser 🎉

> **💡 Tip:** If MongoDB Atlas is unreachable (e.g., IP whitelist issues), the server automatically falls back to an in-memory MongoDB instance for local development.

---

## 🔧 Environment Variables

Create `server/.env` from the example file. Required variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret for signing auth tokens (≥32 chars in production) |
| `NODE_ENV` | ⚙️ | Set to `production` when deployed |
| `PORT` | ❌ | HTTP port (default: `5000`) |
| `CLIENT_ORIGIN` | ✅ prod | Comma-separated allowed CORS origins |
| `TRUST_PROXY` | ❌ | Set to `1` behind a reverse proxy |

---

## 📡 API Endpoints

All resource endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (public) |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login & receive JWT |
| `GET` | `/api/auth/me` | Current user profile |
| `POST` | `/api/auth/forgot-password` | Request password reset |
| `POST` | `/api/auth/reset-password` | Reset password with token |
| **Subjects** | `/api/subjects` | CRUD + archive/restore |
| **Tasks** | `/api/tasks` | CRUD + status transitions |
| **Focus** | `/api/focus-sessions` | Start, complete, cancel sessions |
| **Topics** | `/api/topics` | CRUD + spaced-repetition reviews |
| **Exams** | `/api/exams` | CRUD + syllabus topic linking |
| **Check-ins** | `/api/check-ins` | Daily mood/energy/availability |
| **Plans** | `/api/plans` | Generate & adjust daily plans |

---

## 📁 Project Structure

```
Study-Reset/
├── client/                     # Frontend (static HTML/CSS/JS)
│   ├── index.html              # Single-page application shell
│   ├── app.js                  # Client-side application logic
│   └── styles.css              # Design system & all styles
│
├── server/                     # Backend (Express + Mongoose)
│   ├── config/
│   │   └── db.js               # MongoDB connection (with fallback)
│   ├── controllers/            # Route handlers
│   │   ├── authController.js
│   │   ├── subjectController.js
│   │   ├── studyTaskController.js
│   │   ├── focusSessionController.js
│   │   ├── topicController.js
│   │   ├── examController.js
│   │   ├── checkInController.js
│   │   └── dailyPlanController.js
│   ├── middleware/
│   │   ├── authMiddleware.js   # JWT verification
│   │   └── rateLimit.js        # Rate limiting
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # Express route definitions
│   ├── services/
│   │   ├── dailyPlanner.js     # Deterministic plan generation
│   │   ├── revisionScheduler.js # Spaced-repetition algorithm
│   │   └── passwordReset.js    # Secure token management
│   ├── tests/                  # Unit & API integration tests
│   ├── e2e/                    # Playwright browser tests
│   ├── app.js                  # Express app factory
│   └── server.js               # Entry point
│
├── Dockerfile                  # Production container
├── .github/workflows/          # CI pipeline
└── package.json                # Root scripts
```

---

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run everything (syntax + unit + API + E2E)
npm run test:all

# Individual suites
npm run check          # JavaScript syntax check (42 files)
npm run test:unit      # Service unit tests (14 tests)
npm run test:api       # API integration tests (9 tests)
npm run test:e2e       # Playwright browser tests
```

> Tests use `mongodb-memory-server` for isolated, ephemeral databases — no external MongoDB required.

---

## 🐳 Deployment

### Docker

```bash
# Build
docker build --pull -t studyreset:local .

# Run
docker run --rm \
  --env-file /path/to/studyreset.env \
  -p 5000:5000 \
  studyreset:local
```

### Health Check

```bash
curl http://localhost:5000/api/health
# → {"status":"ok","service":"StudyReset API","database":"connected"}
```

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install backend dependencies from lockfile |
| `npm run dev` | Start dev server with hot reload (Nodemon) |
| `npm start` | Start production server |
| `npm run check` | Syntax check all JavaScript files |
| `npm test` | Run unit + API tests |
| `npm run test:all` | Full test suite (syntax + unit + API + E2E) |

---

## 🔒 Security

- Passwords hashed with **bcryptjs** (adaptive cost)
- **JWT** authentication with configurable secrets
- **Rate limiting** on auth endpoints
- **CORS** enforcement in production
- **Helmet-style** security headers (CSP, X-Content-Type, etc.)
- Password reset tokens are **hashed** before storage, single-use, 30-min expiry
- All user data is **scoped** — users can only access their own resources

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ☕ and determination to never fall behind on studies again.
</p>
