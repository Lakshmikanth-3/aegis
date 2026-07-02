/**
 * The Phase 2 demo scenario: 12 real payments across all 5 roster agents,
 * mixing compliant and non-compliant spends so the feed shows the circuit
 * genuinely rejecting -- not rubber-stamping. Shared by demo-run.ts
 * (detailed per-step logging) and server.ts's /api/simulate/start (fire-and-
 * forget, broadcast over SSE for the live dashboard).
 */
export interface ScenarioStep {
  agentName: string;
  vendor: string;
  amount: number;
  expected: "pass" | "fail";
  note: string;
}

export const DEMO_SCENARIO: ScenarioStep[] = [
  { agentName: "procurement-agent", vendor: "aws-compute", amount: 340, expected: "pass", note: "" },
  { agentName: "devops-agent", vendor: "datadog-monitoring", amount: 210, expected: "pass", note: "" },
  { agentName: "analytics-agent", vendor: "anthropic-api", amount: 480, expected: "pass", note: "just under cap" },
  { agentName: "marketing-agent", vendor: "sendgrid-email", amount: 95, expected: "pass", note: "" },
  { agentName: "compliance-agent", vendor: "openai-api", amount: 150, expected: "pass", note: "" },
  { agentName: "procurement-agent", vendor: "aws-compute", amount: 620, expected: "fail", note: "over per-tx cap of 500" },
  { agentName: "devops-agent", vendor: "cloudflare-cdn", amount: 180, expected: "pass", note: "" },
  {
    agentName: "analytics-agent",
    vendor: "shadowy-data-broker",
    amount: 300,
    expected: "fail",
    note: "vendor not in allowlist",
  },
  { agentName: "marketing-agent", vendor: "twilio-communications", amount: 275, expected: "pass", note: "" },
  { agentName: "compliance-agent", vendor: "stripe-payments", amount: 88, expected: "pass", note: "" },
  { agentName: "procurement-agent", vendor: "anthropic-api", amount: 410, expected: "pass", note: "" },
  {
    agentName: "devops-agent",
    vendor: "unregistered-infra-vendor",
    amount: 190,
    expected: "fail",
    note: "vendor not in allowlist",
  },
];
