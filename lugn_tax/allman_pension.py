"""Allmän pension — åldersgränser och PGI-tak 2026.

För faktisk allmän pensions-storlek per individ: importera via
Min Pension PDF-export. Här hanterar vi bara regler/gränser.
"""

from lugn_tax.constants import YearConstants, C2026


def riktalder(year: YearConstants = C2026) -> int:
    """Riktåldern för innevarande år (67 för 2026-2031)."""
    return year.riktalder


def laga_uttagsalder(
    pension_typ: str = "allman",
    year: YearConstants = C2026,
) -> int:
    """Lägsta uttagsålder per pensionstyp.

    pension_typ: "allman" | "garanti" | "tjanstepension" | "ab_pension"
    """
    table = {
        "allman": year.laga_uttagsalder_allman,           # 64 (2026)
        "garanti": year.laga_uttagsalder_garanti,         # 67
        "tjanstepension": year.laga_uttagsalder_forsakring,  # 55
        "ab_pension": year.laga_uttagsalder_forsakring,   # 55
        "privat_pension": year.laga_uttagsalder_forsakring,  # 55
    }
    if pension_typ not in table:
        raise ValueError(
            f"Okänd pension_typ: {pension_typ}. Använd: {list(table)}"
        )
    return table[pension_typ]


def pgi_tak(year: YearConstants = C2026) -> int:
    """Pensionsgrundande inkomst-tak per år (kr)."""
    return int(year.pgi_tak_ibb * year.inkomstbasbelopp)
