# Scripts

Utility scripts for the local → snapshot → Vercel workflow.

## The three-command weekly update

```bash
# 1. Start the backend (separate terminal, leave it running)
./scripts/start_backend.sh

# 2. Wait a few minutes for the scheduler to warm tickers + run miss analysis
#    (or just leave it on overnight; the scheduler fires at 21:30 on weekdays)

# 3. Export + deploy (new terminal)
./scripts/deploy.sh
```

Vercel auto-builds within ~1 minute of the push.

---

## Files

### `start_backend.sh`

Loads `.env`, starts `uvicorn app.main:app` on port 8000 with UTF-8 output.
Leave the terminal open. `Ctrl+C` to stop.

### `deploy.sh`

Full pipeline: health-check the backend → export snapshots → `git add` →
`git commit` → `git push`.

Flags:
- `--dry`       — export only, skip all git operations
- `--no-push`   — export + commit locally, skip push
- `-h / --help` — print usage

### `export_snapshots.py`

Calls every backend endpoint and writes the response JSON into
`frontend/public/data/`. Safe to run repeatedly (overwrites).

Layout:
```
frontend/public/data/
├── stocks.json                     # ticker list
├── accuracy.json                   # /stats/accuracy
├── manifest.json                   # generation timestamp + summary
├── predict/<TICKER>.json           # /predict/<T>
├── history/<TICKER>.json           # /history/<T>?days=30
├── prediction-history/<TICKER>.json # /prediction-history/<T>?limit=30
└── miss-analysis/<TICKER>.json     # /stats/miss-analysis/<T> (miss tickers only)
```

Total size: ~550 KB for 11 tickers.

---

## What Vercel does

Connected to `b-hyoung/mijoo` master branch. On each push:

1. `npm install` (under frontend/)
2. `NEXT_PUBLIC_DATA_SOURCE=snapshot next build`
   → `output: 'export'` produces `frontend/out/` fully static HTML
3. Deploy `out/` to Vercel's edge CDN

No backend, no GPT, no API calls at runtime. Pure static hosting.

---

## When snapshots don't change

`deploy.sh` detects "no data changes" and exits without committing. This
happens if the backend hasn't generated new data since the last export
(e.g., cache still warm from this week).

Force a fresh prediction by clearing cache first:

```bash
py -c "
import sqlite3, datetime
conn = sqlite3.connect('data/stocks.db')
now = datetime.datetime.now(datetime.timezone.utc)
monday = (now - datetime.timedelta(days=now.weekday())).replace(
    hour=0, minute=0, second=0, microsecond=0)
conn.execute('DELETE FROM predictions WHERE predicted_at >= ?', (monday.isoformat(),))
conn.commit()
print('cache cleared')
"
```

Then hit any `/predict/{ticker}` endpoint to regenerate, then `./scripts/deploy.sh`.
