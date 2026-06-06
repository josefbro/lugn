"""Tester för K10 — verifierar nya 2026-regler."""

import unittest

from lugn_tax import k10_grans_belopp, k10_utdelningsskatt, C2026


class TestK10(unittest.TestCase):

    def test_grundbelopp_solo_agare(self):
        # 100% ägare, ingen lön — bara grundbelopp = 4 IBB = 322 400 kr
        result = k10_grans_belopp(
            andel_av_aktier=1.0,
            egen_lon=0,
            totalt_loneunderlag=0,
        )
        self.assertEqual(result["grundbelopp"], 322_400)
        self.assertEqual(result["lonebaserat_utrymme"], 0)
        self.assertEqual(result["totalt"], 322_400)

    def test_grundbelopp_50_procent(self):
        # 50% ägare → halv andel av grundbelopp
        result = k10_grans_belopp(
            andel_av_aktier=0.5,
            egen_lon=0,
            totalt_loneunderlag=0,
        )
        self.assertEqual(result["grundbelopp"], 161_200)

    def test_lonebaserat_utrymme_2026_nya_regler(self):
        # 100% ägare, 1.5 MSEK i löneunderlag (egen lön)
        # Lönebaserat = 50% × (1 500 000 − 644 800) = 427 600
        result = k10_grans_belopp(
            andel_av_aktier=1.0,
            egen_lon=1_500_000,
            totalt_loneunderlag=1_500_000,
        )
        self.assertEqual(result["lonebaserat_utrymme"], 427_600)
        # Totalt: grundbelopp 322 400 + lönebaserat 427 600 = 750 000
        self.assertEqual(result["totalt"], 750_000)

    def test_loneunderlag_under_avdragsgrans(self):
        # Liten lön — lönebaserat utrymme = 0
        result = k10_grans_belopp(
            andel_av_aktier=1.0,
            egen_lon=500_000,
            totalt_loneunderlag=500_000,
        )
        self.assertEqual(result["lonebaserat_utrymme"], 0)
        self.assertEqual(result["totalt"], 322_400)

    def test_sparat_utrymme_vaxer(self):
        # 100 000 kr sparat utrymme → växer med SLR+3pp = 9.66%
        result = k10_grans_belopp(
            andel_av_aktier=1.0,
            egen_lon=0,
            totalt_loneunderlag=0,
            sparat_utrymme_in=100_000,
        )
        self.assertAlmostEqual(result["sparat_utrymme"], 109_660, delta=10)

    def test_utdelningsskatt_inom_gransbelopp(self):
        # 200k utdelning, gränsbelopp 322 400 → all inom, 20% skatt
        result = k10_utdelningsskatt(200_000, grans_belopp=322_400)
        self.assertEqual(result["inom_gransbelopp"], 200_000)
        self.assertEqual(result["over_gransbelopp"], 0)
        self.assertEqual(result["skatt_inom"], 40_000)
        # Kvar i sparat utrymme för nästa år: 322 400 − 200 000 = 122 400
        self.assertEqual(result["nytt_sparat_utrymme"], 122_400)


if __name__ == "__main__":
    unittest.main()
