# syntax=docker/dockerfile:1
# ── Build stage ───────────────────────────────────────────────────────────────
# The package and its dependencies are installed into an isolated prefix so the
# runtime stage can copy site-packages without dragging in compilers or pip.
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build
COPY pyproject.toml ./
COPY campusflow ./campusflow
RUN pip install --prefix=/install .

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Unprivileged user: the API never needs root, and it is the process that
# receives every candidate-facing request.
RUN useradd --create-home --uid 10001 campusflow

WORKDIR /app

COPY --from=builder /install /usr/local

# Alembic lives outside the package, so it is copied explicitly — the entrypoint
# applies the schema before serving.
COPY alembic.ini ./
COPY alembic ./alembic
COPY campusflow ./campusflow
# Operational scripts shipped with the deployment: the first-admin bootstrap
# (`provision_admin.py`) and the evidence-retention job (`purge_proctoring_evidence.py`)
# are run inside this container by an operator or by a compose service.
COPY scripts ./scripts

RUN mkdir -p /app/storage \
    && chown -R campusflow:campusflow /app

USER campusflow

EXPOSE 8000

# /api/health is dependency-free (no database round trip), so the probe stays
# truthful while Postgres is briefly unavailable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health', timeout=4)" || exit 1

# Migrations run in-process at start (idempotent, single replica). Scale out by
# running `alembic upgrade head` as a one-off job before rolling replicas — see
# docs/development.md §7.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn campusflow.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
