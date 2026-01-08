SHELL := bash
.DEFAULT_GOAL := help

API_HOST ?= 127.0.0.1
API_PORT ?= 8000
FRONTEND_PORT ?= 3000

PYTHON ?= python3
VENVDIR ?= venv

.PHONY: help install dev-up api-venv backend-run frontend-install frontend-dev test lint type-check frontend-type-check

help: ## Show available make targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .+' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}' | sort

install: ## Install backend (venv) and frontend deps
	$(MAKE) api-venv
	$(MAKE) frontend-install

dev-up: ## Run API + frontend together (uses scripts/dev-up.sh)
	API_HOST=$(API_HOST) API_PORT=$(API_PORT) FRONTEND_PORT=$(FRONTEND_PORT) bash scripts/dev-up.sh

api-venv: ## Create venv and install backend dev requirements
	$(PYTHON) -m venv $(VENVDIR)
	. $(VENVDIR)/bin/activate && pip install -U pip && pip install -r requirements-dev.txt

backend-run: ## Run FastAPI app with reload (uvicorn)
	APP_MODULE?=src.api.app:app; \
	if [ -x "$(VENVDIR)/bin/uvicorn" ]; then \
		"$(VENVDIR)/bin/uvicorn" "$$APP_MODULE" --reload --host 0.0.0.0 --port $(API_PORT); \
	else \
		uvicorn "$$APP_MODULE" --reload --host 0.0.0.0 --port $(API_PORT); \
	fi

frontend-install: ## Install frontend dependencies
	cd frontend && npm install

frontend-dev: ## Run Next.js dev server (respects API_HOST/API_PORT)
	cd frontend && NEXT_PUBLIC_API_URL=http://$(API_HOST):$(API_PORT) NEXT_PUBLIC_WS_URL=ws://$(API_HOST):$(API_PORT) npm run dev -- -p $(FRONTEND_PORT)

test: ## Run Python tests
	pytest

lint: ## Run pre-commit on all files
	pre-commit run --all-files

type-check: ## Run mypy (backend) and TS type-check (frontend)
	mypy
	cd frontend && npm run type-check
