from datetime import timedelta
from pathlib import Path
import dj_database_url
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent

# No hardcoded fallback here on purpose — a real SECRET_KEY must come
# from .env (locally) or the host's environment variables (deployed). A
# guessable default like the old 'dev-insecure-secret-key' would let
# anyone forge session/JWT signatures if it accidentally shipped live.
SECRET_KEY = config('SECRET_KEY')

# Defaults to False so a deployment that forgets to set DEBUG doesn't
# accidentally leak full stack traces (file paths, settings, query
# details) to the public. Your local .env explicitly sets DEBUG=True,
# so nothing changes for local development.
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_filters',
    'corsheaders',

    'accounts',
    'tracker',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Serves static files (admin CSS/JS) directly from Django — hosts
    # like Render don't run a separate static file server, so without
    # this the admin panel loads with no styling at all.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# One DATABASE_URL decides which host this deployment talks to — local
# docker-compose MySQL by default, or your hosted MySQL (Aiven, etc.) in
# production, just by changing this one variable.
DATABASES = {
    'default': dj_database_url.parse(
        config('DATABASE_URL', default='mysql://tracker_user:tracker_pass@localhost:3306/tracker'),
        conn_max_age=600,
        # NOTE: deliberately not using dj_database_url's ssl_require=
        # here — it injects a Postgres-style 'sslmode' OPTIONS key
        # regardless of engine, which crashes PyMySQL with
        # "unexpected keyword argument 'sslmode'". SSL for MySQL is
        # handled explicitly below instead, with the key PyMySQL
        # actually understands.
    )
}

# MySQL's legacy 'utf8' charset is 3 bytes/char and can't store emoji
# (4 bytes) — category icons are emoji, so this crashes every insert
# without it. utf8mb4 is the real, full UTF-8 charset.
if DATABASES['default']['ENGINE'] == 'django.db.backends.mysql':
    DATABASES['default'].setdefault('OPTIONS', {})
    DATABASES['default']['OPTIONS']['charset'] = 'utf8mb4'

    # Hosted MySQL (Aiven, etc.) requires TLS. PyMySQL takes this as an
    # 'ssl' dict — an empty dict is enough to request an encrypted
    # connection (verified against PyMySQL's source: no 'ca' key means it
    # skips certificate-chain verification but still encrypts traffic).
    # Don't paste the '?ssl-mode=REQUIRED' query param some providers show
    # in their connection URI straight into DATABASE_URL — PyMySQL doesn't
    # recognise that key and it would crash the connection. Strip it from
    # the URL and set DB_SSL_REQUIRED=True instead.
    if config('DB_SSL_REQUIRED', default=False, cast=bool):
        DATABASES['default']['OPTIONS']['ssl'] = {}

AUTHENTICATION_BACKENDS = [
    # Lets people sign in with either their username or their email —
    # falls back to Django's default if that lookup doesn't match.
    'accounts.backends.EmailOrUsernameModelBackend',
    'django.contrib.auth.backends.ModelBackend',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = config('TIME_ZONE', default='UTC')
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
# `collectstatic` gathers files here at deploy time; whitenoise then
# serves them straight from Django, no separate static-file host needed.
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 1000,
    'COERCE_DECIMAL_TO_STRING': False,
    'DEFAULT_FILTER_BACKENDS': ['django_filters.rest_framework.DjangoFilterBackend'],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

SIMPLE_JWT = {
    # Short-lived access token + longer refresh token, so a device stays
    # signed in without re-entering a password constantly, same account
    # usable from as many devices as you like.
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='http://localhost:5173', cast=Csv())
# For quick local dev you can instead set CORS_ALLOW_ALL_ORIGINS = True