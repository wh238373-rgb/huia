#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE_FILE="$SCRIPT_DIR/.env.example"

echo "Starting MEXC/GATE spread bot..."

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    echo ""
    echo "Created $ENV_FILE from .env.example"
    echo "Fill TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first, then run again."
    exit 1
  fi

  echo ".env.example not found"ч
  exit 1
fi

source "$ENV_FILE"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN is empty in .env"
  exit 1
fi

if [[ -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "TELEGRAM_CHAT_ID is empty in .env"
  exit 1
fi

if [[ -z "${DRY_RUN:-}" ]]; then
  echo "DRY_RUN=false" >> "$ENV_FILE"
fi

cd "$SCRIPT_DIR"
exec npm start
