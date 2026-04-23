# backend/app/anomaly.py
import numpy as np
import pandas as pd


def _check_volume_surge(price_df: pd.DataFrame, order_flow: dict) -> dict:
    """Signal: price flat + volume surging = someone building a position."""
    if price_df is None or len(price_df) < 20:
        return {"name": "거래량 급증 + 횡보", "score": 0, "direction": None, "detail": "데이터 부족"}

    recent = price_df.tail(20)
    price_start = float(recent["close"].iloc[0])
    price_end = float(recent["close"].iloc[-1])
    price_change = abs((price_end - price_start) / price_start * 100) if price_start > 0 else 0

    vol_recent = float(recent["volume"].tail(5).mean())
    vol_early = float(recent["volume"].head(5).mean())
    vol_ratio = vol_recent / vol_early if vol_early > 0 else 1.0

    if price_change < 3 and vol_ratio >= 1.5:
        buy_dom = order_flow.get("buy_dominance_pct", 50)
        direction = "UP" if buy_dom > 55 else "DOWN" if buy_dom < 45 else None
        score = 25 if vol_ratio >= 2.0 else int(15 + (vol_ratio - 1.5) * 20)
        return {"name": "거래량 급증 + 횡보", "score": min(25, score), "direction": direction, "detail": f"거래량 {vol_ratio:.1f}x, 가격변동 {price_change:.1f}%, 매수우위 {buy_dom:.0f}%"}

    return {"name": "거래량 급증 + 횡보", "score": 0, "direction": None, "detail": f"거래량 {vol_ratio:.1f}x, 가격변동 {price_change:.1f}%"}


def _check_iv_surge(options_data: dict) -> dict:
    """Signal: IV rank very high = market expects big move."""
    iv_rank = options_data.get("iv_rank") if options_data else None
    if iv_rank is None:
        return {"name": "IV 급등", "score": 0, "direction": None, "detail": "옵션 데이터 없음"}

    if iv_rank >= 80:
        # Direction: if P/C < 1 means more calls (bullish IV), else bearish
        pc = options_data.get("pc_ratio")
        direction = None
        if pc is not None:
            direction = "DOWN" if pc > 1.0 else "UP"
        score = 20 if iv_rank >= 90 else int(10 + (iv_rank - 80) * 1.0)
        return {"name": "IV 급등", "score": min(20, score), "direction": direction, "detail": f"IV rank {iv_rank}%"}

    return {"name": "IV 급등", "score": 0, "direction": None, "detail": f"IV rank {iv_rank}%"}


def _check_unusual_options(options_data: dict) -> dict:
    """Signal: extreme volume on specific strikes = smart money."""
    unusual = options_data.get("unusual_activity") if options_data else None
    if unusual is None or unusual < 5.0:
        detail = f"{unusual:.1f}x" if unusual else "감지 안 됨"
        return {"name": "옵션 이상 거래", "score": 0, "direction": None, "detail": detail}

    side = options_data.get("unusual_side")
    direction = "UP" if side == "CALL" else "DOWN" if side == "PUT" else None
    score = 20 if unusual >= 10 else int(10 + (unusual - 5) * 2)
    return {"name": "옵션 이상 거래", "score": min(20, score), "direction": direction, "detail": f"평소 대비 {unusual:.1f}x ({side})"}


def _check_insider_reversal(insider_data: dict) -> dict:
    """Signal: insider switching from net sell to net buy (or vice versa)."""
    if not insider_data:
        return {"name": "내부자 방향 전환", "score": 0, "direction": None, "detail": "데이터 없음"}

    net = insider_data.get("net_shares_90d", 0)
    recent = insider_data.get("recent", [])

    if len(recent) < 2:
        return {"name": "내부자 방향 전환", "score": 0, "direction": None, "detail": "거래 부족"}

    # Check if there's a mix of buy and sell in recent transactions (signals reversal)
    types = [t.get("type") for t in recent[:5]]
    has_buy = "매수" in types
    has_sell = "매도" in types

    if has_buy and has_sell:
        # Mixed signals — check which is more recent
        latest_type = types[0]
        direction = "UP" if latest_type == "매수" else "DOWN"
        return {"name": "내부자 방향 전환", "score": 15, "direction": direction, "detail": f"최근 {latest_type} 전환, 순{net:+,}주"}

    if abs(net) > 500000:
        direction = "UP" if net > 0 else "DOWN"
        return {"name": "내부자 방향 전환", "score": 8, "direction": direction, "detail": f"순{net:+,}주 (대량)"}

    return {"name": "내부자 방향 전환", "score": 0, "direction": None, "detail": f"순{net:+,}주"}


def _check_institutional_surge(institutional_data: dict) -> dict:
    """Signal: major institutional holders rapidly changing positions."""
    if not institutional_data:
        return {"name": "기관 보유 급변", "score": 0, "direction": None, "detail": "데이터 없음"}

    holders = institutional_data.get("top_holders", [])
    max_change = 0.0
    max_direction = None

    for h in holders:
        change = h.get("change_pct")
        if change is not None and abs(change) > abs(max_change):
            max_change = change
            max_direction = "UP" if change > 0 else "DOWN"

    if abs(max_change) >= 10:
        score = 10
        return {"name": "기관 보유 급변", "score": score, "direction": max_direction, "detail": f"최대 변동 {max_change:+.1f}%"}

    return {"name": "기관 보유 급변", "score": 0, "direction": None, "detail": f"최대 변동 {max_change:+.1f}%"}


def _check_pc_ratio_extreme(options_data: dict) -> dict:
    """Signal: P/C ratio at extremes = crowded positioning."""
    pc = options_data.get("pc_ratio") if options_data else None
    if pc is None:
        return {"name": "P/C ratio 극단", "score": 0, "direction": None, "detail": "데이터 없음"}

    if pc <= 0.3:
        return {"name": "P/C ratio 극단", "score": 10, "direction": "UP", "detail": f"P/C {pc:.2f} (극단적 낙관)"}
    if pc >= 1.5:
        return {"name": "P/C ratio 극단", "score": 10, "direction": "DOWN", "detail": f"P/C {pc:.2f} (극단적 비관)"}

    return {"name": "P/C ratio 극단", "score": 0, "direction": None, "detail": f"P/C {pc:.2f}"}


def calculate_anomaly_score(
    price_df: pd.DataFrame,
    options_data: dict | None = None,
    insider_data: dict | None = None,
    institutional_data: dict | None = None,
    order_flow: dict | None = None,
) -> dict:
    """Check 6 anomaly signals. Returns score (0-100), direction, level, and signal details."""
    signals = [
        _check_volume_surge(price_df, order_flow or {}),
        _check_iv_surge(options_data or {}),
        _check_unusual_options(options_data or {}),
        _check_insider_reversal(insider_data or {}),
        _check_pc_ratio_extreme(options_data or {}),
    ]

    total_score = sum(s["score"] for s in signals)

    # Direction: weighted vote of triggered signals
    up_score = sum(s["score"] for s in signals if s["direction"] == "UP")
    down_score = sum(s["score"] for s in signals if s["direction"] == "DOWN")
    direction = "UP" if up_score > down_score else "DOWN" if down_score > up_score else None

    # Level
    if total_score >= 71:
        level = "경고"
    elif total_score >= 51:
        level = "주의"
    elif total_score >= 31:
        level = "관심"
    else:
        level = "정상"

    return {
        "score": total_score,
        "direction": direction,
        "level": level,
        "signals": signals,
    }
