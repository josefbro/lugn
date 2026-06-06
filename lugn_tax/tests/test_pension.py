"""Tester för pensions-konstanter."""

import unittest

from lugn_tax import laga_uttagsalder, riktalder, pgi_tak
from lugn_tax import ab_pension_max_avdrag


class TestPension(unittest.TestCase):

    def test_riktalder_2026(self):
        self.assertEqual(riktalder(), 67)

    def test_laga_uttagsalder_allman_2026(self):
        # Riktåldern − 3 = 64
        self.assertEqual(laga_uttagsalder("allman"), 64)

    def test_laga_uttagsalder_garanti(self):
        # = riktåldern
        self.assertEqual(laga_uttagsalder("garanti"), 67)

    def test_laga_uttagsalder_tjanstepension(self):
        self.assertEqual(laga_uttagsalder("tjanstepension"), 55)

    def test_pgi_tak_2026(self):
        # 8.07 × 80 600 ≈ 650 442
        self.assertAlmostEqual(pgi_tak(), 650_442, delta=10)

    def test_ab_pension_avdrag_under_tak(self):
        # 1 MSEK lön × 35% = 350 000 (under taket 592k)
        self.assertEqual(ab_pension_max_avdrag(1_000_000), 350_000)

    def test_ab_pension_avdrag_over_tak(self):
        # 2 MSEK lön × 35% = 700 000 → kappas till 592 000
        self.assertEqual(ab_pension_max_avdrag(2_000_000), 592_000)


if __name__ == "__main__":
    unittest.main()
