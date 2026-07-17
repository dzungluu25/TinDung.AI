import { OrchestrationResponse } from "../../types/orchestration.types";
import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import { CreditOutput, CustomerProfileOutput, ProductPolicyOutput } from "../../types/domain.types";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { citationsFromSources, queryMockKnowledgeBase } from "../rag/mock-knowledge-base.service";
import { inferCaseIdFromPrompt } from "../data/retail-case-data";
import { runCustomerProfileAgent } from "../agents/customer-profile.agent";
import { runCreditAgent } from "../agents/credit.agent";
import { runLegalAgent } from "../agents/legal.agent";
import { runProductPolicyAgent } from "../agents/product-policy.agent";
import { runRiskDecisionMatrixAgent } from "../agents/risk-decision-matrix.agent";
import { runOperationsAgent } from "../agents/operations.agent";
import { runGovernanceAuditAgent } from "../agents/governance-audit.agent";
import { detectRiskTier } from "./risk-router.service";
import { retrieveWorkflowTemplate } from "./workflow-template.service";
import { buildDependencyGraph } from "./dependency-graph.service";
import { saveOrchestrationRun } from "./trace.service";
import { buildAgentTrace } from "../agents/trace.factory";
import { newRunId } from "../../utils/ids";
import { callModelThroughGateway } from "../governance/model-gateway.service";

interface PlannerGraphState extends Record<string, unknown> {
  prompt: string;
  caseId?: string;
  customerId?: string;
  approvalToken?: string;
  runId: string;
  tier?: "FAST" | "COMPLEX";
  workflowId?: string;
  traces: AgentTrace[];
  response?: OrchestrationResponse;
}

const ensureDecisionPrefix = (content: string, decision: string): string => {
  const trimmed = content.trim();
  return trimmed.startsWith(decision) ? trimmed : `${decision}: ${trimmed}`;
};

const buildPlannerTrace = async (
  runId: string,
  prompt: string,
  tier: "FAST" | "COMPLEX",
  workflowId: string,
  taskCount: number
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();
  const sources = await queryMockKnowledgeBase("workflow template router fast complex agent capability", [
    "workflow",
    "planner",
    "routing"
  ]);
  const toolCalls: ToolCallTrace[] = [
    {
      toolName: "retrieveWorkflowTemplate",
      input: { tier },
      output: { workflowId, taskCount },
      status: "success"
    },
    {
      toolName: "queryMockKnowledgeBase",
      input: { query: "workflow template router fast complex agent capability" },
      output: { citations: citationsFromSources(sources) },
      status: "success"
    }
  ];

  return buildAgentTrace(
    runId,
    "planner",
    "Classify request, retrieve workflow template, and build dependency graph",
    `Router classified request as ${tier}; selected workflow ${workflowId}.`,
    startedAt,
    toolCalls,
    {
      promptLength: prompt.length,
      tier,
      workflowId,
      taskCount
    }
  );
};

const executeFastLane = async (state: PlannerGraphState): Promise<Partial<PlannerGraphState>> => {
  const sources = await queryMockKnowledgeBase("fast response product policy retail banking", ["product", "policy"]);
  const fallback =
    "FAST_PASS: request is simple enough for direct policy/RAG handling. No credit, legal, or operations side-effect workflow was executed.";
  const modelGateway = await callModelThroughGateway({
    runId: state.runId,
    purpose: "final_answer",
    systemPrompt:
      "You are a banking operations report writer. Use only the supplied JSON. Do not invent approvals, calculations, or customer facts.",
    userPrompt: JSON.stringify({
      tier: "FAST",
      workflowId: state.workflowId,
      citations: citationsFromSources(sources),
      instruction: "Write one concise final answer for the operations dashboard."
    }),
    temperature: 0,
    maxTokens: 220,
    fallback
  });
  const governance = await runGovernanceAuditAgent(state.runId, {
    prompt: state.prompt,
    tier: "FAST",
    citations: citationsFromSources(sources),
    modelGateway
  });

  const traces = [...state.traces, governance.trace];
  const response: OrchestrationResponse = {
    runId: state.runId,
    tier: "FAST",
    workflowId: state.workflowId,
    finalAnswer: ensureDecisionPrefix(modelGateway.content, "FAST_PASS"),
    traces
  };

  saveOrchestrationRun(state.runId, response);
  return { traces, response };
};

