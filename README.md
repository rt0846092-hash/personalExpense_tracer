# Income & Expense Tracker — Full Stack (React + Tailwind + Django REST + PostgreSQL)

Multi-user, multi-currency income/expense/transfer tracker with a
multi-country remittance tracker, backed by Django REST Framework +
PostgreSQL and a React + Tailwind frontend.

```
tracker-fullstack/
├── backend/
│   ├── accounts/   Register / login / logout / "me" (JWT auth)
│   └── tracker/    Records, categories, opening balances, preferences
└── frontend/       React + Tailwind (Vite) SPA
```

## What's new in this pass

1. **Sign in / register, usable from any device.** JWT-based auth
   (`djangorestframework-simplejwt`). Every record, category, opening
   balance, and preference is scoped to the signed-in user, so logging into
   the same account from a phone and a laptop shows the same data.
2. **Multi-currency, converted live.** Every entry stores the currency it
   was actually made in (`currency` field). A currency picker in the
   navbar sets your **display currency** (saved per-account); the dashboard
   and history convert every entry into that currency using live rates
   from a free exchange-rate API, so a $20 lunch and an NPR 50,000 salary
   roll up into one meaningful total.
3. **Multi-country remittance tracker.** The old Nepal-only tracker is now
   generic: pick **from country** / **to country**, how much was **sent**
   (in its own currency) and how much was **received** (in its own
   currency) — the app shows the gap between the two as the transfer fee /
   exchange spread. A compact "Sent abroad" card also sits on the
   Dashboard, linking through to the full Remittance tab.

## Architecture

- **Auth**: `accounts` app exposes `register/`, `login/`, `token/refresh/`,
  `logout/`, `me/`. Access tokens last 12h, refresh tokens 30 days and
  rotate/blacklist on use. The frontend stores tokens in `localStorage` and
  refreshes automatically via an axios interceptor.
- **Currency**: `Record.currency` is the currency the entry was made in.
  `UserPreference.display_currency` is what the UI converts everything
  into. `frontend/src/context/CurrencyContext.jsx` fetches
  `https://open.er-api.com/v6/latest/USD` (free, no API key) once per
  session and exposes a `convert(amount, from, to)` helper used throughout
  the dashboard, history, and remittance screens.
- **Remittance**: `Record` (type=`remittance`) now carries `from_country`,
  `to_country`, `sent_amount` + `sent_currency` (what left the account) in
  addition to the existing `amount` + `currency` (what was received). Your
  account balance is debited by the *sent* amount, converted to your
  display currency — the received amount is a separate figure used only to
  compute the fee/spread shown per transfer.

## 1. Backend setup (Django + PostgreSQL)

```bash
docker compose up -d db          # spins up Postgres with the default creds below

cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # edit if your DB creds differ
python manage.py migrate
python manage.py createsuperuser # optional, for /admin/
python manage.py runserver
```

API base: `http://localhost:8000/api/`

| Endpoint                         | Methods                  | Purpose                              |
|-----------------------------------|---------------------------|----------------------------------------|
| `/api/auth/register/`             | POST                       | create account, returns JWT tokens     |
| `/api/auth/login/`                | POST                       | `{username, password}` → JWT tokens    |
| `/api/auth/token/refresh/`        | POST                       | `{refresh}` → new access token         |
| `/api/auth/logout/`               | POST                       | `{refresh}` → blacklists it            |
| `/api/auth/me/`                   | GET                        | current user's profile                 |
| `/api/records/`                   | GET, POST                  | list/create transactions (scoped to you)|
| `/api/records/<id>/`              | GET, PUT, PATCH, DELETE    | read/update/delete one                 |
| `/api/categories/`                | GET, POST                  | list/create custom categories          |
| `/api/categories/<id>/`           | PATCH, DELETE              | rename/delete a custom category        |
| `/api/opening-balance/`           | GET, PUT                   | your opening balances                  |
| `/api/preferences/`               | GET, PUT                   | your display currency                  |

`records/` supports query params: `type`, `account`, `category`,
`account_any`, `date_from`, `date_to`, `month` (`YYYY-MM`), `search`.
Every endpoint (except register/login/refresh) requires
`Authorization: Bearer <access token>`.

## 2. Frontend setup (React + Tailwind)

```bash
cd frontend
npm install
cp .env.example .env     # set VITE_API_URL if your API isn't on :8000
npm run dev
```

Open `http://localhost:5173`, create an account, and go. Make sure
`CORS_ALLOWED_ORIGINS` in the backend `.env` includes this origin.

## Notes

- The exchange-rate API is free/keyless but best-effort — if it's
  unreachable the app shows a small warning banner and falls back to
  displaying amounts unconverted rather than guessing a rate.
- Bulk JSON import isn't wired up in this REST version (export still
  works) — say the word if you want a `/api/import/` endpoint added back.
- Everything above was verified end-to-end in this pass: `npm run build`
  succeeds, Django's `check`/`migrate` pass cleanly, and a scripted smoke
  test confirmed registration, login, per-user data isolation, and
  currency/remittance fields all round-trip correctly through the API.
