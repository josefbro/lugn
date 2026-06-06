"""Datamodell för en användarplan."""

from dataclasses import dataclass, field
from enum import Enum


class AccountType(str, Enum):
    ISK = "isk"
    KF = "kf"
    DEPA = "depa"            # vanlig aktiedepå (AKB)
    AB_LIKVID = "ab_likvid"  # AB-bankkonto / AB-värdepapper


class PensionType(str, Enum):
    ALLMAN = "allman"               # inkomst + premie via Pensionsmyndigheten
    TJP = "tjanstepension"          # ITP1, ITP2, SAF-LO, KAP-KL, PA16
    AB_PENSION = "ab_pension"       # egen tjänstepensions-försäkring via AB
    DIREKTPENSION = "direktpension"  # i AB:s balansräkning
    PRIVAT = "privat_pension"


@dataclass
class Account:
    """Ett investeringskonto/wrapper."""
    type: AccountType
    name: str
    balance: float
    expected_real_return: float = 0.05  # 5% real default
    avtals_avgift: float = 0.0          # för KF
    institution: str = ""


@dataclass
class Pension:
    """En framtida pensions-utbetalning (TJP / allmän / direkt etc.)."""
    type: PensionType
    name: str
    pott_idag: float = 0.0       # för TJP/AB-pension
    start_alder: int = 65
    period_ar: int = 20          # 5/10/15/20/-1 för livsvarig
    arlig_utbetalning_idag: float = 0.0  # för allmän pension (forecast från Min Pension)


@dataclass
class Plan:
    """En användares plan."""
    current_age: int
    retirement_age: int
    livslangd: int = 90              # för planerings-horisont

    # Mål
    income_need_per_month_real: float = 30_000  # kr/mån i dagens penningvärde

    # Vad användaren har
    accounts: list[Account] = field(default_factory=list)
    pensions: list[Pension] = field(default_factory=list)

    # Antaganden
    inflation: float = 0.02
    monthly_savings_real: float = 0.0  # sparande per månad fram till pension

    # Sambo / par
    has_partner: bool = False


@dataclass
class YearFlow:
    """Resultatet för ett år i simuleringen."""
    age: int
    year_offset: int          # 0 = current year
    income_gross: float       # bruttoflöde in
    tax: float                # total skatt
    income_net: float         # nettoflöde
    need: float               # behov detta år (real → nominellt)
    surplus_or_deficit: float
    account_balances: dict[str, float]
    pensions_active: list[str]
    notes: list[str] = field(default_factory=list)
