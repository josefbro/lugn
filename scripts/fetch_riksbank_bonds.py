#!/usr/bin/env python3
"""Fetch SEGVB10YC daily yields from the Riksbank SWEA API and convert them to
annual nominal total returns (decimal), to drop into prototype/market_history.js
alongside World/SIXRX.

Method (constant-maturity 10y bond approximation):
    TR_y ≈ y_{prev}/100 − D · (y_t − y_{t-1})/100 + (D² / 2) · ((y_t − y_{t-1})/100)²
where D ≈ 8 (modified duration of a par 10y at typical yields).

The yield ENTERING the year acts as the coupon return; the duration term
captures the price change from the yield move; convexity is small but free
to include.

Sampling convention: last available observation per calendar year (≈ year-end
business day). Years partially covered at the start (no preceding y_{t-1})
are dropped.

Run:
    python3 scripts/fetch_riksbank_bonds.py > /tmp/bonds.json
"""

import json
import sys
import urllib.request
from collections import defaultdict
from datetime import date

SERIES = "SEGVB10YC"
START  = "1986-12-01"        # need Dec 1986 to anchor 1987
END    = date.today().isoformat()
DURATION = 8.0               # modified duration, ~par 10y
URL = f"https://api.riksbank.se/swea/v1/Observations/{SERIES}/{START}/{END}"


def fetch():
    with urllib.request.urlopen(URL, timeout=30) as r:
        return json.load(r)


def year_end_yields(obs):
    """Pick the last observation in each calendar year. Values are in %."""
    last = {}
    for o in obs:
        d = o["date"]
        y = int(d[:4])
        if y not in last or d > last[y]["date"]:
            last[y] = o
    return {y: last[y]["value"] for y in sorted(last)}


def annual_total_returns(ye):
    """Skip the current calendar year — its last observation is partial-year
    and would produce a misleading 'annual' return.
    """
    this_year = date.today().year
    years = [y for y in sorted(ye) if y < this_year]
    out = {}
    for prev, cur in zip(years, years[1:]):
        y0 = ye[prev] / 100.0
        y1 = ye[cur]  / 100.0
        dy = y1 - y0
        tr = y0 - DURATION * dy + (DURATION ** 2) / 2 * dy * dy
        out[cur] = round(tr, 4)
    return out


def main():
    obs = fetch()
    ye  = year_end_yields(obs)
    tr  = annual_total_returns(ye)

    # Summary stats
    import statistics as st
    vals = list(tr.values())
    print(f"// Source: Riksbank SWEA API, series {SERIES} (Swedish 10y gov bond yield)", file=sys.stderr)
    print(f"// Years covered: {min(tr)}..{max(tr)}  n={len(vals)}", file=sys.stderr)
    print(f"// Annual nominal TR — mean={st.mean(vals):.4f}, stdev={st.pstdev(vals):.4f}", file=sys.stderr)
    print(f"// Min={min(vals):.4f}  Max={max(vals):.4f}", file=sys.stderr)

    # Emit JS-style block
    print("  // Svenska 10-åriga statsobligationer — nominell total return (decimal).")
    print(f"  // Konverterad från SEGVB10YC (Riksbanken SWEA) via TR ≈ y₀ − D·Δy + D²/2·(Δy)², D=8.")
    print("  bondsSE: {")
    print('    label: "Svenska statsobligationer 10y",')
    print(f'    source: "Riksbanken SWEA API ({SERIES}), duration-approximerad TR",')
    print("    returns: {")
    items = [f"{y}:{v}" for y, v in tr.items()]
    for i in range(0, len(items), 6):
        print("      " + ",".join(items[i:i+6]) + ("," if i + 6 < len(items) else ""))
    print("    }")
    print("  },")


if __name__ == "__main__":
    main()
