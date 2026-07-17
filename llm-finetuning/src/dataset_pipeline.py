from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
DEFAULT_SEED = ROOT / "data" / "seed_scenarios.json"
DEFAULT_CONTRACT = PROJECT_ROOT / "backend" / "src" / "policy" / "legal-llm-contract.json"
DEFAULT_OUTPUT = ROOT / "artifacts" / "dataset"

SPLITS = {"train", "validation", "test"}
ALLOWED_TOOL_NAMES = {
    "get_regulation_clause",
    "get_project_guarantee_status",
    "submit_findings",
}
FINDING_STATUSES = {"PASS", "CONDITIONAL_PASS", "VIOLATION", "BLOCKED", "FAIL"}
FINDING_SEVERITIES = {"INFO", "CONDITION", "WARNING", "BLOCKER"}
FINDING_GATES = {
    "APPROVAL",
    "CONTRACT_SIGNING",
    "DISBURSEMENT",
    "EXTERNAL_DATA_CALL",
    "NONE",
}
PII_PATTERNS = {
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    "vietnam_phone": re.compile(r"(?<!\d)0(?:3|5|7|8|9)\d{8}(?!\d)"),
    "citizen_id": re.compile(r"(?<!\d)\d{12}(?!\d)"),
}


class DatasetValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ValidationSummary:
    dataset_id: str
    scenario_count: int
    split_counts: dict[str, int]
    demo_only: bool
    warnings: tuple[str, ...]


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise DatasetValidationError(f"{path} must contain a JSON object.")
    return value


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _find_pii(value: Any) -> list[str]:
    text = _canonical_json(value)
    return [name for name, pattern in PII_PATTERNS.items() if pattern.search(text)]


def _validate_finding(finding: Any, allowed_rule_ids: set[str], scenario_id: str) -> None:
    if not isinstance(finding, dict):
        raise DatasetValidationError(f"{scenario_id}: every finding must be an object.")
    required = {
        "decisionId",
        "status",
        "severity",
        "blocksAt",
        "finding",
        "evidence",
        "ruleIds",
        "citations",
        "requiredFix",
    }
    if set(finding) != required:
        raise DatasetValidationError(
            f"{scenario_id}: finding fields must exactly match {sorted(required)}."
        )
    if not str(finding["decisionId"]).startswith("dec-legal-"):
        raise DatasetValidationError(f"{scenario_id}: decisionId must start with dec-legal-.")
    if finding["status"] not in FINDING_STATUSES:
        raise DatasetValidationError(f"{scenario_id}: invalid finding status.")
    if finding["severity"] not in FINDING_SEVERITIES:
        raise DatasetValidationError(f"{scenario_id}: invalid finding severity.")
    if finding["blocksAt"] not in FINDING_GATES:
        raise DatasetValidationError(f"{scenario_id}: invalid finding gate.")
    if not isinstance(finding["finding"], str) or not finding["finding"].strip():
        raise DatasetValidationError(f"{scenario_id}: finding explanation is required.")
    evidence = finding["evidence"]
    if not isinstance(evidence, dict) or not isinstance(evidence.get("summary"), str):
        raise DatasetValidationError(f"{scenario_id}: evidence.summary is required.")
    rule_ids = finding["ruleIds"]
    if not isinstance(rule_ids, list) or not rule_ids or any(rule not in allowed_rule_ids for rule in rule_ids):
        raise DatasetValidationError(f"{scenario_id}: finding contains an unsupported rule ID.")
    if finding["citations"] != []:
        raise DatasetValidationError(
            f"{scenario_id}: citations must be empty; runtime Citation Governance owns citations."
        )
    if finding["requiredFix"] is not None and not isinstance(finding["requiredFix"], str):
        raise DatasetValidationError(f"{scenario_id}: requiredFix must be a string or null.")


