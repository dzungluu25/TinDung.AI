# Fine-tuning LLM cho Legal & Compliance Agent

Pipeline này tinh chỉnh **hành vi** của Legal Agent: chọn đúng rule, gọi đúng tool, dừng khi thiếu bằng chứng và trả đúng schema. Nội dung luật và citation không được ghi nhớ trong trọng số; chúng tiếp tục đến từ GraphRAG và `backend/src/policy/citation-catalog.json`.

## Lựa chọn model

| Vai trò | Model | Cách dùng |
|---|---|---|
| Baseline hiện tại | `gpt-oss-120b` qua FPT AI Marketplace | Đánh giá trước/sau, không dùng làm job huấn luyện mặc định |
| Candidate khuyến nghị | `openai/gpt-oss-20b` | LoRA bằng Transformers + PEFT + TRL; cùng họ model và phù hợp thử nghiệm hơn |
| Managed LoRA thay thế | Model đang xuất hiện trong catalog fine-tune của FPT | Chỉ dùng sau khi xác minh model hỗ trợ đúng tool-call format và private deployment |

`gpt-oss` là open-weight và không fine-tune qua OpenAI API. Công thức chính thức dùng `gpt-oss-20b`, MXFP4, LoRA và một GPU H100 80 GB; GPU nhỏ hơn phải giảm batch/sequence length. FPT có AI Studio/GPU VM và luồng LoRA managed, nhưng danh sách base model fine-tunable thay đổi theo tài khoản/khu vực nên phải kiểm tra catalog trước khi tạo job.

Nguồn kỹ thuật: [OpenAI gpt-oss](https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss), [công thức LoRA chính thức](https://developers.openai.com/cookbook/articles/gpt-oss/fine-tune-transfomers), [TRL tool-calling dataset](https://huggingface.co/docs/trl/dataset_formats#tool-calling), [FPT fine-tune LoRA](https://docs.fptcloud.com/vi/docs/fpt-ai-factory/ai-marketplace/tutorials/fine-tune-with-lora/).

## Các cổng an toàn đã cài

- Chỉ nhận dữ liệu tổng hợp, quét email/số điện thoại/CCCD và chặn dữ liệu có dấu hiệu PII.
- Chia train/validation/test theo `caseFamily` và chặn input trùng xuyên split.
- Chỉ cho rule ID, clause ID và tool thuộc allow-list trong contract dùng chung với backend.
- Cấm citation trong nhãn SFT. Backend cũng xóa citation model trả về rồi dựng lại từ catalog chính thức.
- Không huấn luyện hoặc lưu raw chain-of-thought; không gửi metric tới tracker bên ngoài.
- Dữ liệu mẫu hiện là `DEMO_ONLY`, `NEEDS_REVIEW`. Lệnh production thất bại cho đến khi có `LEGAL_POLICY_OWNER`, thời gian duyệt và approval ticket.
- Candidate không tự deploy. Promotion cần ít nhất 100 holdout case, không có PII/citation/tool lạ, schema và tool recall đạt 100%, rule/status/gate đạt ít nhất 98%, không giảm quá 1 điểm phần trăm so với baseline, sau đó vẫn cần human approval.

## Chạy pipeline

Từ thư mục `llm-finetuning`:

```bash
python -m unittest discover -s tests -v
python -m src.prepare_dataset
```

Hai lệnh trên không cần GPU. Chúng tạo artifact cục bộ bị `.gitignore` loại trừ.

Sau khi Legal Policy Owner duyệt `data/seed_scenarios.json`, cập nhật `reviewStatus=APPROVED`, `reviewerId`, `reviewedAt`, `approvalTicket`, mở rộng dữ liệu thật đã khử định danh và chạy:

```bash
python -m src.prepare_dataset --production
```

Trên GPU riêng/AI Studio, cài PyTorch phù hợp CUDA rồi:

```bash
pip install -r requirements-train.txt
python -m src.train_gpt_oss_lora
```

Chỉ để smoke-test kỹ thuật với seed chưa duyệt:

```bash
python -m src.train_gpt_oss_lora --allow-demo-data
```

Adapter sinh từ lệnh này vẫn mang `demo_only=true` và không đủ điều kiện production.

## Đánh giá baseline và candidate

Serve từng model qua endpoint OpenAI-compatible riêng rồi chạy cùng một test set:

```bash
python -m src.evaluate_openai_compatible \
  --base-url https://baseline.example/v1 \
  --api-key "$BASELINE_KEY" \
  --model gpt-oss-120b \
  --report artifacts/eval/baseline.json

python -m src.evaluate_openai_compatible \
  --base-url https://candidate.example/v1 \
  --api-key "$CANDIDATE_KEY" \
  --model vaic-legal-gpt-oss-20b-lora-v1 \
  --report artifacts/eval/candidate.json

python -m src.promote \
  --baseline artifacts/eval/baseline.json \
  --candidate artifacts/eval/candidate.json \
  --decision artifacts/eval/promotion.json
```

Evaluator không lưu prompt, raw output hay raw CoT; report chỉ chứa điểm theo case. Sau khi cổng tự động đạt, Risk/Compliance phê duyệt thủ công, triển khai model private và cấu hình backend:

```dotenv
LEGAL_LLM_BASE_URL=https://private-endpoint.example/v1
LEGAL_LLM_API_KEY=...
LEGAL_LLM_MODEL=vaic-legal-gpt-oss-20b-lora-v1
```

Luôn triển khai canary/shadow trước, giữ `gpt-oss-120b` làm rollback target và không dùng request production làm dữ liệu huấn luyện nếu chưa có consent, retention policy và quy trình khử định danh được phê duyệt.
