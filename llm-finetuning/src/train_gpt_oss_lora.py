from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .dataset_pipeline import DEFAULT_OUTPUT


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "gpt-oss-20b-lora.json"


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number} must be an object.")
            # Only expose the fields consumed by the model chat template. Governance
            # labels remain in the source artifact and never become training tokens.
            rows.append({"messages": row["messages"], "tools": row["tools"]})
    if not rows:
        raise ValueError(f"{path} is empty.")
    return rows


def _assert_training_gate(dataset_dir: Path, allow_demo_data: bool) -> dict[str, Any]:
    manifest_path = dataset_dir / "manifest.json"
    if not manifest_path.exists():
        raise ValueError("Dataset manifest is missing. Run src.prepare_dataset first.")
    manifest = _read_json(manifest_path)
    if manifest.get("demo_only") and not allow_demo_data:
        raise ValueError(
            "Training blocked: dataset is DEMO_ONLY. Obtain LEGAL_POLICY_OWNER approval "
            "or pass --allow-demo-data for a non-production smoke experiment."
        )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="LoRA fine-tune openai/gpt-oss-20b for VAIC legal behavior.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--model-id", type=str)
    parser.add_argument(
        "--allow-demo-data",
        action="store_true",
        help="Permit a smoke run with unapproved synthetic seed data. Output remains DEMO_ONLY.",
    )
    args = parser.parse_args()
    try:
        config = _read_json(args.config)
        manifest = _assert_training_gate(args.dataset_dir, args.allow_demo_data)
    except ValueError as exc:
        parser.error(str(exc))

    # Heavy dependencies are imported only after governance gates pass, so validation
    # remains runnable on ordinary developer machines without a CUDA stack.
    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer, Mxfp4Config
    from trl import SFTConfig, SFTTrainer

    model_id = args.model_id or str(config["model_id"])
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    quantization_config = Mxfp4Config(dequantize=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        attn_implementation="eager",
        torch_dtype=torch.bfloat16,
        quantization_config=quantization_config,
        use_cache=False,
        device_map="auto",
    )
    peft_config = LoraConfig(
        r=int(config["lora_rank"]),
        lora_alpha=int(config["lora_alpha"]),
        lora_dropout=float(config["lora_dropout"]),
        target_modules="all-linear",
        target_parameters=list(config["expert_target_parameters"]),
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    train_dataset = Dataset.from_list(
        _read_jsonl(args.dataset_dir / "train.jsonl"), on_mixed_types="use_json"
    )
    validation_dataset = Dataset.from_list(
        _read_jsonl(args.dataset_dir / "validation.jsonl"), on_mixed_types="use_json"
    )
    output_dir = ROOT / str(config["output_dir"])
    training_args = SFTConfig(
        output_dir=str(output_dir),
        learning_rate=float(config["learning_rate"]),
        num_train_epochs=float(config["num_train_epochs"]),
        per_device_train_batch_size=int(config["per_device_train_batch_size"]),
        per_device_eval_batch_size=int(config["per_device_eval_batch_size"]),
        gradient_accumulation_steps=int(config["gradient_accumulation_steps"]),
        max_length=int(config["max_length"]),
        warmup_ratio=float(config["warmup_ratio"]),
        logging_steps=int(config["logging_steps"]),
        seed=int(config["seed"]),
        gradient_checkpointing=True,
        lr_scheduler_type="cosine_with_min_lr",
        lr_scheduler_kwargs={"min_lr_rate": 0.1},
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        report_to="none",
        push_to_hub=False,
        packing=False,
    )
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    release_manifest = {
        "base_model": model_id,
        "adapter_path": str(output_dir),
        "dataset_id": manifest.get("dataset_id"),
        "dataset_sha256": manifest.get("sha256"),
        "contract_sha256": manifest.get("contract_sha256"),
        "demo_only": bool(manifest.get("demo_only")),
        "raw_cot_trained": False,
        "external_tracking": False,
        "promotion_status": "NOT_EVALUATED",
    }
    with (output_dir / "release-manifest.json").open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(release_manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Saved local LoRA adapter to {output_dir}. Promotion status: NOT_EVALUATED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
