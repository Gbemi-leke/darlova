# Darlova — Django project

## Run it

```bash
source ../Olami/bin/activate          # your virtual environment
pip install -r requirements.txt
python manage.py migrate              # creates the database tables
python manage.py createsuperuser      # your admin login (email + password)
python manage.py runserver
```

Open http://127.0.0.1:8000. The admin panel is at http://127.0.0.1:8000/admin/.

> The project now uses a **custom user model** (email login). If you already had a `db.sqlite3` from before, delete it and run `migrate` again.

## What works

Everything below reads and writes the real database.

| Area | What members can do |
|---|---|
| Accounts | Register (4 steps, photos compressed), log in with email or phone, log out |
| Forgot password | 6-digit code by email (15 min, 5 tries, single use) → new password; logs out other devices |
| My profile | Edit name, job, bio, city, height, education, languages, interests, 2 prompts; add / remove / reorder photos (max 6) |
| Settings | Email, phone, city; discovery age range and "global mode"; pause profile; online status and read receipts; notification switches; change password; sign out other devices; blocked list; delete account |
| Discover | Real members filtered by both people's "Show me", age, city, verified, online now; like / pass / super like (50 per day) |
| Matches | Mutual like → match + notification; matches, "Liked you" (blurred), visitors; unmatch |
| Chat | Messages, replies, heart reactions, unsend, typing indicator, read receipts, online / last seen, clear chat, block, report |
| Notifications | Matches, likes, messages, profile views; badges on sidebar, bottom menu and bell refresh every 30s |
| Landing page | Shows real members (first name, age, city, photo) once there are 3+, unless they switch it off in Settings |

Still to do: Premium payments (Paystack), voice/video calls, photo messages, push notifications, Google/Apple sign-in.

**Chat on shared hosting.** Namecheap shared hosting can't keep WebSocket connections open, so the chat page
asks the server for new messages every 3 seconds (`static/backend/js/messages.js`, `CHAT_POLL`). On a VPS
you can swap this for Django Channels later without changing the pages.

## Structure

```
darlova/
├── darlova/            settings.py, urls.py (project config)
├── frontend/           public site + accounts
│   ├── models.py       User (email login), Profile, Photo
│   ├── forms.py        LoginForm, RegisterForm (validation + photo compression)
│   ├── backends.py     log in with email OR phone
│   ├── views.py        home, premium, safety, login, register, logout, forgot-password, 404
│   └── urls.py
├── backend/            member dashboard (all pages need login)
│   ├── views.py        discover, matches, messages, profile, my_profile, settings, notifications
│   └── urls.py
├── templates/
│   ├── partials/                head, scripts, logo, theme switch, toast messages
│   ├── frontend/base.html       public base (navbar + footer)
│   ├── frontend/partials/       navbar.html (logged in / out), footer.html
│   ├── frontend/*.html          pages extend frontend/base.html
│   ├── dashboard/base.html      dashboard base (sidebar, top bar, bottom menu)
│   ├── dashboard/partials/      sidebar, bottom_nav, account_menu
│   └── dashboard/*.html         pages extend dashboard/base.html
└── static/
    ├── css/  js/  fonts/  images/  vendor/   shared by every page
    ├── frontend/css|js/                      one file per public page
    └── backend/css|js/                       one file per dashboard page
```

## URLs

| URL | Name | Page |
|---|---|---|
| `/` | `home` | Landing page |
| `/premium/` | `premium` | Plans |
| `/safety/` | `safety` | Safety centre |
| `/login/` | `login` | Log in |
| `/register/` | `register` | Sign up |
| `/logout/` | `logout` | Log out (POST only) |
| `/forgot-password/` | `forgot_password` | Reset password by email code |
| `/discover/` | `discover` | Swipe deck (login required) |
| `/matches/` | `matches` | Matches |
| `/messages/` | `messages` | Chats |
| `/profile/?id=5` | `profile` | Another member |
| `/my-profile/` | `my_profile` | Edit profile |
| `/settings/` | `settings` | Settings |
| `/notifications/` | `notifications` | Notifications |

Use `{% url 'name' %}` in templates, for example `{% url 'discover' %}`.

The page scripts talk to JSON endpoints under `/api/` (see `backend/urls.py` and `backend/api.py`).
Each dashboard view passes its starting data as `page_data`, which the template prints with
`json_script` and the page script reads with `pageData()`.

## Messages (toasts)

Anything you send with `messages.success(request, "…")`, `messages.error(...)` or `messages.info(...)` in a view shows up as a glass toast automatically, on both the public pages and the dashboard.

## Before going live

- Put a real `SECRET_KEY`, `DEBUG=False` and your domain in `ALLOWED_HOSTS` in a `.env` file (copy `.env.example`).
- Run `python manage.py migrate` and `python manage.py collectstatic`. File names get a fingerprint
  (`style.3f9a1c.css`), so browsers always load the newest CSS/JS after a deploy.
- Fill in the `EMAIL_*` lines in `.env` so reset codes are emailed.
- Serve `/media/` (uploaded photos) from your web server or cloud storage.
