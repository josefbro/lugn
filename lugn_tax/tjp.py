"""Tjänstepension — utbetalning och beskattning."""

from lugn_tax.constants import YearConstants, C2026
from lugn_tax.salary_tax import lon_skatt


def tjp_arsutbetalning(
    pott_vid_start: float,
    period_ar: int,
    arlig_avkastning: float = 0.03,
) -> float:
    """Beräkna årlig utbetalning från TJP-pott.

    Förenklat: annuitetsmodell med given avkastning.
    period_ar: 5, 10, 15, 20 eller -1 för livsvarig (antar 25 år förenklat).
    """
    if period_ar <= 0:
        period_ar = 25  # förenklad livsvarig — antagande om livslängd ~90

    if arlig_avkastning == 0:
        return pott_vid_start / period_ar

    # Annuitetsformel: PMT = PV × r / (1 − (1+r)^−n)
    r = arlig_avkastning
    n = period_ar
    return pott_vid_start * r / (1 - (1 + r) ** -n)


def tjp_uttagsskatt(
    arsutbetalning: float,
    alder: int,
    annan_lon: float = 0.0,
    year: YearConstants = C2026,
) -> float:
    """TJP-utbetalning beskattas som lön — 65+ har högre grundavdrag.

    Antar kommunalskatt ~32% som proxy. För verklig beräkning krävs kommun.
    """
    total_skattepliktig_inkomst = arsutbetalning + annan_lon
    return lon_skatt(total_skattepliktig_inkomst, alder=alder, year=year)
