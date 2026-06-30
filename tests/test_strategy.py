import json
import unittest
from pathlib import Path

from vesta_bioclimatic.models import HouseSnapshot
from vesta_bioclimatic.strategy import assess_house


class StrategyTest(unittest.TestCase):
    def test_sample_snapshot_produces_actions(self):
        payload = json.loads(Path("examples/sample_snapshot.json").read_text(encoding="utf-8"))
        result = assess_house(HouseSnapshot.from_dict(payload))
        self.assertGreater(result.global_score, 70)
        self.assertIn("chambre", result.primary_action)
        self.assertTrue(result.recommendations)
        self.assertTrue(any(command.domain in {"fan", "cover"} for command in result.commands))


if __name__ == "__main__":
    unittest.main()
