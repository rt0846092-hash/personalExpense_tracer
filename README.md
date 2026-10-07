# Income & Expense Tracker — Full Stack (React + Tailwind + Django REST + MySQL)

Multi-user, multi-currency income/expense/transfer tracker with a
multi-country remittance tracker, backed by Django REST Framework +
MySQL and a React + Tailwind frontend.

```
tracker-fullstack/
├── backend/
│   ├── accounts/   Register / login / logout / "me" (JWT auth)
│   └── tracker/    Records, categories, opening balances, preferences
└── frontend/       React + Tailwind (Vite) SPA
```

## Features

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

4. **Borrow and lend.** Record money you borrowed or lent: who, how much,
   when, and an optional pay-back date. Add partial repayments until it's
   fully paid, with an "Overdue" warning when the date passes. Each loan and
   repayment also writes a history entry, so cash and digital balances always
   include them, and those entries can only be changed from Borrow / Lend so
   the numbers never drift.
5. **Category details.** Click any category on the dashboard (Food, Study…)
   to see every entry inside it: what it was for, the amount, date and
   account, monthly totals, the biggest item, and a 6-month chart.
6. **Sign in your way.** "Continue with Google", or a username/email and
   password. New accounts confirm their email with a 6-digit code, and
   "Forgot password?" emails a code to set a new one. Codes are stored
   hashed, expire after 10 minutes, and allow only 5 tries.
7. **Clear sign-in errors.** A sleeping or unreachable server says so,
   instead of claiming the password is wrong.

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

## 1. Backend setup (Django + MySQL)

```bash
docker compose up -d db          # starts MySQL 8.4 with the default credentials below

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
- History can import records from CSV; bulk JSON import isn't supported yet.

## Email and Google sign-in setup

| Setting (Render) | What it is |
| --- | --- |
| `MAILJET_API_KEY` | API key from [Mailjet](https://www.mailjet.com) (free, 200 emails a day). Sends the 6-digit codes. Free Render servers block SMTP, so Mailjet's HTTPS API is used instead of Gmail. |
| `MAILJET_SECRET_KEY` | The secret key that goes with it. Keep it private. |
| `BREVO_API_KEY` | Optional alternative to Mailjet. |
| `EMAIL_SENDER` | The "from" address. Must be a confirmed sender in Mailjet. Defaults to `rt0846092@gmail.com`. |
| `GOOGLE_CLIENT_ID` | Optional; defaults to this app's Google OAuth Client ID. |

Without Mailjet (or Brevo) keys, codes are printed to the server log and new sign-ups skip the code step, so local development needs no setup.

## Tests

```bash
cd backend
python manage.py test
```

51 automated tests cover the most important behaviour: each user only ever sees and changes their own records, bad dates and months return a clear error, currencies must be real 3-letter codes, duplicate categories are refused with a message, transfers need two different accounts, login is rate-limited (10 attempts a minute) to stop password guessing, sign-up codes, password reset and Google sign-in follow their security rules, and loans keep balances correct through borrowing, partial and full repayment, editing and deleting.
