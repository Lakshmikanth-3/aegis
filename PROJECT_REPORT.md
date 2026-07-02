# Aegis — Complete Project Report (A–Z)

*Confidential, provably-compliant treasury rails for AI agent payments on Stellar.*

> **Report generated:** 2026-07-02, by auditing the codebase end-to-end, actually executing every test suite and the live demo scenario against a freshly deployed Stellar Testnet contract, and independently grepping for mocked/placeholder/hardcoded logic. Every number, transaction hash, and contract ID below is from a real run performed for this report, not copied from documentation.
> **Last updated:** 2026-07-03 (night) — §3.8 feature expansion committed (`f023fb1`) and live on the public Vercel deployment; working tree clean; project is submission-ready (§0), with only the demo-video recording and the DoraHacks form left, both human steps.

---

## 0. Current status (as of 2026-07-03, latest check)

- **Orchestrator:** running at `http://localhost:4000`, `ready: true`.
- **Dashboard (local dev):** running at `http://localhost:5173`.
- **Dashboard (public):** deployed on Vercel at **`https://aegis-delta-gules.vercel.app`** — now serving the full §3.8 feature set. After the `f023fb1` push, the redeploy was verified live: `/pitch` returns 200 and the served JS bundle was confirmed to contain the new features (see §3.7 for what the public deployment does and doesn't include).
- **Live contract:** `CDPFNNPOXFZLFZOJRUN6PW7LYWOIU6SLFBJZKP3BUC6YMOUIL6XB6MF6` (same instance since §4.2's deployment — has stayed up across the UI overhaul, hero-section work, and deployment work below).
- **Live totals right now** (`GET /api/summary`): **45 settled, 35 rejected, 0 violations reached settlement, 80 total** — up from the morning's 31/25/56 because every feature in §3.8 was verified by triggering additional real payments, rejections, and attestation proofs.
- **Code status:** all 6 dashboard UI-overhaul tasks (§3.5), the hero-section visual port (§3.6), the public Vercel deployment (§3.7), and the six-feature expansion plus in-app pitch deck (§3.8) are complete and verified live. No known open bugs. Remaining items are the disclosed roadmap gaps in §8, not defects.
- **Repo state:** fully committed and pushed. The §3.8 feature expansion landed as **`f023fb1`** (17 files, +2,540 lines: `ProofInspector.tsx`, `PitchDeck.tsx`/`.css`, `FleetHealth.tsx`, 8 modified files, the `chart.js` dependency, and the report itself). `git status` is clean — nothing uncommitted.
- **Submission status:** code, deployment, tests, and pitch materials are done. The only remaining hackathon steps are human ones: record the ~3-minute demo video (script: `DEMO_SCRIPT.md`, plus a verified minute-by-minute narration flow prepared during submission prep) and fill the DoraHacks form. One wording correction was flagged for the submission description: the honest claim is **"80 real proof runs: 45 settled as real on-chain transactions, 35 blocked by the circuit before any transaction existed"** — not "80 transactions", since rejections deliberately produce no transaction at all.
- To run everything from scratch instead of using the already-running instance, see §9.

---

## 1. What this is

Stellar's **x402** and **MPP (Machine Payment Protocol)** now let AI agents autonomously discover, authorize, and settle payments for APIs, data, and compute — no human approves each transaction. That's live infrastructure, not a demo concept. But Stellar is a public ledger: every one of those payments — who an agent paid, how much, how often — is visible to anyone watching. For a company running a fleet of agents with department budgets and vendor relationships embedded in that spend pattern, the public spend graph is a competitive-intelligence leak. And today's spending controls (caps, allow-lists) are enforced by a contract anyone can inspect but no one can *prove* was configured correctly, or wasn't tampered with, without being handed the whole ledger.

**Aegis closes both gaps with one circuit.** Each agent draws from a shielded balance commitment instead of a visible running balance. Every spend is gated by a real Noir/UltraHonk zero-knowledge proof that checks the payment against policy — per-transaction cap, vendor allow-list, sufficient remaining balance — *before* the contract will let it settle. A non-compliant payment doesn't get rejected by an application-level check; it simply has no valid proof, because the circuit's constraints can't be satisfied. At any time, a treasury operator can generate a second, much smaller proof that discloses only an aggregate compliance fact — *"this agent's spend over the last 24 hours stayed under $X, with zero payments to non-allow-listed vendors"* — without disclosing a single underlying transaction.

### Origin

The project began as a hackathon PRD (`docs/shadow.md`), originally named **Umbra**, written for the "Stellar Hacks: Real-World ZK" DoraHacks event (submission deadline June 29, 2026, ~3-day build window). It shipped as **Aegis**, and — unusually for a hackathon MVP — both the "must ship" scope *and* both stretch goals (the attestation circuit, live Testnet deployment) were completed, not just the MVP.

---

## 2. Architecture

```
                          ┌──────────────────────┐
   AI Agent  ── wants to ─▶  Orchestrator          │
   (agent_id, vendor,      │  - real Poseidon math │
    amount)                │  - real nargo/bb       │
                           │    proof generation    │
                           └──────────┬────────────┘
                                      │ real nargo execute + bb prove
                                      │ (rejects here if no witness solves)
                                      ▼
                           ┌───────────────────────┐
                           │  AegisTreasury          │
                           │  (Soroban, Testnet)     │
                           │  - UltraHonk verifier    │
                           │    (CAP-80 BN254 fns)   │
                           │  - commitment + nonce    │
                           │    state per agent      │
                           │  - vendor allow-list     │
                           │    Merkle root          │
                           └──────────┬────────────┘
                                      │ AuthorizedSpendEvent
                                      ▼
                           ┌───────────────────────┐
                           │  x402 / MPP Facilitator │
                           │  (logged, not executed  │
                           │   in this build)        │
                           └───────────────────────┘

   Dashboard (Vite/React) — talks to the orchestrator's REST + SSE API:
     /            Landing page (live settled/blocked stat row)
     /console     Treasury Console + per-agent detail drawer
     /feed        Live Sealed Feed (sealed amounts, real-time SSE)
     /vendors     Vendor allow-list management (real Merkle root updates)
     /attestation Compliance Attestation (24h / 7d / session, QR + independent verify)
     /pitch       In-app 10-slide pitch deck (architecture + flow diagrams, live stats)
```

Every arrow above is a real network call except the bottom one (x402/MPP facilitator), which is an explicitly disclosed out-of-scope boundary (see §5).

### Repository layout

| Path | What it is |
|---|---|
| `aegis-circuit/` | Noir circuit `spend_proof` — the per-payment compliance proof |
| `aegis-attestation-circuit/` | Noir circuit `compliance_attestation` — the aggregate disclosure proof |
| `aegis-contract/` | Soroban/Rust contract `AegisTreasury` — on-chain verifier + policy state |
| `rs-soroban-ultrahonk/` | Vendored third-party UltraHonk verifier library the contract builds on |
| `poseidon_src/` | Vendored Poseidon hash Noir library used by both circuits |
| `orchestrator/` | Node/TypeScript service: Poseidon math, `nargo`/`bb` proof generation via WSL, `stellar-cli` submission, REST+SSE API |
| `dashboard/` | Vite/React frontend, 5 screens, Playwright e2e smoke test |
| `deploy/` | Standalone shell scripts for manual contract inspection/deployment |
| `docs/shadow.md` | The original hackathon PRD (pre-rename, "Umbra") |
| `agent-hero-section/` | Standalone Next.js/Tailwind/shadcn scaffold, a design reference only (§3.6) — its hero visual was ported into `dashboard/`, this folder itself is not run or deployed |
| `DEMO_SCRIPT.md` | Full narration script for the demo video, written against the verified live behavior (committed 2026-07-03) |
| `vercel.json` | Vercel deployment config — builds `dashboard/` from the monorepo root and adds SPA rewrites (§3.7) |

---

## 3. How it works, technically

### 3.1 The `spend_proof` circuit (`aegis-circuit/src/main.nr`)

**Public inputs:** `old_balance_commitment`, `new_balance_commitment`, `per_tx_cap`, `vendor_allowlist_root`, `agent_id`, `agent_nonce`
**Private inputs:** `old_balance`, `blinding_old`, `amount`, `new_balance`, `blinding_new`, `vendor_leaf`, `merkle_path[3]`, `merkle_indices[3]`

Constraints enforced (`main.nr:27–51`):
1. `Poseidon(old_balance, blinding_old, agent_id) == old_balance_commitment` — proves knowledge of the real current shielded balance.
2. `old_balance >= amount` and `new_balance == old_balance − amount` — no overspend, no negative balances.
3. `amount <= per_tx_cap` — the actual per-transaction policy check.
4. `Poseidon(new_balance, blinding_new, agent_id) == new_balance_commitment` — binds the new commitment for the contract to store.
5. A depth-3 Poseidon Merkle path proves `vendor_leaf` is a member of `vendor_allowlist_root` (up to 8 vendors), without revealing which leaf.

`agent_nonce` carries no in-circuit arithmetic constraint of its own (`main.nr:46–51`) — replay protection instead comes from the fact that a UltraHonk proof is cryptographically bound to the exact public inputs it was generated against. The contract requires the submitted `agent_nonce` to equal its own stored nonce; once that nonce advances, a captured proof can no longer be replayed with either the old or new nonce value.

### 3.2 The `compliance_attestation` circuit (`aegis-attestation-circuit/src/main.nr`)

Given two real commitment snapshots (a period-start commitment and the agent's current commitment), proves that cumulative spend across that interval is bounded by a claimed cap — without revealing any individual transaction amount.

### 3.3 The `AegisTreasury` contract (`aegis-contract/src/lib.rs`)

- `init` / `register_agent` / `update_policy` — admin-gated setup (vendor allow-list root, per-transaction cap, per-agent starting commitment).
- `submit_spend(agent_id, proof, public_inputs)` — checks the submitted commitment/nonce/cap/allowlist-root against on-chain state (`lib.rs:246–304`), *then* calls the real UltraHonk verifier; only on both passing does it update the stored commitment and increment the nonce.
- `set_period_start_commitment` / `verify_attestation` — lets the orchestrator attest against a genuine historical starting point (e.g., "last 24 hours"), not just "since the last click."
- Built on the vendored `rs-soroban-ultrahonk` crate, using Stellar Protocol 26 ("Yardstick", CAP-80) BN254 host functions for cheap on-chain pairing checks.

### 3.4 The orchestrator (`orchestrator/src/`)

- `poseidon.ts` — off-chain Poseidon commitment/Merkle math, using `poseidon-lite` for speed.
- `prover.ts` — shells out to WSL to run real `nargo execute` + `bb prove` (`--scheme ultra_honk --oracle_hash keccak`), producing real 14,592-byte proofs and 1,760-byte verification keys.
- `chain.ts` — shells out to `stellar-cli` (WSL) for all on-chain reads/writes; auto-generates and friendbot-funds a Testnet admin identity on first run.
- `queue.ts` — serializes all `nargo`/`bb` invocations onto a single FIFO queue, since they share `target/` build artifacts.
- `treasury.ts` — orchestration layer tying agents, payments, and rejections together; on an unregistered/rejected vendor, constructs a syntactically valid but *wrong* Merkle proof and lets the real circuit reject it, rather than short-circuiting in JavaScript.
- `selftest.ts` — cross-checks `poseidon-lite`'s output bit-for-bit against real values captured live from `nargo test --show-output` against the actual circuit.

### 3.5 The dashboard (`dashboard/src/`)

Five screens (landing, console, live feed, vendors, attestation) over the orchestrator's REST+SSE API. The Live Sealed Feed never renders a plaintext amount — settled payments show `●●●●●●`; a rejected payment's vendor *is* shown, since a rejected payment never spent anything and naming it is audit-useful rather than a confidentiality leak.

**UI overhaul (2026-07-02, post-launch).** After the initial build and audit (§4–§7 below), the dashboard went through a six-part animation/polish pass, each part verified live against the real running orchestrator and contract (screenshots, real triggered payments/proofs/vendor changes, not just code review) before moving to the next:

1. **Live Sealed Feed** — rows now slide in from the right (`translateX(24px)→0`, 220ms), hold sealed (`●●●●●●`) for exactly 900ms, then reveal with a border-color transition (150ms) and a fading-in pill badge (`✓ Policy proof verified on-chain` / `✗ Proof rejected — over per-tx cap` / `— vendor not in allow-list`) carrying a real `view tx →` link. Counters count up over 100ms via a shared `AnimatedNumber` component. Added a pulsing "● LIVE" indicator and live-ticking relative timestamps.
2. **Landing page** — rebuilt hero copy, added a distinct `#0a0e1a` hero background block, three "how it works" cards with hand-drawn SVG icons (shield-lock, check, file-certificate) and blue left-border accents, and wired the hero stat row to the same count-up component.
3. **Treasury Console drawer** — added the missing slide-in animation (`translateX(100%)→0`, 250ms — it previously appeared instantly), role-colored badges (Procurement=blue, DevOps=teal, Analytics=purple, Marketing=amber, Compliance=gray, via a shared `roleColorClass()` helper), an agent-ID copy button, and converted the console's agent rows into real hoverable cards with a chevron affordance.
4. **Vendors screen** — added a crossfading Merkle-root display (400ms), a 2-second "Updated" badge, real sliding toggle switches (replacing plain Remove/Re-add buttons) wired to the same live `update_policy` calls, red-border "Removed" state, and pop-in animation for newly added vendor cards.
5. **Compliance Attestation** — card now has its own rise-in animation (`translateY(16px)→0`, 300ms), header reads "Aegis Fleet · [period]", the verification tx line reads "view on stellar.expert →", copy-link now fires a real floating toast, and the "Verify independently" `stellar-cli` command block is now genuinely collapsible (was previously always expanded).
6. **Global polish** — added a route-change fade (200ms) between tabs, unified all status/allow-list badges to one pill spec (11px, 20px radius, 4px/10px padding), added hover-to-blue transitions to every card type, and replaced the last raw black/near-black hex literals (`#06140e`, `#0a0e1a`, `#000000a0`, `#000000cc`) with named CSS custom properties.

**A real, pre-existing mobile bug was found and fixed during the polish pass, not introduced by it:** at a 390px viewport, the topbar's four tabs overflowed the page width on every screen except the landing page (which has its own separate nav markup), causing horizontal scroll and wrapped, squished tab labels; agent rows on the console also crammed into an unreadable single line instead of stacking. Both confirmed via screenshot before the fix and after: the tab bar now scrolls horizontally on narrow screens, agent rows stack vertically below 480px, and the vendor grid drops to a single column below 480px.

Design-direction note: the polish pass explicitly kept the dashboard's existing all-dark theme (`:root { color-scheme: dark }`, green/purple/blue accents) rather than introducing a light-mode-primary look, since that's what every screen was already built around.

### 3.6 Hero-section visual port (2026-07-02, same day, after the overhaul)

A separate, standalone Next.js/Tailwind/shadcn scaffold (`agent-hero-section/`, a v0.dev-generated preview app for one generic "AI Personal Assistant" hero component) was provided as a design reference. Its layout and animated visual were ported into the real dashboard's landing page — the scaffold itself was left untouched, and no Tailwind/shadcn/Next.js dependency was pulled into the Vite app.

- Added `dashboard/src/HeroOrb.tsx`, wrapping the real `@paper-design/shaders-react` `PulsingBorder` WebGL shader (a new production dependency), recolored from the template's generic purple/pink/red to Aegis's actual accent tokens (`--accent` green, `--accent-2` purple, `--pending` blue, `--role-teal`).
- Rebuilt `LandingPage.tsx`'s hero into a two-column grid: left keeps the existing headline/subhead/CTAs/stat-row, plus a new fact row that replaced the template's generic "Available 24/7 · No setup required · Enterprise ready" with three claims that are actually true of this project — **Real UltraHonk proofs · No plaintext amounts, ever · Stellar Protocol 26 (CAP-80)**. Right side is the animated glow orb with a `"shielded balance commitment"` caption and three recolored floating accent dots. Verified responsive: the orb reorders above the text on mobile (`order: -1` below 860px).
- **Two real bugs hit during integration, both fixed and verified, not left open:**
  1. Right after `npm install`, the orb crashed with a React "Invalid hook call" — the already-running Vite dev server had a stale `node_modules/.vite` dependency-optimization cache from before the new package existed. Fixed by clearing the cache and restarting the dev server.
  2. The template's code passed a prop called `spotsPerColor`, which doesn't exist in this package's actual API (confirmed against its real `.d.ts` and source — the real prop is `spots`). Because it wasn't a recognized prop, it fell through to `...rest` and got spread onto the underlying DOM canvas element, triggering a React warning that failed the e2e suite's "no console errors" check. Fixed by using the correct prop name (`spots={5}`); suite back to 12/12 clean.

### 3.7 Public deployment to Vercel (2026-07-03)

The dashboard is now publicly deployed at **`https://aegis-delta-gules.vercel.app`**, via the Vercel GitHub integration on the `main` branch of `Lakshmikanth-3/aegis`.

- **A real deployment bug was hit and fixed:** the first deployment returned `404: NOT_FOUND` on every URL. Cause: the repo is a monorepo and the site lives in `dashboard/`, but Vercel was building from the repo root, where there is no app at all. Fixed by adding a root-level `vercel.json` (commit `48f61ee`) that installs and builds inside `dashboard/` (`npm install --prefix dashboard`, `npm run build --prefix dashboard`), serves `dashboard/dist`, and rewrites all paths to `/index.html` — the rewrite is required because the app uses React Router's `BrowserRouter`, so without it a refresh or direct link on `/console`, `/feed`, `/vendors`, or `/attestation` would 404 even after the build fix.
- **Verified after deploy:** `/` (200, serves the built app), `/vendors` deep link (200 via the SPA rewrite), and the hashed JS bundle (200). Future pushes to `main` now deploy correctly with no manual steps.
- **Known limitation (disclosed, not a bug):** the dashboard's API base defaults to `http://localhost:4000` (`dashboard/src/api.ts:1`, overridable via `VITE_API_BASE`). The orchestrator — which shells out to WSL-local `nargo`/`bb`/`stellar-cli` — is not hosted anywhere public. So the public deployment serves the full UI (landing page, all screens, animations), but the live-data screens only populate for a viewer who also has the orchestrator running locally. Making the deployed site fully live for any visitor requires hosting the orchestrator and setting `VITE_API_BASE` at build time — added to the roadmap in §8.

### 3.8 Six-feature dashboard expansion + in-app pitch deck (2026-07-03, post-deployment)

A second major dashboard pass, adding judge-facing features on top of the working system. Every feature was verified against the live orchestrator and Testnet contract by actually triggering real payments/rejections/attestations (this is why the totals in §0 jumped by 14 settled / 10 rejected during the day), with a screenshot check and a full 12/12 e2e re-run after each one. The backend was not modified at all.

1. **Proof Inspector** (`/feed`, new `ProofInspector.tsx`) — click any feed row and a slide-out panel shows what the circuit checked: the 5 constraints, the event's **real** public inputs (old/new commitments, agent nonce — straight from the proving run), real proof size, real tx hash with stellar.expert link, and a "why this is real ZK" note. For rejections: the failed constraint highlighted red plus the **actual `nargo` stderr** (e.g. `Failed constraint src/main.nr:32:12 assert(amount ≤ per_tx_cap)`); constraints after the failed one are shown as *unevaluated*, not passed, since `nargo` stops at the first failing assert. Cap/allow-list root are fetched live from `/api/policy` and labeled "(current policy)" because events don't snapshot the policy they were proved against.
2. **In-app pitch deck** (`/pitch`, new `PitchDeck.tsx`/`.css`, new topbar tab) — a 10-slide full-screen deck for presenting to judges: problem, "make the proof the gatekeeper", a CSS-built **architecture diagram** (agents → orchestrator → contract → x402, dashboard below, labeled arrows, dashed logged-hop), a **payment-flow diagram** with a red "any rule broken → no proof exists" branch, the 5 circuit constraints, a **live-numbers slide fetched from the real API every 10s** (shows an error banner if the orchestrator is down — never stale figures), demo pointers linking into the app, honest boundaries, and a close. Keyboard navigation (←/→/Space/Home/End), dots, fullscreen button.
3. **Threat demo** (`/feed`) — a "Run threat demo — real circuit enforcement" button fires three real `POST /api/pay` calls in sequence: a compliant baseline (settles on-chain), an over-cap attack, and an unlisted-vendor attack (both rejected by real `nargo` constraint failures). A staged banner (1/3→3/3) tracks progress — attempts are awaited sequentially rather than fired on a timer, so the stage indicator never lies about what's actually proving — and the completion toast counts outcomes **from the actual API responses** ("1 settled · 2 blocked by ZK circuit · 0 reached settlement"), not from assumptions.
4. **Attestation loading state + result card** (`/attestation`) — a three-step proving progress panel (snapshot → nargo/bb → testnet submit) with elapsed-seconds counter; the step highlight is time-estimated and *labeled as estimated*, since the single HTTP call reports no mid-flight progress. The result card gained a large green check header with verification timestamp, three claim rows, and a collapsible proof-details block (tx hash, proof type/size, contract ID, both commitments). The claims deliberately name the **agent**, not the fleet — the attestation circuit is per-agent, and a "total fleet spend" claim would overstate what one proof covers.
5. **Fleet Health tab** (`/console`, new `FleetHealth.tsx`, lazy-loaded) — four metric cards (total shielded value, policy compliance rate with green/amber/red thresholds, active agents, circuit rejections) refreshed every 10s from the real API; an agent risk table where **lifetime settled counts come from each agent's on-chain nonce** (it increments exactly once per settled spend) while rejections/rates are session-scoped from SSE events, with the two lifetimes explicitly labeled and "no session activity" shown instead of fabricated 0% rates; and a Chart.js bar chart of the last 20 session payments (binary pass/fail heights — amounts are never charted). The spec's "cap utilization" column was renamed "activity share" because balances are shielded and true utilization is unknowable by design.
6. **Agent drawer completion** (`/console`) — added the cap info-tooltip ("enforced on-chain by the ZK circuit… or no valid proof exists", showing the live cap value) and a "View in live feed →" link to the existing drawer.
7. **Landing live-activity ticker** (`/`) — last 5 payment events below "How it works", pushed in real time over SSE (no polling): role-badged agent → vendor (named only for rejections, "sealed vendor" for settlements) → `●●●●●●` → settled/blocked status → live-ticking age. Empty state invites starting the fleet instead of ever showing canned rows.

**Cross-cutting decisions, applied consistently:** the spec these features were built from assumed a `GET /api/payments` history endpoint that does not exist on the real orchestrator — instead of inventing one (backend off-limits) or mocking data, all history-dependent UI runs off the real SSE event stream and is explicitly labeled session-scoped. Chart.js and QRCode come from npm (real, pinned dependencies), not CDN script tags, so the app has no runtime CDN dependency; Chart.js is code-split and loads only when Fleet Health opens. All new animations are wrapped in `prefers-reduced-motion: no-preference`. No plaintext settled amount is rendered anywhere, including chart tooltips and the threat-demo banner/toast. A final keyword sweep across all dashboard source found no undisclosed mocks/placeholders/hardcodes/bypasses.

**Bugs found and fixed during this pass's own verification (all caught by screenshots, not left open):** the pitch deck's Dashboard architecture node rendered 520px *tall* (flex-basis applying to height in a column container — fixed to a width); the copy-link toast appeared to fail in headless testing but was diagnosed as the test browser's clipboard permissions, not an app bug (passes with permissions granted).

---

## 4. Live verification performed for this report

Every item below was **actually executed**, not read from documentation.

### 4.1 Test suites

| Suite | Command | Result |
|---|---|---|
| `spend_proof` circuit | `cd aegis-circuit && nargo test` | **3/3 passing** |
| `compliance_attestation` circuit | `cd aegis-attestation-circuit && nargo test` | **3/3 passing** |
| `AegisTreasury` contract | `cd aegis-contract && cargo test` | **18/18 passing** (15 unit + 3 integration against real generated proofs — see §6 for the 18th, added during this audit) |
| Orchestrator Poseidon/Merkle self-test | `cd orchestrator && npm run selftest` | **14/14 checks passing** |
| Dashboard Playwright e2e smoke test | `cd dashboard && npm run test:e2e` | **12/12 checks passing** |

### 4.2 Live end-to-end demo run

Deployed a **fresh** `AegisTreasury` instance to Stellar Testnet:

- **Contract:** `CDPFNNPOXFZLFZOJRUN6PW7LYWOIU6SLFBJZKP3BUC6YMOUIL6XB6MF6`
- **Admin:** `GAJI6KQE5UNOCCNUVUZQIUO3LEEKAIW4GI24UULONY6WN3KIUD63GQTS`
- Seeded the 5-agent / 8-vendor roster (procurement, devops, analytics, marketing, compliance agents; aws-compute, stripe-payments, twilio-communications, sendgrid-email, cloudflare-cdn, anthropic-api, openai-api, datadog-monitoring vendors).
- Ran the scripted 12-payment demo scenario. Result: **9 settled, 3 real circuit-level rejections**, exactly as scripted.

Three representative transactions from that run:

| # | Agent → Vendor | Amount | Outcome | Evidence |
|---|---|---|---|---|
| 1 | procurement-agent → aws-compute | $340 | **VERIFIED** | tx `41966beba2767da5ba5c463dfe7e90d52de069f1793f3f6934621fb75226deeb` |
| 6 | procurement-agent → aws-compute | $620 (cap $500) | **REJECTED** (over_cap) | `nargo execute` fails at `main.nr:32` — `assert(amount <= per_tx_cap)` |
| 8 | analytics-agent → shadowy-data-broker | $300 | **REJECTED** (vendor_not_allowlisted) | `nargo execute` fails at `main.nr:44` — `assert(current_hash == vendor_allowlist_root)` |

All settled-payment transactions are independently verifiable at `stellar.expert/explorer/testnet/tx/<hash>`; both rejections are genuine constraint-solver failures, not application-level `if` checks.

---

## 5. What's real vs. explicitly out of scope

**Real** (verified by this audit, not just claimed):
- Real Noir/UltraHonk proofs (`nargo` 1.0.0-beta.9 + `bb` v0.87.0), real 14,592-byte proofs, real 1,760-byte verification keys.
- Real on-chain UltraHonk verification via `rs-soroban-ultrahonk` and Protocol 26 (CAP-80) BN254 host functions.
- Every rejection shown anywhere is a genuine circuit-level constraint failure (`nargo execute` can't find a witness), including vendor-not-allowlisted cases, where the orchestrator submits a syntactically valid but wrong Merkle proof to the real circuit rather than short-circuiting in JavaScript.
- Every transaction hash shown is a real Stellar Testnet transaction.
- The orchestrator's off-chain Poseidon math is cross-verified bit-identical to the real circuit's output (14/14 selftest checks).
- The dashboard never renders a plaintext settled-payment amount.

**Explicitly out of scope** (a stated cryptographic boundary, not a shortcut):
- **Live x402/MPP facilitator integration.** The final settlement hop to a vendor's real address is, by construction, the one part of this design that must be publicly visible — like a Tornado-Cash-style privacy pool, deposits/internal transfers are private, a withdrawal to an external address reveals an amount. Aegis hides *which* agent's shielded budget funded a payment and the link between an agent's successive payments — not the literal existence of a real payment rail at the last hop. That hop is logged, not executed against a live facilitator.
- **CAP-79 muxed sub-account agent identity.** Agent identity is a plain `u64` in this build, not a muxed `M...` sub-address under the treasury's funded `G...` account.

---

## 6. Mock / placeholder / hardcode / bypass audit

A dedicated audit was run (one specialized research pass plus an independent keyword grep across `orchestrator/src`, `dashboard/src`, `aegis-contract/src`, `aegis-circuit/src`, `aegis-attestation-circuit/src` for `TODO|FIXME|HACK|XXX|stub|dummy|placeholder|not implemented|for now|hardcod|bypass|mock|fake|simulate`).

**Result: no undisclosed mocks, stubs, hardcoded proof/transaction data, or verification bypasses found.**

The only matches were legitimate:
- `dummy_vk()` in `aegis-contract/src/test.rs` — an intentionally-too-short-to-parse verification key, used only in unit tests that check the contract's *rejection* path before a real verifier call is ever reached.
- `placeholder="..."` — HTML input placeholder attributes in `TreasuryConsole.tsx` / `VendorsScreen.tsx` (normal form UX, not fake data).
- A comment in `server.ts:20` noting that agents are *no longer* auto-registered with placeholder names (i.e., a past placeholder was already removed).

The two items described in §5 as "explicitly out of scope" are the only places the system deviates from fully real/live behavior, and both are disclosed.

### 6.1 Gap found and fixed during this audit

The contract had unit tests for `NonceMismatch` and `StaleCommitment` individually, but both used a dummy/unparseable verification key — meaning they never actually exercised a real, cryptographically valid proof being replayed. There was **no test proving that a captured real proof can't be resubmitted** to drain funds a second time.

**Fix applied:** extended `aegis-contract/tests/real_proof.rs` so that, after the real 14KB UltraHonk proof settles once, the identical `(agent_id, proof, public_inputs)` is resubmitted and asserted to fail with `Error::StaleCommitment` (the commitment check runs before the nonce check in `submit_spend`'s ordering), with contract state confirmed unchanged. Ran it against the real proof fixtures — passes. Full suite re-run afterward: still 18/18.

---

## 7. Test cases defined but not yet implemented

Lower-priority gaps identified, worth adding in a follow-up pass:

- **Circuit — boundary equality:** `amount == per_tx_cap` should pass (`<=`); currently only over-cap and under-cap paths are tested.
- **Circuit — balance underflow:** `amount > old_balance` should fail the `old_balance >= amount` assert (`main.nr:30`); not currently exercised.
- **Contract — cross-agent proof reuse:** agent A's real proof submitted under agent B's `agent_id` should fail, since `agent_id` is baked into the Poseidon commitment — not currently tested.
- **Orchestrator — concurrency:** simultaneous HTTP payment requests, to verify `queue.ts`'s serialization actually prevents nonce races under load; currently asserted only by design, not tested.
- **Dashboard e2e:** doesn't yet trigger real proof generation end-to-end (already listed as a known gap in the README's own roadmap).

---

## 8. Remaining steps to consider the project fully complete

1. ~~README's live-demo section still contains a literal placeholder~~ — **resolved 2026-07-03**: the README was completely rewritten (`bec8d7a`) with Mermaid diagrams and clear structure; a grep confirms no `placeholder`/`screenshot` markers remain. The demo *video* itself is still unrecorded (the narration script exists as `DEMO_SCRIPT.md`).
2. Live x402/MPP facilitator integration for the final settlement hop (currently logged, not executed).
3. CAP-79 muxed sub-accounts for per-agent Stellar addresses.
4. Per-agent (not treasury-wide) per-transaction caps — needs a small circuit extension to carry a per-agent cap as a public input bound to `agent_id`.
5. Batched/parallel proof generation across agents — currently serialized per circuit to avoid clobbering shared `target/` build artifacts (the main bottleneck in a multi-payment demo run).
6. A fuller Playwright e2e suite covering real proof-generation and attestation-generation paths end to end, not just navigation/rendered-data assertions.
7. ~~Mobile-responsive dashboard layout~~ — addressed in the 2026-07-02 UI overhaul (§3.5): a real horizontal-overflow bug in the topbar (tabs wider than a 390px viewport) and non-stacking agent rows were found and fixed, with a proper `max-width: 480px` breakpoint added. Not exhaustively tested on physical devices, but verified via emulated-viewport screenshots on all 4 app-shell screens plus the landing page.
8. The five test cases listed in §7.
9. **Host the orchestrator so the public Vercel deployment is live for any visitor** (added 2026-07-03, see §3.7) — the deployed dashboard's API base defaults to `localhost:4000`; the orchestrator currently depends on WSL-local `nargo`/`bb`/`stellar-cli` toolchains, so making it hostable (container image with the toolchain baked in, plus `VITE_API_BASE` set at build time) is a real piece of work, not just a config change.

Items 2–7 above are exactly what the README's own "What we'd build next" section already discloses — nothing new was found beyond item 1, the test gaps in §7, and the hosting gap in item 9.

---

## 9. How to run it locally

> **As of this report, both servers are already running** (§0) — if you're on this same machine/session, just open `http://localhost:5173`. The steps below are for a clean run from scratch (e.g., after a reboot).

Requires **WSL (Ubuntu)** for the Noir/Barretenberg/Stellar toolchain; the orchestrator/dashboard run natively on Windows via `npm` and shell out to WSL automatically — confirmed installed at `~/.nargo/bin`, `~/.bb087/bin`, `~/.local/bin/stellar` inside WSL.

```bash
# 1. (Optional) Circuits + contract test suites
cd aegis-circuit && nargo test
cd ../aegis-attestation-circuit && nargo test
cd ../aegis-contract && cargo test

# 2. Orchestrator (builds + deploys a FRESH contract to Testnet, ~1-3 min,
#    real transactions -- use `npm run start`, not `npm run dev`, which
#    redeploys the whole contract on every file save)
cd ../orchestrator && npm install && npm run start   # http://localhost:4000
# wait for "Bootstrap complete" in the log, or poll GET /api/status for ready:true

# 3. In a second terminal, seed the roster (orchestrator still running)
cd orchestrator
npm run seed                                       # registers the 5-agent / 8-vendor roster
npm run demo                                       # optional: plays the 12-payment demo scenario
npm run selftest                                   # Poseidon/Merkle cross-check

# 4. In a third terminal, the dashboard
cd dashboard && npm install && npm run dev         # http://localhost:5173
npm run test:e2e                                   # real Playwright smoke test
```

Then open `http://localhost:5173/` — `/console`, `/feed`, `/vendors`, `/attestation` are the four app screens behind the landing page.

**To stop:** `Ctrl+C` in each terminal, or on Windows find the PID with `Get-NetTCPConnection -LocalPort 4000` / `5173` in PowerShell and `Stop-Process -Id <pid> -Force`.

Full toolchain install instructions (Noir 1.0.0-beta.9, Barretenberg v0.87.0, Stellar CLI v27.0.0, `jq`) are in the top-level `README.md`.

---

## 10. Judge-facing explanation (pitch script)

### 30-second version
*"AI agents on Stellar can now autonomously pay for APIs and compute — that's live infrastructure via x402/MPP, not a demo. But Stellar is a public ledger, so every payment your agent fleet makes is visible to competitors, and today's spending controls are just a contract anyone can inspect but nobody can prove wasn't tampered with. Aegis fixes both: agents spend from a hidden balance, and a real zero-knowledge proof — not an app-level check — is what decides whether a payment is even allowed to happen."*

### Concrete example to show live (from §4.2 above)
1. **Show a normal payment** — procurement-agent pays aws-compute $340. Real proof generated, real on-chain verification, real settlement tx. Amount never appears in the dashboard.
2. **Show the over-cap rejection** — same agent tries $620 against a $500 cap. `nargo execute` can't build a witness because `assert(amount <= per_tx_cap)` fails — there's no proof to even submit, so the contract never gets a chance to "reject" anything at the app level.
3. **Show the vendor-not-allowed rejection** — analytics-agent tries paying an unlisted vendor. The Merkle membership assert fails the same way.

*This is the whole pitch in three transactions: one real settlement with the amount hidden, two real circuit-level refusals — all independently checkable on stellar.expert.*

### The two "wow" moments
- **Live Sealed Feed:** payments stream in sealed (`●●●●●●`), then a green "✓ Policy proof verified on-chain" tag appears with a real tx link; one event renders red/rejected so judges see enforcement, not a rubber stamp.
- **Compliance Attestation:** one button, a real ~2-second proof generation, and a shareable QR/link stating an aggregate compliance fact an auditor can independently re-verify without touching Aegis's dashboard or database at all.

### Why it's real ZK, not a rebranded database check
Point at `aegis-circuit/src/main.nr` — the constraints are `assert()` statements inside a Noir program, compiled to an arithmetic circuit, proved with real Barretenberg, verified on-chain via Stellar's Protocol 26 (CAP-80) BN254 host functions — new infrastructure that specifically exists to make this kind of on-chain proof verification cheap enough to gate a real payment.

### Pre-empt the hardest question
*"The one thing this can't hide is the final settlement hop to the vendor's real address — like a Tornado-Cash-style privacy pool, deposits and internal transfers are private, a withdrawal to an outside address is necessarily public. We hide which agent funded a payment and the link between an agent's successive payments — not the existence of a real payment rail. That hop is logged, not wired to a live facilitator, in this build."*

### Proof-of-work to hand over if challenged
- `nargo test` — 3/3 (×2 circuits), real constraint solver.
- `cargo test` — 18/18, including a real 14KB UltraHonk proof verified on-chain in-process, and a replay-attack test proving a captured real proof can't be resubmitted.
- The live contract address from §4.2, inspectable by anyone on stellar.expert.

---

## 11. Bottom line

Every claim in the README that was checkable was verified true by actually running the code, not just reading it: all five test suites pass, the live demo behaves exactly as documented on a freshly deployed Testnet contract, and no undisclosed mocks, placeholders, hardcoded data, or verification bypasses exist anywhere in the codebase. The only gaps are the ones the project already discloses as future work, plus a placeholder screenshot line in the README and five additional test cases worth writing. One of those gaps — replay-attack coverage against a real proof — was closed during this audit.

**Post-audit update (2026-07-02):** the dashboard went through a six-part UI/animation overhaul (§3.5) covering the live feed, landing page, treasury console drawer, vendors screen, attestation card, and a global polish pass. Every change was verified live against the real running orchestrator and Testnet contract — real triggered payments, real vendor allow-list updates, real generated attestation proofs, screenshotted before and after — not just reviewed as code. The pass also caught and fixed a real, pre-existing mobile layout bug (topbar overflow at 390px) that predated this work.

**Same-day follow-up:** the landing page's hero was further upgraded by porting a provided design reference (§3.6) — a real animated WebGL shader visual, recolored to the project's own palette and paired with three accurate (not marketing-fluff) claims about what the system does. Two real integration bugs (a stale build cache, an incorrect upstream prop name) were found and fixed in the process, both confirmed via a clean e2e run afterward.

**Deployment update (2026-07-03):** the dashboard is now publicly deployed at `https://aegis-delta-gules.vercel.app` (§3.7). The initial deployment 404'd because Vercel built the monorepo root instead of `dashboard/`; fixed with a root `vercel.json` (build-into-subdirectory + SPA rewrites for React Router), verified live on the root page, deep links, and assets. The demo-video narration script was also committed (`DEMO_SCRIPT.md`), and all work through the Vercel config is pushed to `main`. The one new disclosed limitation is that the public deployment serves the UI only — its live-data screens need a locally running orchestrator until the orchestrator itself is hosted (§8 item 9).

**Feature-expansion update (2026-07-03, evening):** the dashboard gained six judge-facing features plus an in-app pitch deck (§3.8): a Proof Inspector on every feed row, a real-adversarial-attempt threat demo, a staged attestation loading state and richer result card, a Fleet Health tab (metric cards, agent risk table, Chart.js outcome chart), the agent drawer's cap tooltip and feed link, a real-time landing-page activity ticker, and a 10-slide `/pitch` deck with CSS-built architecture and payment-flow diagrams and a live-stats slide. Every feature was verified against the live system with real payments and proofs — cumulative Testnet activity now stands at **45 settled / 35 rejected / 0 violations reached settlement (80 total)** — the e2e suite passed 12/12 after each feature, and the mock/placeholder/hardcode sweep still comes back clean. The README was also fully rewritten with Mermaid diagrams (`bec8d7a`), resolving the last §8 item-1 placeholder.

**Final pre-submission state (2026-07-03, night):** the §3.8 work was committed as `f023fb1` and pushed; the Vercel redeploy was verified live (new bundle serving, `/pitch` returning 200). The working tree is clean, every test suite is passing, the deployed site and the repo are in sync, and the pitch deck, demo script, and a fact-checked submission description are ready. Nothing remains on the engineering side — the outstanding items are recording the demo video and submitting the DoraHacks form.