const executeComplexWorkflow = async (state: PlannerGraphState): Promise<Partial<PlannerGraphState>> => {
  const caseId = inferCaseIdFromPrompt(state.prompt, state.caseId);
  const profileRun = await runCustomerProfileAgent(state.runId, caseId);
  const profile: CustomerProfileOutput = profileRun.output;

  const [creditRun, initialProductRun] = await Promise.all([
    runCreditAgent(state.runId, profile),
    runProductPolicyAgent(state.runId, profile, false)
  ]);

  const creditOutput: CreditOutput = creditRun.output;
  let productOutput: ProductPolicyOutput = initialProductRun.output;
  const firstLegalRun = await runLegalAgent(state.runId, {
    customerProfile: profile,
    creditOutput,
    productOutput
  });

  const traces: AgentTrace[] = [
    ...state.traces,
    profileRun.trace,
    creditRun.trace,
    initialProductRun.trace,
    firstLegalRun.trace
  ];

  const needsReprice = firstLegalRun.output.findings.some(
    (finding) => finding.ruleIds.includes("LEGAL_INSURANCE_TYING_PROHIBITED") && finding.status === "VIOLATION"
  );

  const finalLegalRun = needsReprice
    ? await (async () => {
        const repriceRun = await runProductPolicyAgent(state.runId, profile, true);
        productOutput = repriceRun.output;
        const legalRun = await runLegalAgent(state.runId, {
          customerProfile: profile,
          creditOutput,
          productOutput
        });
        traces.push(repriceRun.trace, legalRun.trace);
        return legalRun;
      })()
    : firstLegalRun;

  const allFindings = [
    ...creditOutput.findings,
    ...productOutput.policyFindings,
    ...finalLegalRun.output.findings
  ];

  const riskRun = await runRiskDecisionMatrixAgent(state.runId, allFindings);
  traces.push(riskRun.trace);

  const opsRun = await runOperationsAgent(state.runId, {
    decision: riskRun.output,
    approvalToken: state.approvalToken
  });
  traces.push(opsRun.trace);

  const fallbackFinalAnswer =
    riskRun.output.finalDecision === "CONDITIONAL_PASS"
      ? `CONDITIONAL_PASS: propose home loan 2.25B VND over 30 years with auto refinance. Stress DTI ${(creditOutput.restructureScenario.dti * 100).toFixed(
          1
        )}% and LTV ${(creditOutput.restructureScenario.ltv * 100).toFixed(
          1
        )}%. Conditions: spouse signature/separate-property proof, project guarantee before disbursement, and separate consent before tax/social-insurance enrichment. Operations status: ${opsRun.output.executionStatus}.`
      : `${riskRun.output.finalDecision}: ${riskRun.output.reasonCodes.join(", ")}`;

  const modelGateway = await callModelThroughGateway({
    runId: state.runId,
    purpose: "final_answer",
    systemPrompt:
      "You are a banking operations report writer. Use only the supplied JSON. Keep the final gate result, figures, conditions, and operation status unchanged. Do not calculate, approve, reject, or invent facts. Do not include raw PII.",
    userPrompt: JSON.stringify({
      finalDecision: riskRun.output.finalDecision,
      workflowId: state.workflowId,
      credit: {
        validMonthlyIncome: creditOutput.validMonthlyIncome,
        originalScenario: {
          dti: creditOutput.originalScenario.dti,
          ltv: creditOutput.originalScenario.ltv
        },
        restructureScenario: {
          homeLoanAmount: creditOutput.restructureScenario.homeLoanAmount,
          tenureYears: creditOutput.restructureScenario.tenureYears,
          dti: creditOutput.restructureScenario.dti,
          ltv: creditOutput.restructureScenario.ltv
        }
      },
      product: {
        packageId: productOutput.pricingOffer.packageId,
        selectedAnnualRate: productOutput.pricingOffer.selectedAnnualRate,
        insuranceOptional: productOutput.pricingOffer.insuranceOptional
      },
      legal: {
        gateStatus: finalLegalRun.output.gateStatus,
        conditions: finalLegalRun.output.conditions,
        requiredFixes: finalLegalRun.output.requiredFixes
      },
      risk: riskRun.output,
      operations: {
        ticketId: opsRun.output.ticketId,
        executionStatus: opsRun.output.executionStatus
      },
      instruction:
        "Write a concise final answer for an internal dashboard. Mention that deterministic agents made the decision and Gemma only summarized the result."
    }),
    temperature: 0,
    maxTokens: 450,
    fallback: fallbackFinalAnswer
  });

  const governanceRun = await runGovernanceAuditAgent(state.runId, {
    profile,
    credit: creditOutput,
    product: productOutput,
    legal: finalLegalRun.output,
    risk: riskRun.output,
    operations: opsRun.output,
    modelGateway
  });
  traces.push(governanceRun.trace);

  const response: OrchestrationResponse = {
    runId: state.runId,
    tier: "COMPLEX",
    workflowId: state.workflowId,
    finalAnswer: ensureDecisionPrefix(modelGateway.content, riskRun.output.finalDecision),
    traces,
    approvalTicketId: opsRun.output.ticketId
  };

  saveOrchestrationRun(state.runId, response);
  return { traces, response };
};

export const executeMockOrchestration = async (
  input: string | { prompt: string; caseId?: string; customerId?: string; approvalToken?: string }
): Promise<OrchestrationResponse> => {
  const request = typeof input === "string" ? { prompt: input } : input;
  const runId = newRunId();
  const tier = detectRiskTier(request);
  const workflow = retrieveWorkflowTemplate(tier);
  const taskGraph = buildDependencyGraph(workflow);
  const plannerTrace = await buildPlannerTrace(runId, request.prompt, tier, workflow.workflowId, taskGraph.length);

  const graph = new StateGraph<PlannerGraphState>()
    .addNode("route", (state) => ({
      tier,
      workflowId: workflow.workflowId,
      traces: [...state.traces, plannerTrace]
    }))
    .addNode("fastLane", executeFastLane)
    .addNode("complexWorkflow", executeComplexWorkflow)
    .addConditionalEdges("route", (state) => (state.tier === "FAST" ? "FAST" : "COMPLEX"), {
      FAST: "fastLane",
      COMPLEX: "complexWorkflow"
    })
    .addEdge(START, "route")
    .addEdge("fastLane", END)
    .addEdge("complexWorkflow", END)
    .compile();

  const finalState = await graph.invoke({
    prompt: request.prompt,
    caseId: request.caseId,
    customerId: request.customerId,
    approvalToken: request.approvalToken,
    runId,
    traces: []
  });

  if (!finalState.response) {
    throw new Error("Planner graph did not produce an orchestration response.");
  }

  return finalState.response;
};