def validate_seed(
    seed_path: Path = DEFAULT_SEED,
    contract_path: Path = DEFAULT_CONTRACT,
    *,
    require_approved: bool = False,
) -> ValidationSummary:
    seed = _read_json(seed_path)
    contract = _read_json(contract_path)
    dataset_id = seed.get("datasetId")
    if not isinstance(dataset_id, str) or not dataset_id:
        raise DatasetValidationError("datasetId is required.")

    governance = seed.get("governance")
    if not isinstance(governance, dict):
        raise DatasetValidationError("governance metadata is required.")
    review_status = governance.get("reviewStatus")
    if review_status not in {"NEEDS_REVIEW", "APPROVED"}:
        raise DatasetValidationError("governance.reviewStatus must be NEEDS_REVIEW or APPROVED.")
    if governance.get("dataClassification") != "SYNTHETIC_NO_CUSTOMER_DATA":
        raise DatasetValidationError("Only synthetic, non-customer seed data is accepted.")
    if governance.get("reviewerRole") != "LEGAL_POLICY_OWNER":
        raise DatasetValidationError("governance.reviewerRole must be LEGAL_POLICY_OWNER.")
    if require_approved and review_status != "APPROVED":
        raise DatasetValidationError(
            "Production training is blocked: a LEGAL_POLICY_OWNER must approve the dataset."
        )
    if review_status == "APPROVED":
        for field in ("reviewerId", "reviewedAt", "approvalTicket"):
            if not governance.get(field):
                raise DatasetValidationError(f"Approved data requires governance.{field}.")

    allowed_rule_ids = set(contract.get("allowedRuleIds", []))
    allowed_clause_ids = set(contract.get("allowedClauseIds", []))
    if not allowed_rule_ids or not allowed_clause_ids or not contract.get("systemPrompt"):
        raise DatasetValidationError("The legal LLM contract is incomplete.")

    scenarios = seed.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise DatasetValidationError("At least one scenario is required.")

    ids: set[str] = set()
    family_splits: dict[str, str] = {}
    content_splits: dict[str, str] = {}
    split_counts = {split: 0 for split in sorted(SPLITS)}

    for scenario in scenarios:
        if not isinstance(scenario, dict):
            raise DatasetValidationError("Every scenario must be an object.")
        scenario_id = scenario.get("id")
        case_family = scenario.get("caseFamily")
        split = scenario.get("split")
        if not isinstance(scenario_id, str) or not scenario_id:
            raise DatasetValidationError("Every scenario requires an id.")
        if scenario_id in ids:
            raise DatasetValidationError(f"Duplicate scenario id: {scenario_id}.")
        ids.add(scenario_id)
        pii_hits = _find_pii(scenario)
        if pii_hits:
            raise DatasetValidationError(f"{scenario_id}: possible PII detected: {', '.join(pii_hits)}.")
        if not isinstance(case_family, str) or not case_family:
            raise DatasetValidationError(f"{scenario_id}: caseFamily is required.")
        if split not in SPLITS:
            raise DatasetValidationError(f"{scenario_id}: split must be train, validation, or test.")
        previous_split = family_splits.setdefault(case_family, split)
        if previous_split != split:
            raise DatasetValidationError(
                f"{scenario_id}: caseFamily {case_family} leaks across dataset splits."
            )
        split_counts[split] += 1

        input_value = scenario.get("input")
        expected_input_keys = {
            "maritalStatus",
            "hasInsuranceTyingSignal",
            "propertyStatus",
            "projectCode",
            "consent",
            "maritalSignatureWarning",
        }
        if not isinstance(input_value, dict) or set(input_value) != expected_input_keys:
            raise DatasetValidationError(f"{scenario_id}: input does not match the runtime contract.")
        content_hash = _sha256_text(_canonical_json(input_value))
        content_split = content_splits.setdefault(content_hash, split)
        if content_split != split:
            raise DatasetValidationError(f"{scenario_id}: identical input leaks across dataset splits.")

        steps = scenario.get("toolSteps")
        if not isinstance(steps, list):
            raise DatasetValidationError(f"{scenario_id}: toolSteps must be a list.")
        for step in steps:
            if not isinstance(step, dict) or set(step) != {"name", "arguments", "output"}:
                raise DatasetValidationError(f"{scenario_id}: invalid tool step.")
            if step["name"] not in ALLOWED_TOOL_NAMES - {"submit_findings"}:
                raise DatasetValidationError(f"{scenario_id}: unsupported lookup tool {step['name']}.")
            if step["name"] == "get_regulation_clause" and step["arguments"].get("clauseId") not in allowed_clause_ids:
                raise DatasetValidationError(f"{scenario_id}: clauseId is outside the allow-list.")

        findings = scenario.get("findings")
        if not isinstance(findings, list):
            raise DatasetValidationError(f"{scenario_id}: findings must be a list.")
        for finding in findings:
            _validate_finding(finding, allowed_rule_ids, scenario_id)
        expected_rules = sorted({rule for finding in findings for rule in finding["ruleIds"]})
        if sorted(scenario.get("expectedRuleIds", [])) != expected_rules:
            raise DatasetValidationError(f"{scenario_id}: expectedRuleIds does not match findings.")

    if any(count == 0 for count in split_counts.values()):
        raise DatasetValidationError("train, validation, and test splits must all be non-empty.")

    warnings: list[str] = []
    if review_status != "APPROVED":
        warnings.append("Dataset is DEMO_ONLY and cannot be used by the production training command.")
    if len(scenarios) < 100:
        warnings.append("Seed set has fewer than 100 scenarios; expand it before a production experiment.")
    return ValidationSummary(
        dataset_id=dataset_id,
        scenario_count=len(scenarios),
        split_counts=split_counts,
        demo_only=review_status != "APPROVED",
        warnings=tuple(warnings),
    )


