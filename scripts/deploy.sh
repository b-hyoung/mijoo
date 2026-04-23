#!/usr/bin/env bash
# One-click deploy: export snapshots -> git commit -> git push.
# Vercel auto-builds afterwards (~1 minute).
#
# Requires:
#   - local backend running on 127.0.0.1:8000
#   - git remote 'origin' pointing at GitHub
#
# Usage:
#   ./scripts/deploy.sh            # full pipeline
#   ./scripts/deploy.sh --no-push  # export + commit, skip push
#   ./scripts/deploy.sh --dry      # export only, no git

set -euo pipefail

# ─── Locate repo root ───────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ─── Parse flags ────────────────────────────────────────────────────
MODE="full"
for arg in "$@"; do
  case "$arg" in
    --dry|--export-only) MODE="dry" ;;
    --no-push)           MODE="no-push" ;;
    -h|--help)
      grep -E '^#' "$0" | sed 's/^# \{0,1\}//' | head -20
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ─── Check backend running ──────────────────────────────────────────
echo "[pre] Checking backend at http://127.0.0.1:8000 ..."
if ! curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:8000/health | grep -q 200; then
  echo ""
  echo "  ERROR: backend not reachable at 127.0.0.1:8000"
  echo ""
  echo "  Start it first:"
  echo "    set -a && source .env && set +a"
  echo "    cd backend && PYTHONIOENCODING=utf-8 py -m uvicorn app.main:app --port 8000"
  echo ""
  exit 1
fi
echo "  OK"

# ─── Find a working python ──────────────────────────────────────────
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
echo "[pre] Using python: $PYTHON"

# ─── Step 1: export snapshots ───────────────────────────────────────
echo ""
echo "=== [1/3] Exporting snapshots ==="
PYTHONIOENCODING=utf-8 "$PYTHON" scripts/export_snapshots.py

# ─── Step 2: git stage ──────────────────────────────────────────────
if [ "$MODE" = "dry" ]; then
  echo ""
  echo "[dry-run] Skipping git stage/commit/push. Wrote files to frontend/public/data."
  exit 0
fi

echo ""
echo "=== [2/3] Git staging ==="
git add frontend/public/data
if git diff --cached --quiet; then
  echo "  No data changes detected. Nothing to deploy."
  exit 0
fi

# ─── Step 3: commit + push ──────────────────────────────────────────
DATE=$(date +%Y-%m-%d)
COMMIT_MSG="data: snapshot ${DATE}"
echo ""
echo "=== [3/3] Commit: \"${COMMIT_MSG}\" ==="
git commit -m "${COMMIT_MSG}"

if [ "$MODE" = "no-push" ]; then
  echo ""
  echo "[no-push] Committed locally. Run 'git push' when ready."
  exit 0
fi

echo ""
echo "=== Push ==="
git push

echo ""
echo "Done. Vercel will auto-deploy in ~1 minute."
echo "Check: https://vercel.com/b-hyoungs-projects/mijoo/deployments"
