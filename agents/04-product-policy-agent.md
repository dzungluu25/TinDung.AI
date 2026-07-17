# Product Policy Agent

## Vai tro

Product Policy Agent tra cuu san pham vay, policy lai suat, tenure, han muc, dieu kien refinance va dieu kien pricing. Agent nay de xuat product/rate hop le, nhung khong duoc gan lai suat voi viec mua bao hiem khong bat buoc.

## Flow

```text
Receive case and customer segment
-> Retrieve product policy
-> Match home loan product
-> Match auto refinance product
-> Propose rate/tenure/limit options
-> Mark pricing assumptions
-> Return product policy findings
```

## Input

```ts
type ProductPolicyInput = {
  runId: string;
  customerSegment: "retail";
  requestedLoan: RequestedLoan;
  refinanceAutoLoan?: AutoLoan;
  insurancePreference: "accepted" | "declined";
};
```

## Output

```ts
type ProductPolicyOutput = {
  eligibleProducts: ProductOption[];
  pricingOffer: PricingOffer;
  policyFindings: DecisionEnvelope[];
};
```

## Knowledge base can co

- Home loan product policy.
- Future-property mortgage conditions.
- Auto refinance product rules.
- Tenure min/max.
- Rate packages.
- Internal demo rule: insurance cannot be mandatory for preferential rate.
- Product eligibility by DTI/LTV after Credit result.

## Cach code

File de xuat:

```text
backend/src/services/agents/product-policy.agent.ts
backend/src/services/rag/product-policy-rag.service.ts
backend/src/services/rules/product-policy-rule-pack.ts
```

Function goi y:

```ts
queryProductPolicies(query: string): Promise<ProductPolicySource[]>;
matchEligibleProducts(input: ProductPolicyInput): ProductOption[];
buildPricingOffer(options: ProductOption[]): PricingOffer;
runProductPolicyAgent(runId: string, profile: CustomerProfileOutput): Promise<AgentTrace>;
```

## Way handle

- Product Agent chi de xuat option, khong approve.
- Neu policy source khong co, mark `requires_policy_review`.
- Khong dua `insurance_purchase` lam input bat buoc cua pricing function.
- Neu ban dau demo can tao "trap", Product/Credit co the return offer sai de Legal chặn:
  - 7.5% if insurance purchased.
  - 8.3% otherwise.
  Sau Legal veto, phai re-price:
  - 7.5% for all eligible customers, insurance optional.

## Tool calls

- `queryProductPolicies`
- `buildPricingOffer`
- `validateProductEligibility`

## Acceptance criteria

- Co product option cho home loan va auto refinance.
- Co pricing trap de Legal gate co moment chặn.
- Co re-price output khong phu thuoc bao hiem.
- Trace hien policy source/rule ID.

