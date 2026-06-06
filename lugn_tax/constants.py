"""Svenska skattekonstanter per år. Källor verifierade i SPEC.md sektion 12."""

from dataclasses import dataclass


@dataclass(frozen=True)
class YearConstants:
    """En frusen samling av alla skatte-relevanta konstanter för ett år."""

    year: int

    # Basbelopp (Statistiska centralbyrån / regering)
    inkomstbasbelopp: int        # IBB
    prisbasbelopp: int           # PBB
    forhojt_prisbasbelopp: int   # Förhöjt PBB

    # Statslåneräntan 30 nov föregående år (för ISK/KF schablon innevarande år)
    statslanerantan_30_nov_foregaende: float  # decimaltal, t.ex. 0.0255

    # ISK / KF
    isk_grundavdrag_per_person: int   # NY 2026: 300_000 kr på ISK+KF tillsammans
    isk_schablon_paslag: float        # 0.01 — SLR + 1pp
    kapital_skatt: float              # 0.30

    # Pensions-åldrar
    riktalder: int                    # 2026-2031: 67
    laga_uttagsalder_allman: int      # riktålder - 3
    laga_uttagsalder_garanti: int     # = riktåldern
    laga_uttagsalder_forsakring: int  # TJP/privat — 55

    # AB-pension
    ab_pension_procent_av_lon: float  # 0.35
    ab_pension_tak_pbb: float         # 10 × PBB

    # 3:12 / K10 (2026 nya regler)
    k10_grundbelopp_ibb: float        # 4 × IBB
    k10_sparat_utrymme_rantesats: float  # 0.0966 (SLR + 3pp 2026)
    k10_lonebaserat_avdrag: int       # 644_800 kr fast belopp 2026

    # PGI (för pensionsgrundande inkomst-tak)
    pgi_tak_ibb: float                # 8.07 × IBB

    # Skatte 65+
    grundavdrag_65_plus_bonus: int    # Extra grundavdrag för 65+

    @property
    def isk_schablonintakt(self) -> float:
        """SLR + 1pp = procent av kapitalbas som blir schablon-inkomst."""
        return self.statslanerantan_30_nov_foregaende + self.isk_schablon_paslag

    @property
    def isk_effektiv_skatt(self) -> float:
        """Procent skatt på kapitalbas (över grundavdrag)."""
        return self.isk_schablonintakt * self.kapital_skatt

    @property
    def k10_grundbelopp(self) -> int:
        """Grundbelopp i kr för K10 (nya 2026-regler)."""
        return int(self.k10_grundbelopp_ibb * self.inkomstbasbelopp)

    @property
    def ab_pension_tak(self) -> int:
        """Max avdragsgill AB-pension per år i kr."""
        return int(self.ab_pension_tak_pbb * self.prisbasbelopp)


# 2026 — verifierade från Pensionsmyndigheten, Skatteverket, PwC, Fondkollen
C2026 = YearConstants(
    year=2026,
    inkomstbasbelopp=80_600,
    prisbasbelopp=59_200,
    forhojt_prisbasbelopp=60_400,
    statslanerantan_30_nov_foregaende=0.0255,  # 30 nov 2025
    isk_grundavdrag_per_person=300_000,         # NY 2026
    isk_schablon_paslag=0.01,
    kapital_skatt=0.30,
    riktalder=67,
    laga_uttagsalder_allman=64,
    laga_uttagsalder_garanti=67,
    laga_uttagsalder_forsakring=55,
    ab_pension_procent_av_lon=0.35,
    ab_pension_tak_pbb=10.0,                    # 10 × PBB = 592_000 kr
    k10_grundbelopp_ibb=4.0,                    # 4 × IBB = 322_400 kr
    k10_sparat_utrymme_rantesats=0.0966,        # SLR + 3pp = 2.55% + 3% + extra
    k10_lonebaserat_avdrag=644_800,
    pgi_tak_ibb=8.07,
    grundavdrag_65_plus_bonus=24_500,           # ungefär, varierar med inkomst
)

# Historiska år för backtest. Lägg till efter hand.
_REGISTRY: dict[int, YearConstants] = {
    2026: C2026,
}


def get_year(year: int) -> YearConstants:
    """Hämta konstanter för ett år. KeyError om året inte är registrerat."""
    if year not in _REGISTRY:
        raise KeyError(
            f"År {year} ej registrerat i lugn_tax. Tillgängliga: {sorted(_REGISTRY)}"
        )
    return _REGISTRY[year]
