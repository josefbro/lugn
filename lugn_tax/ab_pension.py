"""AB-pension (egen tjänstepension för AB-ägare) — avdragstak 2026."""

from lugn_tax.constants import YearConstants, C2026


def ab_pension_max_avdrag(
    lon: float,
    year: YearConstants = C2026,
) -> float:
    """Max avdragsgill AB-pension per år.

    Regel: min(35% × lön, 10 × PBB).
    2026: 35% × lön, max 592 000 kr.
    """
    procent_baserat = lon * year.ab_pension_procent_av_lon
    tak = year.ab_pension_tak
    return min(procent_baserat, tak)
