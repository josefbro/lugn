"""bridge_sim — Pensions-brygga och Monte Carlo för svenska FIRE-scenarier.

Bygger på lugn_tax-paketet. Ingen extern dependency.
"""

from bridge_sim.model import (
    Account,
    AccountType,
    Plan,
    Pension,
    PensionType,
    YearFlow,
)
from bridge_sim.simulate import simulate_plan, bridge_required

__all__ = [
    "Account", "AccountType",
    "Plan",
    "Pension", "PensionType",
    "YearFlow",
    "simulate_plan", "bridge_required",
]
