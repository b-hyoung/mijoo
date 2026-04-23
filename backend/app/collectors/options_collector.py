# backend/app/collectors/options_collector.py
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta


def _select_expiry(stock, earnings_date: str | None = None) -> tuple[list[str], str]:
    """Select option expiry dates based on earnings proximity.
    Returns (list of expiry dates to analyze, data_source label)."""
    try:
        options = stock.options  # list of expiry date strings
        if not options:
            return [], "none"
    except Exception:
        return [], "none"

    now = datetime.now()

    # If earnings within 30 days, use earnings-adjacent expiry
    if earnings_date:
        try:
            earn_dt = datetime.strptime(earnings_date, "%Y-%m-%d")
            days_to_earnings = (earn_dt - now).days
            if 0 < days_to_earnings <= 30:
                # Find expiry closest to but after earnings
                for exp in options:
                    exp_dt = datetime.strptime(exp, "%Y-%m-%d")
                    if exp_dt >= earn_dt:
                        return [exp], "earnings"
        except (ValueError, TypeError):
            pass

    # Default: nearest + monthly (about 30 days out)
    selected = []
    if len(options) >= 1:
        selected.append(options[0])  # nearest
    if len(options) >= 2:
        # Find one roughly 30 days out
        target = now + timedelta(days=30)
        monthly = min(options[1:], key=lambda x: abs((datetime.strptime(x, "%Y-%m-%d") - target).days))
        if monthly != selected[0]:
            selected.append(monthly)

    return selected, "nearest+monthly"


def _compute_hv20(stock, ticker: str) -> float:
    """Compute 20-day historical volatility from price data."""
    try:
        hist = stock.history(period="3mo")
        if hist is None or len(hist) < 21:
            return 0.0
        returns = np.log(hist["Close"] / hist["Close"].shift(1)).dropna()
        hv = float(returns.tail(20).std() * np.sqrt(252) * 100)
        return hv
    except Exception:
        return 0.0


def fetch_options_data(ticker: str, earnings_date: str | None = None) -> dict:
    """Fetch options chain summary: P/C ratio, IV rank, unusual activity.

    Expiry selection (B+C hybrid):
    - Earnings within 30 days → use earnings-adjacent expiry
    - Otherwise → nearest expiry + monthly (30d out) average
    """
    default = {
        "pc_ratio": None, "iv_rank": None,
        "unusual_activity": None, "unusual_side": None,
        "data_source": "none", "expiry_used": None,
    }

    try:
        stock = yf.Ticker(ticker)
        expiries, data_source = _select_expiry(stock, earnings_date)

        if not expiries:
            return default

        total_call_vol = 0
        total_put_vol = 0
        max_unusual = 0.0
        unusual_side = None
        all_ivs = []

        for exp in expiries:
            try:
                chain = stock.option_chain(exp)
                calls = chain.calls
                puts = chain.puts

                if calls is not None and not calls.empty:
                    total_call_vol += int(calls["volume"].fillna(0).sum())
                    # Collect IVs near the money
                    for _, row in calls.iterrows():
                        iv = row.get("impliedVolatility")
                        if iv and iv > 0:
                            all_ivs.append(float(iv))
                        # Unusual activity: volume vs open interest
                        vol = row.get("volume", 0) or 0
                        oi = row.get("openInterest", 0) or 0
                        if oi > 0 and vol > 0:
                            ratio = vol / oi
                            if ratio > max_unusual:
                                max_unusual = ratio
                                unusual_side = "CALL"

                if puts is not None and not puts.empty:
                    total_put_vol += int(puts["volume"].fillna(0).sum())
                    for _, row in puts.iterrows():
                        iv = row.get("impliedVolatility")
                        if iv and iv > 0:
                            all_ivs.append(float(iv))
                        vol = row.get("volume", 0) or 0
                        oi = row.get("openInterest", 0) or 0
                        if oi > 0 and vol > 0:
                            ratio = vol / oi
                            if ratio > max_unusual:
                                max_unusual = ratio
                                unusual_side = "PUT"
            except Exception:
                continue

        # P/C ratio
        pc_ratio = None
        if total_call_vol > 0:
            pc_ratio = round(total_put_vol / total_call_vol, 2)

        # IV rank: current ATM IV vs 20-day historical volatility
        iv_rank = None
        if all_ivs:
            avg_iv = np.mean(all_ivs) * 100  # Convert to percentage
            hv20 = _compute_hv20(stock, ticker)
            if hv20 > 0:
                # IV/HV ratio normalized to 0-100
                ratio = avg_iv / hv20
                iv_rank = int(min(100, max(0, (ratio - 0.5) / 1.5 * 100)))
            else:
                iv_rank = 50  # Default if HV unavailable

        # Unusual activity (cap at reasonable value)
        unusual = round(min(max_unusual, 50.0), 1) if max_unusual > 1.0 else None

        return {
            "pc_ratio": pc_ratio,
            "iv_rank": iv_rank,
            "unusual_activity": unusual,
            "unusual_side": unusual_side if unusual else None,
            "data_source": data_source,
            "expiry_used": expiries[0] if expiries else None,
        }
    except Exception:
        return default
