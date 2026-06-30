import unittest

from vesta_bioclimatic.psychrometrics import (
    absolute_humidity_g_m3,
    dew_point_c,
    relative_humidity_from_absolute,
)


class PsychrometricsTest(unittest.TestCase):
    def test_absolute_humidity_round_trip(self):
        ah = absolute_humidity_g_m3(22.0, 50.0)
        self.assertGreater(ah, 9.0)
        self.assertLess(ah, 10.5)
        rh = relative_humidity_from_absolute(22.0, ah)
        self.assertAlmostEqual(rh, 50.0, delta=0.2)

    def test_dew_point_common_range(self):
        self.assertAlmostEqual(dew_point_c(20.0, 50.0), 9.3, delta=0.8)


if __name__ == "__main__":
    unittest.main()
