from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .dataset_pipeline import (
    ALLOWED_TOOL_NAMES,
    DEFAULT_CONTRACT,
    DEFAULT_OUTPUT,
    DatasetValidationError,
    _find_pii,
    _read_json,
    _validate_finding,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_DIR = ROOT / "artifacts" / "eval"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number} must be an object.")
            rows.append(value)
    return rows


def _arguments(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise ValueError("Tool arguments must be a JSON object.")
    return value


def _finding_contract(findings: list[dict[str, Any]]) -> list[tuple[tuple[str, ...], str, str, str]]:
    return sorted(
        (
            tuple(sorted(str(rule) for rule in finding.get("ruleIds", []))),
            str(finding.get("status")),
            str(finding.get("severity")),
            str(finding.get("blocksAt")),
        )
        for finding in findings
    )


def score_submission(
    findings: Any,
    called_tools: list[str],
    labels: dict[str, Any],
    allowed_rule_ids: set[str],
) -> dict[str, Any]:
    schema_valid = isinstance(findings, list)
    if schema_valid:
        try:
            for finding in findings:
                _validate_finding(finding, allowed_rule_ids, "evaluation")
        except DatasetValidationError:
            schema_valid = False

    actual_findings = findings if isinstance(findings, list) else []
    actual_rules = sorted(
        {str(rule) for finding in actual_findings if isinstance(finding, dict) for rule in finding.get("ruleIds", [])}
    )
    expected_rules = sorted(str(rule) for rule in labels.get("expected_rule_ids", []))
    expected_contract = _finding_contract(labels.get("expected_findings", []))
    actual_contract = _finding_contract([f for f in actual_findings if isinstance(f, dict)])
    required_tools = list(labels.get("required_tool_calls", []))
    required_tool_recall = (
        sum(1 for tool in required_tools if tool in called_tools) / len(required_tools)
        if required_tools
        else 1.0
    )
    unknown_tools = [tool for tool in called_tools if tool not in ALLOWED_TOOL_NAMES]
    citation_safe = all(
        isinstance(finding, dict) and finding.get("citations") == [] for finding in actual_findings
    )
    pii_safe = not _find_pii(actual_findings)
    return {
        "completed": isinstance(findings, list),
        "schema_valid": schema_valid,
        "rule_exact": actual_rules == expected_rules,
        "finding_contract_exact": actual_contract == expected_contract,
        "required_tool_recall": required_tool_recall,
        "unknown_tool_count": len(unknown_tools),
        "citation_safe": citation_safe,
        "pii_safe": pii_safe,
    }


class OpenAICompatibleEvaluator:
    def __init__(self, base_url: str, api_key: str, model: str, timeout_seconds: int = 120):
        self.endpoint = base_url.rstrip("/") + "/chat/completions"
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def _complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        payload = json.dumps(
            {"model": self.model, "messages": messages, "tools": tools, "tool_choice": "auto"},
            ensure_ascii=False,
        ).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json; charset=utf-8",
            },
        )
        with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
        return body["choices"][0]["message"]

    @staticmethod
    def _fixture(record: dict[str, Any], name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        for fixture in record.get("tool_fixtures", []):
            if fixture.get("name") == name and fixture.get("arguments") == arguments:
                output = fixture.get("output")
                return output if isinstance(output, dict) else {"error": "invalid fixture"}
        return {"found": False, "error": "fixture_not_available"}

    def run_case(self, record: dict[str, Any]) -> tuple[Any, list[str]]:
        messages = []
        for message in record["messages"]:
            if message.get("role") == "assistant":
                break
            messages.append(message)
        called_tools: list[str] = []
        for _ in range(8):
            message = self._complete(messages, record["tools"])
            # Never persist or print raw reasoning fields. Only protocol fields needed
            # for the next model turn are retained in-memory for this case.
            assistant_message = {
                "role": "assistant",
                "content": message.get("content"),
                "tool_calls": message.get("tool_calls", []),
            }
            messages.append(assistant_message)
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                return None, called_tools
            for call in tool_calls:
                function = call.get("function") or {}
                name = str(function.get("name", ""))
                called_tools.append(name)
                arguments = _arguments(function.get("arguments", {}))
                if name == "submit_findings":
                    return arguments.get("findings"), called_tools
                output = self._fixture(record, name, arguments)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "name": name,
                        "content": json.dumps(output, ensure_ascii=False, separators=(",", ":")),
                    }
                )
        return None, called_tools


def _aggregate(case_results: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(case_results)
    if not count:
        raise ValueError("No evaluation cases were loaded.")
    boolean_metrics = [
        "completed",
        "schema_valid",
        "rule_exact",
        "finding_contract_exact",
        "citation_safe",
        "pii_safe",
    ]
    metrics = {
        name: sum(1 for result in case_results if result[name]) / count for name in boolean_metrics
    }
    metrics["required_tool_recall"] = sum(
        float(result["required_tool_recall"]) for result in case_results
    ) / count
    metrics["unknown_tool_count"] = sum(int(result["unknown_tool_count"]) for result in case_results)
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate a legal LLM through an OpenAI-compatible endpoint.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_OUTPUT / "test.jsonl")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    parser.add_argument("--base-url", default=os.getenv("LEGAL_LLM_BASE_URL") or os.getenv("FPT_MARKETPLACE_BASE_URL"))
    parser.add_argument("--api-key", default=os.getenv("LEGAL_LLM_API_KEY") or os.getenv("FPT_MARKETPLACE_API_KEY"))
    parser.add_argument("--model", default=os.getenv("LEGAL_LLM_MODEL") or os.getenv("FPT_LEGAL_MODEL"))
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_DIR / "candidate.json")
    args = parser.parse_args()
    if not args.base_url or not args.api_key or not args.model:
        parser.error("base URL, API key, and model are required via arguments or environment variables.")

    contract = _read_json(args.contract)
    allowed_rule_ids = set(contract["allowedRuleIds"])
    evaluator = OpenAICompatibleEvaluator(args.base_url, args.api_key, args.model)
    case_results: list[dict[str, Any]] = []
    for record in _read_jsonl(args.dataset):
        try:
            findings, called_tools = evaluator.run_case(record)
            result = score_submission(findings, called_tools, record["labels"], allowed_rule_ids)
            result["case_id"] = record["id"]
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, urllib.error.URLError, TimeoutError) as exc:
            result = {
                "case_id": record.get("id", "unknown"),
                "completed": False,
                "schema_valid": False,
                "rule_exact": False,
                "finding_contract_exact": False,
                "required_tool_recall": 0.0,
                "unknown_tool_count": 0,
                "citation_safe": False,
                "pii_safe": False,
                "error_type": type(exc).__name__,
            }
        case_results.append(result)

    report = {
        "model": args.model,
        "dataset": str(args.dataset),
        "case_count": len(case_results),
        "metrics": _aggregate(case_results),
        "cases": case_results,
        "raw_outputs_stored": False,
        "promotion_status": "NOT_EVALUATED",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps(report["metrics"], ensure_ascii=False, indent=2))
    print(f"Privacy-safe evaluation report written to {args.report}; raw model outputs were not stored.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
