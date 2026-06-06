"""Inkomstskatt på lön och pension — förenklad modell.

För MVP: kommunalskatt ~32% + statlig 20% över skiktgräns.
För högre precision senare: kommun-specifik skattesats, jobbskatteavdrag.
"""

from lugn_tax.constants import YearConstants, C2026


# Förenklade konstanter — uppdateras med 2026 års exakta värden
KOMMUNAL_SKATT_DEFAULT = 0.32             # genomsnittlig kommunalskatt
STATLIG_SKATT = 0.20                      # statlig skatt
STATLIG_SKIKTGRANS_2026 = 643_100         # ungefärlig 2026-värde
GRUNDAVDRAG_BAS = 16_400                  # grundläggande
GRUNDAVDRAG_MAX = 41_500                  # max för låga inkomster


def grundavdrag(inkomst: float, alder: int, year: YearConstants = C2026) -> float:
    """Förenklad grundavdrags-modell. För 65+ adderas bonus."""
    # Trappformel — låga inkomster får mer, sjunker till 16 400 vid hög inkomst
    if inkomst < 50_000:
        ga = GRUNDAVDRAG_BAS
    elif inkomst < 150_000:
        ga = GRUNDAVDRAG_BAS + (inkomst - 50_000) * 0.25
    elif inkomst < 380_000:
        ga = GRUNDAVDRAG_MAX
    else:
        # Avtrappning
        ga = max(GRUNDAVDRAG_BAS, GRUNDAVDRAG_MAX - (inkomst - 380_000) * 0.1)

    if alder >= 65:
        ga += year.grundavdrag_65_plus_bonus
    return ga


def lon_skatt(
    inkomst: float,
    alder: int = 40,
    kommunal_skatt: float = KOMMUNAL_SKATT_DEFAULT,
    year: YearConstants = C2026,
) -> float:
    """Förenklad skatt på lön/pension.

    Beaktar grundavdrag (med 65+ bonus) och statlig skatt över skiktgräns.
    """
    ga = grundavdrag(inkomst, alder, year)
    beskattningsbar = max(0.0, inkomst - ga)

    kommunal = beskattningsbar * kommunal_skatt
    statlig = max(0.0, beskattningsbar - STATLIG_SKIKTGRANS_2026) * STATLIG_SKATT

    return kommunal + statlig
