"""Kapitalförsäkring (KF) — samma schablon som ISK + avtalsavgift."""

from lugn_tax.constants import YearConstants, C2026


def kf_skatt(
    kapitalbas: float,
    avtals_avgift_procent: float = 0.0,
    year: YearConstants = C2026,
    annan_isk_kapitalbas: float = 0.0,
) -> tuple[float, float]:
    """Returnerar (schablonskatt_kr, avtalsavgift_kr).

    2026 års 300 000 kr-grundavdrag delas symmetriskt mellan ISK och KF.
    """
    total_kapitalbas = kapitalbas + annan_isk_kapitalbas
    grundavdrag_anvant_av_kf = (
        min(year.isk_grundavdrag_per_person, total_kapitalbas)
        * kapitalbas
        / total_kapitalbas
        if total_kapitalbas > 0
        else 0.0
    )
    beskattningsbar = max(0.0, kapitalbas - grundavdrag_anvant_av_kf)
    schablonskatt = beskattningsbar * year.isk_effektiv_skatt
    avgift = kapitalbas * avtals_avgift_procent
    return schablonskatt, avgift
