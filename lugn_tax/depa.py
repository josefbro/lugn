"""Privat depå (AKB) — reavinstskatt 30%."""


def depa_reavinst_skatt(
    forsaljningspris: float,
    omkostnadsbelopp: float,
    metod: str = "genomsnitt",
) -> float:
    """Reavinst × 30%. Förluster ger negativ skatt (avdragsgill mot vinster).

    metod: "genomsnitt" (genomsnittsmetoden) eller "fifo".
    Kallaren ska redan ha räknat ut omkostnadsbelopp enligt vald metod.
    """
    vinst = forsaljningspris - omkostnadsbelopp
    return vinst * 0.30
