"""
Django settings for the Darlova project.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Values in a .env file next to manage.py override the defaults below.
load_dotenv(BASE_DIR / ".env")


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
# Put a long random SECRET_KEY in .env before going live.
SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "django-insecure-s!cd+$@6h(xx8a!jz0!!3o8*p61h2w!+$&fhikvoq3#ux=tx)6",
)

DEBUG = os.environ.get("DEBUG", "True") == "True"

ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "darlova.com,www.darlova.com,127.0.0.1,localhost").split(",") if h.strip()]

# Needed for forms (login, register) to work over https on your domain.
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "https://darlova.com,https://www.darlova.com").split(",") if o.strip()]

if not DEBUG:
    # Live-site security
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "False") == "True"
    SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
    CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "frontend",  # public website, accounts (login / register)
    "backend",   # member dashboard
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves /static/ on the live site
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "backend.middleware.LastSeenMiddleware",  # powers "Online now" / "Active 5m ago"
]

ROOT_URLCONF = "darlova.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "backend.context_processors.dashboard_counts",
            ],
        },
    },
]

WSGI_APPLICATION = "darlova.wsgi.application"


# ---------------------------------------------------------------------------
# Database (SQLite for development; switch to PostgreSQL for production)
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "frontend.User"

# Members can log in with their email address OR their phone number.
AUTHENTICATION_BACKENDS = [
    "frontend.backends.EmailOrPhoneBackend",
]

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "discover"
LOGOUT_REDIRECT_URL = "home"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# "Remember me" keeps members logged in for 30 days; otherwise until the browser closes.
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30


# ---------------------------------------------------------------------------
# Language and time
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Lagos"
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Static files (CSS, JS, fonts, images that ship with the site)
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"  # filled by `python manage.py collectstatic`
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Compressed copies with a fingerprint in the file name (style.3f9a1c.css), so phones
    # always pick up new CSS/JS straight after a deploy instead of using a cached copy.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ---------------------------------------------------------------------------
# Media files (photos uploaded by members)
# ---------------------------------------------------------------------------
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Uploads larger than this are rejected (per photo).
MAX_PHOTO_UPLOAD_MB = 10
DATA_UPLOAD_MAX_MEMORY_SIZE = 70 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ---------------------------------------------------------------------------
# Email (password reset codes)
# ---------------------------------------------------------------------------
# Without EMAIL_HOST in .env, emails are printed in the terminal (handy locally).
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
if EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "465"))
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
    EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "True") == "True"
    EMAIL_USE_TLS = not EMAIL_USE_SSL and os.environ.get("EMAIL_USE_TLS", "False") == "True"
    EMAIL_TIMEOUT = 20
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Darlova <noreply@darlova.com>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL


# ---------------------------------------------------------------------------
# Dating rules
# ---------------------------------------------------------------------------
DAILY_LIKE_LIMIT = 50          # likes + super likes per day on the free plan
ONLINE_WINDOW_SECONDS = 180    # "Online now" if active in the last 3 minutes


# ---------------------------------------------------------------------------
# Error reports
# ---------------------------------------------------------------------------
# Live-site errors are written to stderr.log (cPanel: ~/darlova/stderr.log) with the full traceback.
# Set ADMIN_EMAIL in .env to also get each error by email.
ADMINS = [("Darlova admin", os.environ["ADMIN_EMAIL"])] if os.environ.get("ADMIN_EMAIL") else []
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "[{asctime}] {levelname} {name}: {message}", "style": "{"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
        "mail_admins": {"class": "django.utils.log.AdminEmailHandler", "level": "ERROR",
                        "filters": ["require_debug_false"]},
    },
    "filters": {"require_debug_false": {"()": "django.utils.log.RequireDebugFalse"}},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO"},
        "django.request": {"handlers": ["console", "mail_admins"], "level": "ERROR", "propagate": False},
    },
}


# ---------------------------------------------------------------------------
# Push notifications (alerts on phones, even when Darlova is closed)
# ---------------------------------------------------------------------------
# Create the keys once with:  python manage.py vapid_keys   → paste the 3 lines into .env
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:hello@darlova.com")
