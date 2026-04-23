# backend/app/collectors/earnings_collector.py
import yfinance as yf
from datetime import datetime, timezone


def fetch_earnings_data(ticker: str) -> dict:
    """Fetch next earnings date + last 4 quarters EPS/revenue surprise history.
    Returns: {
        next_date: str or None,
        days_until: int or None,
        history: [{ quarter, eps_expected, eps_actual, eps_surprise_pct, revenue_expected, revenue_actual, revenue_surprise_pct }, ...]
    }"""
    try:
        stock = yf.Ticker(ticker)
        result = {"next_date": None, "days_until": None, "history": []}

        # Next earnings date
        try:
            cal = stock.calendar
            if cal is not None:
                # yfinance calendar can be dict or DataFrame
                if isinstance(cal, dict):
                    earnings_date = cal.get("Earnings Date")
                    if isinstance(earnings_date, list) and len(earnings_date) > 0:
                        earnings_date = earnings_date[0]
                else:
                    # DataFrame format
                    if "Earnings Date" in cal.columns:
                        earnings_date = cal["Earnings Date"].iloc[0]
                    elif "Earnings Date" in cal.index:
                        earnings_date = cal.loc["Earnings Date"].iloc[0]
                    else:
                        earnings_date = None

                if earnings_date is not None:
                    if hasattr(earnings_date, "strftime"):
                        result["next_date"] = earnings_date.strftime("%Y-%m-%d")
                        now = datetime.now(timezone.utc)
                        if hasattr(earnings_date, "tzinfo") and earnings_date.tzinfo is None:
                            from datetime import timezone as tz
                            earnings_date = earnings_date.replace(tzinfo=tz.utc)
                        days = (earnings_date - now).days
                        result["days_until"] = max(0, days)
                    else:
                        result["next_date"] = str(earnings_date)[:10]
        except Exception:
            pass

        # Earnings history (last 4 quarters)
        try:
            # Try earnings_dates first (has EPS data)
            eh = stock.earnings_dates
            if eh is not None and not eh.empty:
                # Filter to past earnings only
                now = datetime.now(timezone.utc)
                past = eh[eh.index <= now].head(4)
                for idx, row in past.iterrows():
                    eps_est = row.get("EPS Estimate")
                    eps_act = row.get("Reported EPS")
                    eps_surprise = None
                    if eps_est and eps_act and eps_est != 0:
                        try:
                            eps_surprise = round((float(eps_act) - float(eps_est)) / abs(float(eps_est)) * 100, 1)
                        except (ValueError, TypeError):
                            pass

                    # Revenue data from quarterly financials
                    quarter_str = idx.strftime("%Y-Q%q") if hasattr(idx, "strftime") else str(idx)[:10]
                    try:
                        quarter_str = f"Q{((idx.month - 1) // 3) + 1} {idx.year}"
                    except Exception:
                        quarter_str = str(idx)[:10]

                    result["history"].append({
                        "quarter": quarter_str,
                        "eps_expected": round(float(eps_est), 2) if eps_est else None,
                        "eps_actual": round(float(eps_act), 2) if eps_act else None,
                        "eps_surprise_pct": eps_surprise,
                        "revenue_expected": None,  # yfinance doesn't provide revenue estimates per quarter easily
                        "revenue_actual": None,
                        "revenue_surprise_pct": None,
                    })
        except Exception:
            pass

        # Try to get revenue from quarterly financials
        try:
            qf = stock.quarterly_financials
            if qf is not None and not qf.empty and "Total Revenue" in qf.index:
                revenues = qf.loc["Total Revenue"]
                for i, entry in enumerate(result["history"][:4]):
                    if i < len(revenues):
                        entry["revenue_actual"] = float(revenues.iloc[i]) if revenues.iloc[i] else None
        except Exception:
            pass

        return result
    except Exception:
        return {"next_date": None, "days_until": None, "history": []}
