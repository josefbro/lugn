"""Demo-CLI: kör ett realistiskt FIRE-scenario och skriv ut resultatet.

Användning:
    python3 demo_cli.py
"""

from bridge_sim import (
    Account, AccountType, Plan, Pension, PensionType,
    simulate_plan, bridge_required,
)


def make_demo_plan() -> Plan:
    """En typisk svensk FIRE-aspirerande tech-konsult, 35 år, vill FIRE vid 50."""
    return Plan(
        current_age=35,
        retirement_age=50,
        livslangd=90,
        income_need_per_month_real=35_000,
        monthly_savings_real=20_000,
        accounts=[
            Account(
                type=AccountType.ISK,
                name="ISK Avanza",
                balance=1_500_000,
                expected_real_return=0.05,
            ),
            Account(
                type=AccountType.KF,
                name="KF Nordnet",
                balance=400_000,
                avtals_avgift=0.0015,
                expected_real_return=0.05,
            ),
            Account(
                type=AccountType.DEPA,
                name="Aktiedepå",
                balance=200_000,
                expected_real_return=0.05,
            ),
        ],
        pensions=[
            Pension(
                type=PensionType.TJP,
                name="ITP1 Alecta",
                pott_idag=450_000,
                start_alder=65,
                period_ar=20,
            ),
            Pension(
                type=PensionType.ALLMAN,
                name="Allmän pension",
                start_alder=65,
                arlig_utbetalning_idag=240_000,  # 20k/mån i dagens penningvärde
            ),
        ],
    )


def fmt(n: float) -> str:
    """Format svensk: 1 234 567 kr."""
    return f"{n:,.0f}".replace(",", " ") + " kr"


def print_plan_summary(plan: Plan):
    total_today = sum(a.balance for a in plan.accounts)
    print("=" * 70)
    print(f"  LUGN — Pensions-brygga & FIRE-simulering")
    print("=" * 70)
    print()
    print(f"  Ålder idag:                 {plan.current_age}")
    print(f"  Mål-ålder pension:          {plan.retirement_age}")
    print(f"  Antal år till pension:      {plan.retirement_age - plan.current_age}")
    print(f"  Behov per månad (idag):     {fmt(plan.income_need_per_month_real)}")
    print(f"  Sparar per månad (idag):    {fmt(plan.monthly_savings_real)}")
    print(f"  Total portfölj idag:        {fmt(total_today)}")
    print()
    print("  Konton:")
    for a in plan.accounts:
        print(f"    [{a.type.value:5}] {a.name:25} {fmt(a.balance):>15}")
    print()
    print("  Pensioner:")
    for p in plan.pensions:
        if p.type == PensionType.ALLMAN:
            print(f"    [{p.type.value:6}] {p.name:25}  "
                  f"{fmt(p.arlig_utbetalning_idag)}/år från {p.start_alder}")
        else:
            print(f"    [{p.type.value:6}] {p.name:25}  "
                  f"pott {fmt(p.pott_idag)}, start {p.start_alder}, "
                  f"period {p.period_ar} år")
    print()


def print_bridge_analysis(plan: Plan):
    bridge = bridge_required(plan)
    print("-" * 70)
    print("  PENSIONS-BRYGGA — vad krävs?")
    print("-" * 70)
    print()
    print(f"  Total behov från {plan.retirement_age} till {plan.livslangd} år (nominellt):")
    print(f"      {fmt(bridge['total_need_nominell'])}")
    print(f"  Pensioner täcker (brutto):  {fmt(bridge['pension_brutto_total'])}")
    print(f"  Pensioner täcker (netto):   {fmt(bridge['pension_netto_total'])}")
    print()
    print(f"  >>> BRIDGE-POTT BEHÖVS:")
    print(f"      Nominellt:           {fmt(bridge['bridge_needed_nominell'])}")
    print(f"      I dagens penningvärde: {fmt(bridge['bridge_needed_real_idag'])}")
    print()


def print_year_flows(plan: Plan):
    flows = simulate_plan(plan)
    print("-" * 70)
    print("  ÅR-FÖR-ÅR FLÖDE (urval)")
    print("-" * 70)
    print()
    print(f"  {'Ålder':<7} {'Brutto':>12} {'Skatt':>10} {'Netto':>12} "
          f"{'Behov':>12} {'+/−':>12} {'Pensioner':<20}")
    print("  " + "-" * 90)

    # Visa: alla år ±2 runt retirement_age, alla år där pension börjar, livslängd
    pension_starts = sorted({p.start_alder for p in plan.pensions})
    interesting = set()
    interesting.update(range(plan.retirement_age - 2, plan.retirement_age + 3))
    for s in pension_starts:
        interesting.update(range(s - 1, s + 2))
    interesting.update([plan.livslangd - 5, plan.livslangd])

    for f in flows:
        if f.age in interesting or f.age % 10 == 0:
            pens = ", ".join(f.pensions_active) if f.pensions_active else "—"
            marker = " <<<" if f.age == plan.retirement_age else ""
            print(f"  {f.age:<7} "
                  f"{fmt(f.income_gross):>12} "
                  f"{fmt(f.tax):>10} "
                  f"{fmt(f.income_net):>12} "
                  f"{fmt(f.need):>12} "
                  f"{fmt(f.surplus_or_deficit):>12} "
                  f"{pens:<20}{marker}")
            for n in f.notes:
                print(f"           ⚠  {n}")


def print_final_state(plan: Plan):
    flows = simulate_plan(plan)
    final = flows[-1]
    print()
    print("-" * 70)
    print(f"  SLUTKAPITAL vid {plan.livslangd} år")
    print("-" * 70)
    total = sum(final.account_balances.values())
    print(f"  Totalt kvar: {fmt(total)}  (nominellt)")
    for name, bal in final.account_balances.items():
        print(f"      {name:<25} {fmt(bal):>15}")
    print()


def main():
    plan = make_demo_plan()
    print_plan_summary(plan)
    print_bridge_analysis(plan)
    print_year_flows(plan)
    print_final_state(plan)
    print("=" * 70)
    print()
    print("  Tips: ändra parametrarna i make_demo_plan() i demo_cli.py.")
    print("  Detta är en deterministisk simulering. Monte Carlo kommer i V2.")
    print()


if __name__ == "__main__":
    main()
