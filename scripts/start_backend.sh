#!/usr/bin/env bash
# Start the local backend with env loaded and utf-8 output.
# Run this, leave it open, then in another terminal run ./scripts/deploy.sh
#
# Press Ctrl+C to stop.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f .env ]; then
  echo "ERROR: .env not found at repo root."
  echo "Create it from .env.example and fill in real API keys (OPENAI_API_KEY, etc)."
  exit 1
fi

# Load env vars for this shell
set -a
source .env
set +a

cd backend

# Find python
PYTHON=""
for p in "/c/Users/ACE/AppData/Local/Programs/Python/Python311/python.exe" \
         "python3" "python" "py"; do
  if command -v "$p" > /dev/null 2>&1 && "$p" --version > /dev/null 2>&1; then
    PYTHON="$p"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "ERROR: no python interpreter found"
  exit 1
fi

echo "Starting backend on http://127.0.0.1:8000 ..."
echo "Leave this terminal open. Ctrl+C to stop."
echo ""

exec env PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
  "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
