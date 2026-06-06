"""Tester för ISK-modulen — verifierar 2026 års formler."""

import unittest

from lugn_tax import isk_skatt, isk_schablonintakt, isk_kapitalbas, C2026


class TestISK(unittest.TestCase):

    def test_kapitalbas_jamna_kvartal(self):
        # Plat portfölj 1 MSEK hela året, inga insättningar
        kb = isk_kapitalbas(1_000_000, 1_000_000, 1_000_000, 1_000_000)
        self.assertEqual(kb, 1_000_000)

    def test_kapitalbas_med_insattning(self):
        # 1 MSEK med 100k insättning under året
        kb = isk_kapitalbas(900_000, 950_000, 1_000_000, 1_050_000,
                            insattningar=100_000)
        # (900+950+1000+1050+100) / 4 = 1000
        self.assertEqual(kb, 1_000_000)

    def test_schablonintakt_2026(self):
        # 1 MSEK × 3.55% = 35 500
        sch = isk_schablonintakt(1_000_000)
        self.assertAlmostEqual(sch, 35_500, delta=10)

    def test_skatt_under_grundavdrag_2026(self):
        # 200k är under 300k-grundavdraget → 0 kr skatt
        skatt = isk_skatt(200_000)
        self.assertEqual(skatt, 0.0)

    def test_skatt_strax_over_grundavdrag(self):
        # 400k → 100k beskattas × 1.065% = 1 065 kr
        skatt = isk_skatt(400_000)
        self.assertAlmostEqual(skatt, 1_065, delta=10)

    def test_skatt_stor_portfolj(self):
        # 5 MSEK → 4.7 MSEK beskattas × 1.065% ≈ 50 055 kr
        skatt = isk_skatt(5_000_000)
        self.assertAlmostEqual(skatt, 50_055, delta=50)

    def test_grundavdrag_fordelas_med_kf(self):
        # 200k ISK + 200k KF = 400k totalt
        # Grundavdrag 300k delas 50/50 → 150k var
        # ISK beskattningsbar = 200 − 150 = 50k × 1.065% = 533 kr
        skatt = isk_skatt(200_000, annan_kf_kapitalbas=200_000)
        self.assertAlmostEqual(skatt, 50_000 * C2026.isk_effektiv_skatt,
                               delta=10)


if __name__ == "__main__":
    unittest.main()
