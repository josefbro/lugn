"""K10 / 3:12-regler — NYA REGLER FRÅN 2026.

Stora förändringar 2026:
- Förenklingsregel + huvudregel slås ihop till en gemensam modell
- Grundbelopp = 4 IBB (höjt från 2.75 IBB)
- Lönekrav BORTTAGET
- Sparat utrymme räntas upp med SLR + 3pp
"""

from lugn_tax.constants import YearConstants, C2026


def k10_grans_belopp(
    andel_av_aktier: float,
    egen_lon: float,
    totalt_loneunderlag: float,
    sparat_utrymme_in: float = 0.0,
    year: YearConstants = C2026,
) -> dict[str, float]:
    """Beräkna gränsbelopp för K10 enligt 2026 års regler.

    Args:
        andel_av_aktier: 0.0-1.0, ägarandel i fåmansbolaget
        egen_lon: din egna lön från bolaget (kr/år)
        totalt_loneunderlag: summa lön till alla anställda inkl dig (kr/år)
        sparat_utrymme_in: sparat utrymme från tidigare år (kr)

    Returns:
        dict med komponenter och totalt gränsbelopp
    """
    # Grundbelopp fördelas proportionerligt
    grundbelopp = year.k10_grundbelopp * andel_av_aktier

    # Lönebaserat utrymme — nytt 2026: 50% × (andel av löneunderlag − 644 800)
    andel_loneunderlag = totalt_loneunderlag * andel_av_aktier
    lonebaserat_utrymme = max(
        0.0,
        0.5 * (andel_loneunderlag - year.k10_lonebaserat_avdrag),
    )

    # Sparat utrymme växer med SLR + 3pp
    sparat_utrymme = sparat_utrymme_in * (1.0 + year.k10_sparat_utrymme_rantesats)

    granspelopp_totalt = grundbelopp + lonebaserat_utrymme + sparat_utrymme

    return {
        "grundbelopp": grundbelopp,
        "lonebaserat_utrymme": lonebaserat_utrymme,
        "sparat_utrymme": sparat_utrymme,
        "totalt": granspelopp_totalt,
    }


def k10_utdelningsskatt(
    utdelning: float,
    grans_belopp: float,
    year: YearConstants = C2026,
) -> dict[str, float]:
    """Beskattning av utdelning från fåmansbolag.

    Inom gränsbelopp: 20% (kapital, lågbeskattat)
    Över gränsbelopp: tjänsteinkomst-beskattat (~50%+ marginal)

    Förenklat: vi modellerar över-gränsbelopp som lön_skatt.
    Använd salary_tax för korrekt beräkning.
    """
    inom = min(utdelning, grans_belopp)
    over = max(0.0, utdelning - grans_belopp)
    skatt_inom = inom * 0.20
    # Förenklat — kallaren bör skicka 'over' till lon_skatt() för korrekt skatt
    skatt_over_uppskattad = over * 0.55  # förenklat marginal-tak
    return {
        "inom_gransbelopp": inom,
        "over_gransbelopp": over,
        "skatt_inom": skatt_inom,
        "skatt_over_uppskattad": skatt_over_uppskattad,
        "totalt_uppskattad": skatt_inom + skatt_over_uppskattad,
        "nytt_sparat_utrymme": max(0.0, grans_belopp - utdelning),
    }
