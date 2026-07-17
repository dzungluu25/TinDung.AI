from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from src.dataset_pipeline import (
    DEFAULT_CONTRACT,
    DEFAULT_SEED,
    DatasetValidationError,
    build_records,
    validate_seed,
    write_records,
)
from src.evaluate_openai_compatible import score_submission
from src.promote import promotion_reasons


class DatasetPipelineTests(unittest.TestCase):
    def test_seed_is_valid_but_demo_only(self) -> None:
        summary = validate_seed()
        self.assertEqual(summary.scenario_count, 12)
        self.assertEqual(summary.split_counts, {"test": 4, "train": 6, "validation": 2})
        self.assertTrue(summary.demo_only)

    def test_production_build_requires_legal_owner_approval(self) -> None:
        with self.assertRaisesRegex(DatasetValidationError, "LEGAL_POLICY_OWNER"):
            validate_seed(require_approved=True)

    def test_records_use_tools_without_cot_or_model_citations(self) -> None:
        _, records = build_records()
        for record in [item for split in records.values() for item in split]:
            for message in record["messages"]:
                self.assertNotEqual(message.get("role"), "analysis")
                self.assertNotIn("thinking", message)
            submit = record["messages"][-1]["tool_calls"][0]["function"]
            self.assertEqual(submit["name"], "submit_findings")
            for finding in submit["arguments"]["findings"]:
                self.assertEqual(finding["citations"], [])

    def test_written_manifest_has_hashes(self) -> None:
        summary, records = build_records()
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir)
            write_records(records, target, summary)
            manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
            self.assertTrue(manifest["demo_only"])
            self.assertEqual(set(manifest["sha256"]), {"train", "validation", "test"})
            self.assertTrue(all(len(value) == 64 for value in manifest["sha256"].values()))

    def test_pii_is_rejected(self) -> None:
        seed = json.loads(DEFAULT_SEED.read_text(encoding="utf-8"))
        seed["scenarios"][0]["input"]["projectCode"] = "0912345678"
        with tempfile.TemporaryDirectory() as temp_dir:
            seed_path = Path(temp_dir) / "seed.json"
            seed_path.write_text(json.dumps(seed, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(DatasetValidationError, "PII"):
                validate_seed(seed_path, DEFAULT_CONTRACT)


class EvaluationTests(unittest.TestCase):
    def test_valid_submission_scores_all_safety_checks(self) -> None:
        _, records = build_records()
        record = records["test"][0]
        submit = record["messages"][-1]["tool_calls"][0]["function"]
        result = score_submission(
            submit["arguments"]["findings"],
            record["labels"]["required_tool_calls"],
            record["labels"],
            set(json.loads(DEFAULT_CONTRACT.read_text(encoding="utf-8"))["allowedRuleIds"]),
        )
        self.assertTrue(result["schema_valid"])
        self.assertTrue(result["rule_exact"])
        self.assertTrue(result["finding_contract_exact"])
        self.assertTrue(result["citation_safe"])
        self.assertTrue(result["pii_safe"])
        self.assertEqual(result["required_tool_recall"], 1.0)

    def test_model_citation_is_rejected(self) -> None:
        _, records = build_records()
        record = records["test"][0]
        findings = json.loads(json.dumps(record["messages"][-1]["tool_calls"][0]["function"]["arguments"]["findings"]))
        findings[0]["citations"] = ["model invented citation"]
        result = score_submission(
            findings,
            record["labels"]["required_tool_calls"],
            record["labels"],
            set(json.loads(DEFAULT_CONTRACT.read_text(encoding="utf-8"))["allowedRuleIds"]),
        )
        self.assertFalse(result["schema_valid"])
        self.assertFalse(result["citation_safe"])

    def test_small_eval_cannot_be_promoted(self) -> None:
        metrics = {
            "completed": 1.0,
            "schema_valid": 1.0,
            "rule_exact": 1.0,
            "finding_contract_exact": 1.0,
            "required_tool_recall": 1.0,
            "citation_safe": 1.0,
            "pii_safe": 1.0,
            "unknown_tool_count": 0,
        }
        reasons = promotion_reasons(
            {"case_count": 4, "metrics": metrics},
            {"case_count": 4, "metrics": metrics},
        )
        self.assertIn("evaluation has fewer than 100 holdout cases", reasons)


if __name__ == "__main__":
    unittest.main()
