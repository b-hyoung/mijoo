import requests
from bs4 import BeautifulSoup

def fetch_short_interest(ticker: str) -> dict:
    """Scrape short interest data from Finviz."""
    try:
        url = f"https://finviz.com/quote.ashx?t={ticker.upper()}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return _default_short_data()
        soup = BeautifulSoup(response.text, "html.parser")
        data = {}
        rows = soup.find_all("tr", class_="table-dark-row") + soup.find_all("tr", class_="table-light-row")
        for row in rows:
            cells = row.find_all("td")
            for i in range(0, len(cells) - 1, 2):
                label = cells[i].get_text(strip=True)
                value = cells[i + 1].get_text(strip=True)
                data[label] = value
        short_float_raw = data.get("Short Float", data.get("Short Float / Ratio", "0%"))
        short_float_pct = _parse_pct(short_float_raw)
        return {
            "short_float_pct": short_float_pct,
            "short_change": "N/A",
            "raw": short_float_raw
        }
    except Exception:
        return _default_short_data()

def _parse_pct(value: str) -> float:
    try:
        return float(value.replace("%", "").replace(",", "").strip().split("/")[0])
    except Exception:
        return 0.0

def _default_short_data() -> dict:
    return {"short_float_pct": 0.0, "short_change": "N/A", "raw": "N/A"}
