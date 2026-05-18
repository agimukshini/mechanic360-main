"""
Django settings for the Mechanic360 backend.

This is a trimmed, commented settings module focused on:
- PostgreSQL + schema-based multi-tenancy (via django-tenants)
- JWT auth (SimpleJWT)
- REST API (Django REST Framework)
- S3-compatible storage (e.g. MinIO)

You should still create a `.env` file and override secrets and environment-
specific values there.
"""
from __future__ import annotations

import os
from pathlib import Path

from datetime import timedelta

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# Load variables from a local `.env` file if present
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Also try loading from project root (for Docker)
if not os.getenv("DJANGO_SECRET_KEY"):
    load_dotenv(BASE_DIR.parent / ".env")


# -----------------------------------------------------------------------------
# Core settings
# -----------------------------------------------------------------------------

DEBUG = os.getenv("DJANGO_DEBUG", "1") == "1"

_secret = os.getenv("DJANGO_SECRET_KEY", "").strip()
if not _secret:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key-do-not-use-in-production"
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false."
        )
else:
    SECRET_KEY = _secret

if not DEBUG and SECRET_KEY in ("CHANGE_ME_IN_PRODUCTION", "dev-only-insecure-key-do-not-use-in-production"):
    raise ImproperlyConfigured("Set a strong DJANGO_SECRET_KEY for production.")

ALLOWED_HOSTS: list[str] = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")


# -----------------------------------------------------------------------------
# Application definition
# -----------------------------------------------------------------------------

INSTALLED_APPS = [
    # Django core
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt",
    "django_filters",
    "drf_spectacular",
    "django_tenants",
    "corsheaders",
    "django_celery_beat",

    # Project apps (core domains)
    "tenancy",
    "accounts",
    "clients",
    "vehicles",
    "visits.apps.VisitsConfig",
    "inspections",
    "inventory",
]

MIDDLEWARE = [
    # Note: Removed TenantMainMiddleware - we use JWT-based tenant resolution instead
    # "django_tenants.middleware.main.TenantMainMiddleware",

    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # CORS support
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "mechanic360.middleware.TenantUserMiddleware",  # JWT-based tenant resolution
]

ROOT_URLCONF = "mechanic360.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mechanic360.wsgi.application"


# -----------------------------------------------------------------------------
# Database / Multi-tenancy
# -----------------------------------------------------------------------------

# We use django-tenants' `TenantModel` and schema-based multi-tenancy.
# Each workshop will live in its own PostgreSQL schema; row-level security (RLS)
# rules can still be enabled per table if desired.
DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": os.getenv("POSTGRES_DB", "mechanic360"),
        "USER": os.getenv("POSTGRES_USER", "postgres"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

# CORS — comma-separated origins in CORS_ALLOWED_ORIGINS, else localhost defaults
_cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
CORS_ALLOW_CREDENTIALS = True

# Django-tenants configuration
DATABASE_ROUTERS = ["django_tenants.routers.TenantSyncRouter"]

TENANT_MODEL = "tenancy.WorkshopTenant"  # app.Model used for tenants
TENANT_DOMAIN_MODEL = "tenancy.WorkshopDomain"  # app.Model for domains / subdomains

SHARED_APPS = [
    "django_tenants",          # must be before django.contrib.contenttypes
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.admin",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Shared project apps (live in the public schema)
    "tenancy",
    "accounts",
    "marketplace",
    "django_celery_beat",
]

TENANT_APPS = [
    # Per-tenant apps (data is stored per schema)
    "clients",
    "vehicles",
    "visits",
    "inspections",
    "inventory",
]

INSTALLED_APPS = SHARED_APPS + TENANT_APPS


# -----------------------------------------------------------------------------
# Auth / Users
# -----------------------------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

# JWT httpOnly cookies (SPA uses withCredentials; header fallback for API clients)
JWT_AUTH_COOKIE = "access_token"
JWT_AUTH_REFRESH_COOKIE = "refresh_token"
JWT_AUTH_COOKIE_SECURE = not DEBUG
JWT_AUTH_COOKIE_HTTPONLY = True
JWT_AUTH_COOKIE_SAMESITE = "Lax"
JWT_AUTH_COOKIE_PATH = "/"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.cookie_auth.CookieJWTAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        "auth": "20/hour",
        "registration": "5/hour",
        "user_burst": "60/minute",
    },
    # Hook up OpenAPI schema generation
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Mechanic360 API",
    "DESCRIPTION": "Multi-tenant mechanic workshop management API (Django)",
    "VERSION": "1.0.0",
}


# -----------------------------------------------------------------------------
# Password validation
# -----------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# -----------------------------------------------------------------------------
# Internationalization
# -----------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# -----------------------------------------------------------------------------
# Static & media files
# -----------------------------------------------------------------------------

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# S3 / MinIO storage (can be toggled via env vars)
USE_S3_STORAGE = os.getenv("USE_S3_STORAGE", "0") == "1"

if USE_S3_STORAGE:
    # Configure django-storages to talk to MinIO or S3
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    AWS_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", "")
    AWS_STORAGE_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "mechanic360")
    AWS_S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://minio:9000")
    AWS_S3_REGION_NAME = os.getenv("S3_REGION", "us-east-1")
    # Signed URLs in production unless explicitly disabled
    AWS_QUERYSTRING_AUTH = os.getenv("S3_QUERYSTRING_AUTH", "0" if DEBUG else "1") == "1"


# -----------------------------------------------------------------------------
# Celery / Redis (for reminders & background jobs)
# -----------------------------------------------------------------------------

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL


# -----------------------------------------------------------------------------
# Security hardening (baseline; extend for GDPR/ISO 27001)
# -----------------------------------------------------------------------------

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "0") == "1"


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


