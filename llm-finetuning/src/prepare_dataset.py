from __future__ import annotations

import argparse
from pathlib import Path

from .dataset_pipeline import (
    DEFAULT_CONTRACT,
    DEFAULT_OUTPUT,
    DEFAULT_SEED,
    DatasetValidationError,
    build_records,
    write_records,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and build the legal-agent SFT dataset.")
    parser.add_argument("--seed", type=Path, default=DEFAULT_SEED)
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--production",
        action="store_true",
        help="Require a signed LEGAL_POLICY_OWNER approval before writing the dataset.",
    )
    args = parser.parse_args()
    try:
        summary, records = build_records(
            args.seed,
            args.contract,
            require_approved=args.production,
        )
        write_records(records, args.output, summary, args.contract)
    except DatasetValidationError as exc:
        parser.error(str(exc))
    print(
        f"Built {summary.scenario_count} scenarios at {args.output} "
        f"(demo_only={summary.demo_only}, splits={summary.split_counts})."
    )
    for warning in summary.warnings:
        print(f"WARNING: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
