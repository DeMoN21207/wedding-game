.PHONY: check fast-check backend-test backend-lint db-upgrade frontend-check frontend-test frontend-typecheck frontend-audit

PYTHON ?= ./.venv/bin/python
PYTEST ?= ./.venv/bin/pytest
RUFF ?= ./.venv/bin/ruff
NPM ?= npm

check: backend-lint backend-test frontend-check frontend-audit

fast-check: backend-test frontend-test frontend-typecheck

backend-test:
	PYTHONPATH=backend $(PYTEST) backend/tests -q

backend-lint:
	$(RUFF) check backend/app backend/migrations backend/tests

db-upgrade:
	PYTHONPATH=backend $(PYTHON) -m alembic upgrade head

frontend-check:
	cd frontend && $(NPM) run check

frontend-test:
	cd frontend && $(NPM) run test

frontend-typecheck:
	cd frontend && $(NPM) run typecheck

frontend-audit:
	cd frontend && $(NPM) audit --omit=dev
