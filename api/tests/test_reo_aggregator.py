import unittest

from services.reo_aggregator import collect_all_sources
from services.sources.base import BaseSource, SourceResult


class FakeSourceA(BaseSource):
    name = "source_a"

    async def collect(self) -> SourceResult:
        return SourceResult(
            source=self.name,
            data=[
                {
                    "source": self.name,
                    "listings_count": 3,
                    "top_banks": {"Wells Fargo": 2},
                    "properties": [
                        {
                            "source": self.name,
                            "address": "101 Main St",
                            "city": "Houston",
                            "state": "TX",
                            "price": 250000,
                            "status": "foreclosure",
                            "url": "https://example.com/a/1",
                        },
                        {
                            "source": self.name,
                            "address": "102 Main St",
                            "city": "Houston",
                            "state": "TX",
                            "price": 275000,
                            "status": "foreclosure",
                            "url": "https://example.com/a/2",
                        },
                    ],
                }
            ],
            success=True,
        )


class FakeSourceB(BaseSource):
    name = "source_b"

    async def collect(self) -> SourceResult:
        return SourceResult(
            source=self.name,
            data=[
                {
                    "source": self.name,
                    "listings_count": 2,
                    "top_banks": {"Chase": 1},
                    "properties": [
                        {
                            "source": self.name,
                            "address": "101 Main St",
                            "city": "Houston",
                            "state": "TX",
                            "price": 250000,
                            "status": "foreclosure",
                            "url": "https://example.com/b/1",
                        },
                        {
                            "source": self.name,
                            "address": "50 Bay St",
                            "city": "Miami",
                            "state": "FL",
                            "price": 390000,
                            "status": "auction",
                            "url": "https://example.com/b/2",
                        },
                    ],
                }
            ],
            success=True,
        )


class ReoAggregatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_collect_all_sources_merges_and_dedupes(self):
        merged = await collect_all_sources(sources=[FakeSourceA(), FakeSourceB()])

        self.assertEqual(merged["total_listings"], 5)
        self.assertIn("source_a", merged["by_source"])
        self.assertIn("source_b", merged["by_source"])

        merged_dataset = merged["merged_dataset"]
        self.assertEqual(merged_dataset["listings_count"], 3)

        top_states = merged["top_states"]
        self.assertEqual(top_states.get("TX"), 2)
        self.assertEqual(top_states.get("FL"), 1)

        top_banks = merged["top_banks"]
        self.assertGreaterEqual(top_banks.get("Wells Fargo", 0), 2)
        self.assertGreaterEqual(top_banks.get("Chase", 0), 1)


if __name__ == "__main__":
    unittest.main()
