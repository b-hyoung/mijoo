import time
import yfinance as yf
from datetime import datetime, timezone, timedelta


def _get_info_with_retry(ticker: str, max_retries: int = 3) -> dict:
    """Get yfinance info with retry on 401/rate limit."""
    for attempt in range(max_retries):
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            if info and info.get("currentPrice") or info.get("regularMarketPrice"):
                return info
        except Exception:
            pass
        if attempt < max_retries - 1:
            time.sleep(2 * (attempt + 1))  # 2s, 4s backoff
    return {}


def fetch_analyst_data(ticker: str) -> dict:
    """Fetch analyst price targets and recommendations from yfinance."""
    try:
        info = _get_info_with_retry(ticker)

        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        target_mean = info.get("targetMeanPrice")
        target_high = info.get("targetHighPrice")
        target_low = info.get("targetLowPrice")
        num_analysts = info.get("numberOfAnalystOpinions")
        recommendation = info.get("recommendationKey", "")  # strong_buy, buy, hold, sell, strong_sell

        upside_pct = None
        if current_price and target_mean:
            upside_pct = round((target_mean - current_price) / current_price * 100, 1)

        return {
            "target_mean": round(target_mean, 2) if target_mean else None,
            "target_high": round(target_high, 2) if target_high else None,
            "target_low": round(target_low, 2) if target_low else None,
            "upside_pct": upside_pct,
            "num_analysts": num_analysts,
            "recommendation": recommendation,
        }
    except Exception:
        return {}


def fetch_insider_data(ticker: str) -> dict:
    """Fetch recent insider transactions from yfinance."""
    try:
        stock = yf.Ticker(ticker)
        txns = stock.insider_transactions

        if txns is None or txns.empty:
            return {"recent": [], "net_shares_90d": 0}

        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        recent = []
        net_shares = 0

        for _, row in txns.iterrows():
            try:
                date = row.get("Start Date") or row.get("Date")
                if date is None:
                    continue
                if hasattr(date, "tzinfo"):
                    if date.tzinfo is None:
                        date = date.replace(tzinfo=timezone.utc)
                else:
                    date = datetime.strptime(str(date)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)

                if date < cutoff:
                    continue

                shares = int(row.get("Shares", 0) or 0)
                text = str(row.get("Text", "") or row.get("Transaction", "")).lower()
                is_buy = any(w in text for w in ["purchase", "buy", "acquisition", "bought"])
                is_sell = any(w in text for w in ["sale", "sell", "sold", "disposition"])

                if is_buy:
                    net_shares += shares
                elif is_sell:
                    net_shares -= shares

                recent.append({
                    "date": str(date)[:10],
                    "insider": str(row.get("Insider", "") or ""),
                    "title": str(row.get("Position", "") or ""),
                    "type": "매수" if is_buy else "매도" if is_sell else "기타",
                    "shares": shares,
                    "value": int(row.get("Value", 0) or 0),
                })
            except Exception:
                continue

        recent = sorted(recent, key=lambda x: x["date"], reverse=True)[:5]

        return {
            "recent": recent,
            "net_shares_90d": net_shares,
        }
    except Exception:
        return {"recent": [], "net_shares_90d": 0}


def fetch_institutional_data(ticker: str) -> dict:
    """Fetch institutional holder summary from yfinance with share change tracking."""
    try:
        stock = yf.Ticker(ticker)
        holders = stock.institutional_holders

        if holders is None or holders.empty:
            return {"top_holders": [], "total_pct": None, "change_pct": None}

        top = []
        total_current_shares = 0
        for _, row in holders.head(5).iterrows():
            try:
                pct_held = row.get("% Out") or row.get("pctHeld")
                shares = row.get("Shares") or row.get("shares")
                date_reported = row.get("Date Reported")
                pct_change = row.get("% Change") or row.get("pctChange")

                entry = {
                    "name": str(row.get("Holder", "") or ""),
                    "pct_held": round(float(pct_held) * 100, 2) if pct_held else None,
                    "shares": int(shares) if shares else None,
                }
                if pct_change is not None:
                    try:
                        entry["change_pct"] = round(float(pct_change) * 100, 2)
                    except (ValueError, TypeError):
                        pass
                if date_reported is not None:
                    entry["date_reported"] = str(date_reported)[:10]

                if shares:
                    total_current_shares += int(shares)
                top.append(entry)
            except Exception:
                continue

        total_pct = None
        try:
            major = stock.major_holders
            if major is not None and not major.empty:
                for _, row in major.iterrows():
                    label = str(row.iloc[1]).lower()
                    if "institution" in label:
                        total_pct = round(float(str(row.iloc[0]).replace("%", "")), 1)
                        break
        except Exception:
            pass

        return {
            "top_holders": top,
            "total_pct": total_pct,
        }
    except Exception:
        return {"top_holders": [], "total_pct": None}
