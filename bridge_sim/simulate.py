"""Year-by-year cash flow simulering med svensk wrapper-skatt och pensions-bridge."""

from lugn_tax import (
    isk_skatt,
    kf_skatt,
    lon_skatt,
    tjp_arsutbetalning,
    laga_uttagsalder,
    C2026,
)

from bridge_sim.model import (
    Account,
    AccountType,
    Plan,
    Pension,
    PensionType,
    YearFlow,
)


DEFAULT_WITHDRAWAL_ORDER = [
    AccountType.DEPA,
    AccountType.ISK,
    AccountType.KF,
    AccountType.AB_LIKVID,
]


def _real_to_nominal(real_amount: float, years_from_now: int, inflation: float) -> float:
    return real_amount * (1 + inflation) ** years_from_now


def _pension_active(p: Pension, age: int, plan: Plan) -> bool:
    if p.type == PensionType.ALLMAN:
        return age >= max(p.start_alder, laga_uttagsalder("allman"))
    if age < p.start_alder:
        return False
    if p.period_ar < 0:
        return True
    return age < p.start_alder + p.period_ar


def _pension_annual_gross(p: Pension, age: int, plan: Plan) -> float:
    if not _pension_active(p, age, plan):
        return 0.0

    if p.type == PensionType.ALLMAN:
        years_from_now = age - plan.current_age
        return _real_to_nominal(p.arlig_utbetalning_idag, years_from_now, plan.inflation)

    years_to_start = max(0, p.start_alder - plan.current_age)
    pott_vid_start = p.pott_idag * (1 + 0.04) ** years_to_start
    return tjp_arsutbetalning(pott_vid_start, p.period_ar if p.period_ar > 0 else 25)


def simulate_plan(plan: Plan, year=C2026, withdrawal_order=None) -> list[YearFlow]:
    """Deterministisk simulering — grunden för Monte Carlo senare."""
    if withdrawal_order is None:
        withdrawal_order = DEFAULT_WITHDRAWAL_ORDER

    accounts = [
        Account(
            type=a.type, name=a.name, balance=a.balance,
            expected_real_return=a.expected_real_return,
            avtals_avgift=a.avtals_avgift, institution=a.institution,
        )
        for a in plan.accounts
    ]

    flows: list[YearFlow] = []

    for age in range(plan.current_age, plan.livslangd + 1):
        offset = age - plan.current_age
        notes: list[str] = []

        need_annual = plan.income_need_per_month_real * 12
        need_nominell = _real_to_nominal(need_annual, offset, plan.inflation)

        in_accumulation = age < plan.retirement_age

        inflows_gross = 0.0
        tax_total = 0.0
        pensions_active: list[str] = []

        pension_gross = 0.0
        for p in plan.pensions:
            amt = _pension_annual_gross(p, age, plan)
            if amt > 0:
                pension_gross += amt
                pensions_active.append(p.name)

        if not in_accumulation:
            still_needed = need_nominell - pension_gross

            if still_needed > 0:
                for acc_type in withdrawal_order:
                    if still_needed <= 0:
                        break
                    for acc in accounts:
                        if acc.type != acc_type:
                            continue
                        if acc.balance <= 0:
                            continue
                        draw = min(still_needed, acc.balance)
                        acc.balance -= draw
                        inflows_gross += draw
                        still_needed -= draw
                        if still_needed <= 0:
                            break

            if still_needed > 0:
                notes.append(f"BRIST: {still_needed:,.0f} kr saknas")

            inflows_gross += pension_gross

            tax_total += lon_skatt(pension_gross, alder=age, year=year)
            for acc in accounts:
                if acc.type == AccountType.ISK:
                    other_kf = sum(a.balance for a in accounts if a.type == AccountType.KF)
                    tax_total += isk_skatt(acc.balance, year=year,
                                           annan_kf_kapitalbas=other_kf)
                elif acc.type == AccountType.KF:
                    other_isk = sum(a.balance for a in accounts if a.type == AccountType.ISK)
                    sch, avg = kf_skatt(acc.balance, acc.avtals_avgift,
                                        year=year, annan_isk_kapitalbas=other_isk)
                    tax_total += sch
                    acc.balance -= avg

        else:
            yearly_savings_nominell = _real_to_nominal(
                plan.monthly_savings_real * 12, offset, plan.inflation
            )
            isk_acc = next((a for a in accounts if a.type == AccountType.ISK), None)
            if isk_acc:
                isk_acc.balance += yearly_savings_nominell
            elif accounts:
                accounts[0].balance += yearly_savings_nominell

            for acc in accounts:
                if acc.type == AccountType.ISK:
                    other_kf = sum(a.balance for a in accounts if a.type == AccountType.KF)
                    tax_total += isk_skatt(acc.balance, year=year,
                                           annan_kf_kapitalbas=other_kf)
                elif acc.type == AccountType.KF:
                    other_isk = sum(a.balance for a in accounts if a.type == AccountType.ISK)
                    sch, avg = kf_skatt(acc.balance, acc.avtals_avgift,
                                        year=year, annan_isk_kapitalbas=other_isk)
                    tax_total += sch
                    acc.balance -= avg

            inflows_gross = 0.0

        for acc in accounts:
            acc.balance *= (1 + acc.expected_real_return + plan.inflation)

        flows.append(YearFlow(
            age=age,
            year_offset=offset,
            income_gross=inflows_gross,
            tax=tax_total,
            income_net=inflows_gross - tax_total,
            need=need_nominell if not in_accumulation else 0.0,
            surplus_or_deficit=(inflows_gross - tax_total) - (need_nominell if not in_accumulation else 0.0),
            account_balances={a.name: a.balance for a in accounts},
            pensions_active=pensions_active,
            notes=notes,
        ))

    return flows


def bridge_required(plan: Plan, year=C2026) -> dict[str, float]:
    """Beräkna bridge-pott som krävs vid retirement_age."""
    flows = simulate_plan(plan, year=year)
    retirement_flows = [f for f in flows if f.age >= plan.retirement_age]

    total_need = sum(f.need for f in retirement_flows)
    total_pension_gross = 0.0

    for f in retirement_flows:
        for p in plan.pensions:
            if _pension_active(p, f.age, plan):
                total_pension_gross += _pension_annual_gross(p, f.age, plan)

    avg_pension_tax_rate = 0.32
    pension_net_total = total_pension_gross * (1 - avg_pension_tax_rate)
    bridge_needed = max(0.0, total_need - pension_net_total)

    return {
        "total_need_nominell": total_need,
        "pension_brutto_total": total_pension_gross,
        "pension_netto_total": pension_net_total,
        "bridge_needed_nominell": bridge_needed,
        "bridge_needed_real_idag": bridge_needed / (1 + plan.inflation) ** (
            plan.retirement_age - plan.current_age
        ),
    }
