"""lugn_tax — wrapper-medveten skattemodell för svenska investerare 2026.

Ren Python, ingen dependency (utöver stdlib). Funktionerna är pure:
inputs in, tax/cash flow ut. Inga sidoeffekter.

Återanvänds av Lugn-appen, Real Estate Screener, och kan köras som CLI.
"""

from lugn_tax.constants import C2026, get_year
from lugn_tax.isk import isk_skatt, isk_schablonintakt, isk_kapitalbas
from lugn_tax.kf import kf_skatt
from lugn_tax.k10 import k10_grans_belopp, k10_utdelningsskatt
from lugn_tax.tjp import tjp_arsutbetalning, tjp_uttagsskatt
from lugn_tax.allman_pension import (
    laga_uttagsalder,
    riktalder,
    pgi_tak,
)
from lugn_tax.depa import depa_reavinst_skatt
from lugn_tax.ab_pension import ab_pension_max_avdrag
from lugn_tax.salary_tax import lon_skatt

__all__ = [
    "C2026", "get_year",
    "isk_skatt", "isk_schablonintakt", "isk_kapitalbas",
    "kf_skatt",
    "k10_grans_belopp", "k10_utdelningsskatt",
    "tjp_arsutbetalning", "tjp_uttagsskatt",
    "laga_uttagsalder", "riktalder", "pgi_tak",
    "depa_reavinst_skatt",
    "ab_pension_max_avdrag",
    "lon_skatt",
]