def build_tools(contract: dict[str, Any]) -> list[dict[str, Any]]:
    finding_schema = {
        "type": "object",
        "properties": {
            "decisionId": {"type": "string"},
            "status": {"type": "string", "enum": sorted(FINDING_STATUSES)},
            "severity": {"type": "string", "enum": sorted(FINDING_SEVERITIES)},
            "blocksAt": {"type": "string", "enum": sorted(FINDING_GATES)},
            "finding": {"type": "string"},
            "evidence": {
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
                "additionalProperties": False,
            },
            "ruleIds": {"type": "array", "items": {"type": "string", "enum": contract["allowedRuleIds"]}},
            "citations": {"type": "array", "maxItems": 0},
            "requiredFix": {"type": ["string", "null"]},
        },
        "required": [
            "decisionId",
            "status",
            "severity",
            "blocksAt",
            "finding",
            "evidence",
            "ruleIds",
            "citations",
            "requiredFix",
        ],
        "additionalProperties": False,
    }
    return [
        {
            "type": "function",
            "function": {
                "name": "get_regulation_clause",
                "description": "Retrieve an approved regulation clause from the policy graph.",
                "parameters": {
                    "type": "object",
                    "properties": {"clauseId": {"type": "string", "enum": contract["allowedClauseIds"]}},
                    "required": ["clauseId"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_project_guarantee_status",
                "description": "Retrieve the guarantee evidence for a future-property project.",
                "parameters": {
                    "type": "object",
                    "properties": {"projectCode": {"type": "string"}},
                    "required": ["projectCode"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "submit_findings",
                "description": "Submit the final structured legal findings.",
                "parameters": {
                    "type": "object",
                    "properties": {"findings": {"type": "array", "items": finding_schema}},
                    "required": ["findings"],
                    "additionalProperties": False,
                },
            },
        },
    ]


def _tool_call(name: str, arguments: dict[str, Any], call_id: str) -> dict[str, Any]:
    return {
        "role": "assistant",
        "tool_calls": [
            {
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": arguments},
            }
        ],
    }


def build_records(
    seed_path: Path = DEFAULT_SEED,
    contract_path: Path = DEFAULT_CONTRACT,
    *,
    require_approved: bool = False,
) -> tuple[ValidationSummary, dict[str, list[dict[str, Any]]]]:
    summary = validate_seed(seed_path, contract_path, require_approved=require_approved)
    seed = _read_json(seed_path)
    contract = _read_json(contract_path)
    tools = build_tools(contract)
    records = {split: [] for split in SPLITS}

    for scenario in seed["scenarios"]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": contract["systemPrompt"]},
            {
                "role": "user",
                "content": "Dữ liệu hồ sơ cần soát xét (JSON):\n" + json.dumps(
                    scenario["input"], ensure_ascii=False, sort_keys=True
                ),
            },
        ]
        fixtures: list[dict[str, Any]] = []
        for index, step in enumerate(scenario["toolSteps"]):
            call_id = f"call-{scenario['id']}-{index + 1}"
            messages.append(_tool_call(step["name"], step["arguments"], call_id))
            messages.append(
                {
                    "role": "tool",
                    "name": step["name"],
                    "tool_call_id": call_id,
                    "content": _canonical_json(step["output"]),
                }
            )
            fixtures.append(step)
        final_call_id = f"call-{scenario['id']}-submit"
        messages.append(_tool_call("submit_findings", {"findings": scenario["findings"]}, final_call_id))
        expected_tools = [step["name"] for step in scenario["toolSteps"]] + ["submit_findings"]
        records[scenario["split"]].append(
            {
                "id": scenario["id"],
                "case_family": scenario["caseFamily"],
                "messages": messages,
                "tools": tools,
                "tool_fixtures": fixtures,
                "labels": {
                    "expected_rule_ids": sorted(scenario["expectedRuleIds"]),
                    "required_tool_calls": expected_tools,
                    "expected_findings": [
                        {
                            "ruleIds": finding["ruleIds"],
                            "status": finding["status"],
                            "severity": finding["severity"],
                            "blocksAt": finding["blocksAt"],
                        }
                        for finding in scenario["findings"]
                    ],
                },
                "governance": {
                    "dataset_id": seed["datasetId"],
                    "contract_id": contract["contractId"],
                    "contract_version": contract["version"],
                    "review_status": seed["governance"]["reviewStatus"],
                    "demo_only": summary.demo_only,
                    "raw_cot_included": False,
                },
            }
        )
    return summary, records


def write_records(
    records: dict[str, Iterable[dict[str, Any]]],
    output_dir: Path,
    summary: ValidationSummary,
    contract_path: Path = DEFAULT_CONTRACT,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    hashes: dict[str, str] = {}
    for split in sorted(SPLITS):
        target = output_dir / f"{split}.jsonl"
        items = list(records[split])
        with target.open("w", encoding="utf-8", newline="\n") as handle:
            for item in items:
                handle.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
        counts[split] = len(items)
        hashes[split] = hashlib.sha256(target.read_bytes()).hexdigest()
    contract_hash = hashlib.sha256(contract_path.read_bytes()).hexdigest()
    manifest = {
        "dataset_id": summary.dataset_id,
        "demo_only": summary.demo_only,
        "scenario_count": summary.scenario_count,
        "split_counts": counts,
        "sha256": hashes,
        "contract_sha256": contract_hash,
        "warnings": list(summary.warnings),
    }
    with (output_dir / "manifest.json").open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
