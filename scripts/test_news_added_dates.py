"""Regression checks for first-addition provenance and refresh ordering."""
import copy
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import collect_genesis_news as c

class FrozenClock(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 11, 25, 2, 15, tzinfo=timezone.utc)

class AddedDates(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "news.json"
        self.path_patch = patch.object(c, "ARCHIVE", self.path)
        self.clock_patch = patch.object(c, "datetime", FrozenClock)
        self.path_patch.start()
        self.clock_patch.start()

    def tearDown(self):
        self.clock_patch.stop()
        self.path_patch.stop()
        self.tmp.cleanup()

    def save(self, items):
        self.path.write_text(json.dumps({"items": items, "sources": []}))

    def rows(self):
        return json.loads(self.path.read_text())["items"]

    def test_new_old_source_is_added_today_in_new_york_and_sorted_first(self):
        self.save([{"url": "https://www.anl.gov/article/previous",
                    "title": "Previous", "date": "2026-11-23",
                    "source_published_at": "2026-11-23",
                    "gih_added_at": "2026-11-23T16:00:00Z",
                    "gih_added_date": "2026-11-23"}])
        c.merge("labs", [{"url": "https://www.anl.gov/article/new",
                         "title": "New addition", "date": "2026-11-05"}], [])
        new = self.rows()[0]
        self.assertTrue(new["url"].endswith("/new"))
        self.assertEqual(new["date"], "2026-11-24")
        self.assertEqual(new["gih_added_date"], "2026-11-24")
        self.assertEqual(new["source_published_at"], "2026-11-05")
        self.assertEqual(new["gih_added_at"], "2026-11-25T02:15:00+00:00")

    def test_refresh_and_fragment_duplicate_preserve_unreviewed_provenance(self):
        original = {"url": "https://www.anl.gov/article/a", "title": "Original",
                    "date": "2026-11-10", "gih_added_at": "2026-11-10T13:37:21Z",
                    "gih_added_date": "2026-11-10", "source_published_at": "2026-11-04"}
        self.save([original])
        incoming = {"url": original["url"] + "#section", "title": "Updated", "date": "2026-11-25"}
        c.merge("labs", [incoming], [])
        self.assertEqual(len(self.rows()), 1)
        for field in ("date", "gih_added_at", "gih_added_date", "source_published_at"):
            self.assertEqual(self.rows()[0][field], original[field])

    def test_reviewed_content_and_approval_survive_refresh(self):
        original = {"url": "https://www.anl.gov/article/a", "title": "Reviewed",
                    "classification": "confirmed Genesis", "editorial_status": "approved",
                    "date": "2026-11-10", "gih_added_at": "2026-11-10T13:37:21Z",
                    "gih_added_date": "2026-11-10", "source_published_at": "2026-11-04"}
        self.save([original])
        c.merge("labs", [{"url": original["url"], "title": "Fetched", "date": "2026-11-25"}], [])
        self.assertEqual(self.rows()[0]["title"], "Reviewed")
        self.assertEqual(self.rows()[0]["editorial_status"], "approved")
        self.assertEqual(self.rows()[0]["source_published_at"], "2026-11-04")

    def test_unknown_legacy_addition_is_not_fabricated_on_refresh(self):
        self.save([{"url": "https://www.anl.gov/article/legacy", "title": "Legacy", "date": "2026-11-04"}])
        c.merge("labs", [{"url": "https://www.anl.gov/article/legacy", "title": "Legacy", "date": "2026-11-04"}], [])
        self.assertNotIn("gih_added_at", self.rows()[0])
        self.assertEqual(self.rows()[0]["source_published_at"], "2026-11-04")

    def test_second_identical_refresh_does_not_rewrite_or_bump(self):
        self.save([])
        incoming = {"url": "https://www.anl.gov/article/a", "title": "A", "date": "2026-11-04"}
        c.merge("labs", [copy.deepcopy(incoming)], [])
        before = self.path.read_text()
        self.assertFalse(c.merge("labs", [copy.deepcopy(incoming)], []))
        self.assertEqual(self.path.read_text(), before)

if __name__ == "__main__":
    unittest.main()
