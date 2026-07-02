/**
 * Single source of truth for Aegis's professional demo data (Phase 1).
 * Both the orchestrator's boot sequence (treasury.ts's default vendor set)
 * and the standalone `seed.ts` script import this, so the agent/vendor
 * roster can never drift between what's deployed and what's re-seeded.
 */

export interface AgentSeed {
  name: string;
  description: string;
  roleBadge: string;
  startingBudget: number;
}

export const AGENTS: AgentSeed[] = [
  {
    name: "procurement-agent",
    description: "Autonomous procurement for SaaS and cloud services",
    roleBadge: "Procurement",
    startingBudget: 25000,
  },
  {
    name: "devops-agent",
    description: "Infrastructure provisioning and monitoring spend",
    roleBadge: "DevOps",
    startingBudget: 18000,
  },
  {
    name: "analytics-agent",
    description: "Data pipeline and ML compute purchasing",
    roleBadge: "Analytics",
    startingBudget: 12000,
  },
  {
    name: "marketing-agent",
    description: "Campaign tooling and audience API spend",
    roleBadge: "Marketing",
    startingBudget: 8500,
  },
  {
    name: "compliance-agent",
    description: "Regulatory data feeds and audit tooling",
    roleBadge: "Compliance",
    startingBudget: 6000,
  },
];

export interface VendorSeed {
  name: string;
  description: string;
}

export const VENDORS: VendorSeed[] = [
  { name: "aws-compute", description: "AWS EC2/S3 compute and storage" },
  { name: "stripe-payments", description: "Stripe payment processing API" },
  { name: "twilio-communications", description: "Twilio SMS and voice APIs" },
  { name: "sendgrid-email", description: "SendGrid transactional email" },
  { name: "cloudflare-cdn", description: "Cloudflare CDN and R2 storage" },
  { name: "anthropic-api", description: "Anthropic Claude API access" },
  { name: "openai-api", description: "OpenAI API access" },
  { name: "datadog-monitoring", description: "Datadog infrastructure monitoring" },
];

export const VENDOR_NAMES: string[] = VENDORS.map((v) => v.name);
