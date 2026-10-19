FROM python:3.13@sha256:f758b6ca6fd1a733d6d50584acca528421c0d86d260107ede3f14ba1928b1343

ENV PYTHONDONTWRITEBYTECODE=1
ENV POETRY_HOME=/opt/poetry
ENV POETRY_VENV=/opt/poetry-venv
ENV POETRY_CACHE_DIR=/opt/.cache

ARG DISABLE_SESSION_COOKIE_SECURITY
ENV DISABLE_SESSION_COOKIE_SECURITY=${DISABLE_SESSION_COOKIE_SECURITY:-false}

# Install poetry separated from system interpreter
RUN python3 -m venv $POETRY_VENV \
    && $POETRY_VENV/bin/pip install -U pip==26.2.1 setuptools==84.0.0 \
    && $POETRY_VENV/bin/pip install poetry==2.5.1
ENV PATH="${PATH}:${POETRY_VENV}/bin"

WORKDIR /app

COPY pyproject.toml poetry.lock ./

RUN poetry install --no-root --only main

COPY gunicorn.conf.py ./
COPY csp_simulator/ ./csp_simulator/

RUN adduser --system --no-create-home csp-runner
USER csp-runner
CMD ["poetry","--directory", "/app", "run", "gunicorn", "--config=gunicorn.conf.py"]
