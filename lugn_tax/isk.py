"""Investeringssparkonto (ISK) — schablonskatt 2026."""

from lugn_tax.constants import YearConstants, C2026


def isk_kapitalbas(
    varde_1_jan: float,
    varde_1_apr: float,
    varde_1_jul: float,
    varde_1_okt: float,
    insattningar: float = 0.0,
) -> float:
    """Beräkna ISK-kapitalbas enligt Skatteverkets formel.

    Kapitalbas = (värde vid kvartalsstarter + insättningar under året) / 4.
    """
    return (
        varde_1_jan + varde_1_apr + varde_1_jul + varde_1_okt + insattningar
    ) / 4


def isk_schablonintakt(kapitalbas: float, year: YearConstants = C2026) -> float:
    """Schablon-inkomst i kr (innan skatte-grundavdrag)."""
    return kapitalbas * year.isk_schablonintakt


def isk_skatt(
    kapitalbas: float,
    year: YearConstants = C2026,
    annan_kf_kapitalbas: float = 0.0,
) -> float:
    """Effektiv ISK-skatt i kr.

    2026 års grundavdrag på 300 000 kr gäller summan ISK + KF per person.
    `annan_kf_kapitalbas` parameter låter dig modellera detta korrekt
    (om personen har 200k i KF används 100k av grundavdraget där).
    """
    total_kapitalbas = kapitalbas + annan_kf_kapitalbas
    grundavdrag_anvant_av_isk = (
        min(year.isk_grundavdrag_per_person, total_kapitalbas)
        * kapitalbas
        / total_kapitalbas
        if total_kapitalbas > 0
        else 0.0
    )
    beskattningsbar = max(0.0, kapitalbas - grundavdrag_anvant_av_isk)
    return beskattningsbar * year.isk_effektiv_skatt
