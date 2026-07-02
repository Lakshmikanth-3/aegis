# Aegis — Demo Video Script

*Full narration script for a screen-recorded walkthrough. Read the lines as-is or adapt them — every claim in this script was independently verified against the live running app during this project's audit, so nothing here needs to be "sold," just shown.*

---

## Before you hit record

1. Confirm both are up:
   - Orchestrator: `http://localhost:4000/api/status` → `"ready": true`
   - Dashboard: `http://localhost:5173/`
   - If either isn't running, see `PROJECT_REPORT.md` §9 for the exact restart commands.
2. Open the dashboard at **`/`** (landing page) in a clean browser window/tab — full screen, no other tabs visible.
3. Have `stellar.expert` bookmarked or ready to paste a tx hash into, for the moment you prove a transaction is real.
4. Know that your on-screen numbers (payments settled, tx hashes, Merkle roots) will differ from any numbers written in this script — that's expected and is itself proof nothing is hardcoded. Say the number you actually see.

**Total runtime: ~6 minutes for the full version. A 2-minute cut-down is marked at the end.**

---

## 1. Cold open — the hook (0:00–0:20)

*[ON SCREEN: landing page, full hero visible, animated orb visible]*

> "AI agents can now autonomously pay for APIs, data, and compute on Stellar — that's live infrastructure right now, called x402 and MPP, not a future roadmap item. But there's a problem: Stellar is a public ledger. Every payment your agent fleet makes — who it paid, how much, how often — is visible to anyone watching the chain. This is Aegis, and it fixes that without touching the payment rail itself."

---

## 2. The problem, in plain terms (0:20–0:55)

*[ON SCREEN: still landing page — point at the headline]*

> "Picture a company running a fleet of AI agents — one for procurement, one for DevOps, one for analytics — each with its own budget and its own set of approved vendors. On Stellar today, every one of those payments is a public transaction. A competitor watching the chain can reconstruct your entire vendor relationship map and spending pattern for free.
>
> And the controls you'd use to stop an agent from overspending — a per-transaction cap, an approved-vendor list — those are just values sitting in a smart contract today. Anyone can inspect them, but nobody can *prove* they were configured correctly or weren't quietly changed, without being handed the entire transaction history."

---

## 3. The solution, one sentence (0:55–1:25)

*[ON SCREEN: scroll to the "How it works" section]*

> "Aegis closes both gaps with one circuit. Every agent draws from a hidden balance — a cryptographic commitment, not a visible number. And every single payment has to come with a real zero-knowledge proof that it obeys policy — the cap, the allow-list, enough remaining balance — before the contract will let it settle.
>
> Here's the important part: a non-compliant payment isn't rejected by an `if` statement somewhere in application code. It simply has *no valid proof it can generate* — the math doesn't work out. That's the whole thesis: policy enforcement that's provable, not just promised."

*[Point at the three cards: Sealed balances / ZK policy enforcement / On-demand attestation]*

> "Sealed balances, so nothing leaks. Zero-knowledge policy enforcement, so nothing gets through that shouldn't. And on-demand attestation, so a treasury operator or auditor can get a compliance proof at any time without opening the books."

---

## 4. Architecture at a glance (1:25–1:50) — *optional, trim for a shorter cut*

> "Under the hood: an AI agent hands off a payment request — agent ID, vendor, amount — to an orchestrator. The orchestrator generates a real Noir circuit proof using the actual Barretenberg prover, `bb`. That proof goes to a Soroban smart contract on Stellar Testnet, which verifies it on-chain using Stellar's newest primitive — Protocol 26's BN254 host functions, shipped specifically to make this kind of zero-knowledge verification cheap enough to gate a real payment. Only if that verification passes does the contract update the hidden balance and let the payment through."

---

## 5. Live walkthrough

### 5a. Treasury Console (1:50–2:20)

*[ON SCREEN: click "Open treasury console"]*

> "This is the treasury console. Here's the live agent roster — procurement, DevOps, analytics, marketing, compliance — each with a role badge and an allocated budget. Notice what's *not* shown: remaining balance. Even the operator's own dashboard doesn't show that, by default — that's the shielding guarantee applied consistently, not just to outsiders."

*[Click into one agent card — drawer slides in]*

> "Clicking an agent opens its detail view — agent ID, allocated budget clearly labeled as an allocation and not a live balance, payment and violation counts for this session, and the treasury-wide policy this agent is bound by: the per-transaction cap and the vendor allow-list."

### 5b. Live Sealed Feed — the centerpiece (2:20–3:30)

*[ON SCREEN: navigate to /feed, click "Start Agent Fleet"]*

> "This is the live feed — the core of the demo. I'm about to trigger real payments. Each one is a genuine Noir proof, generated by the actual `nargo` and `bb` toolchain, and a real transaction submitted to Stellar Testnet. That's why these take real seconds, not a fake instant animation."

*[Wait for a row to arrive — narrate as it happens]*

> "Watch this row: it arrives sealed — just dots, no amount. A second later, a proof either verifies or it doesn't."

*[Point at a settled/verified row]*

> "That one settled — see the green tag, 'Policy proof verified on-chain,' with a real link to the transaction on stellar.expert. The amount never appears anywhere in this UI. Not here, not in the console, nowhere — that's the actual product, not a UI choice I could just as easily reverse."

*[If/when a rejected row appears, or trigger one manually — this is the moment that matters most]*

> "And here's a rejected one. This agent tried to pay over its per-transaction cap. Watch what happens: there's no error message from application code catching it — the Noir circuit's constraint solver simply cannot find a valid witness for these inputs. `assert(amount <= per_tx_cap)` fails inside the circuit itself. There's no proof to submit, so there's nothing for the contract to even consider. This is the same story for a payment to a vendor that isn't on the allow-list — the Merkle membership check inside the circuit fails, same mechanism, no shortcut in JavaScript pretending to be a rejection."

*[Point at the counter bar]*

> "Up top: payments settled, violations blocked, and — always — zero violations that ever reached settlement. That's the number a CFO actually cares about, with zero underlying detail leaked."

### 5c. Vendor allow-list (3:30–4:00)

*[ON SCREEN: navigate to /vendors]*

> "This is the vendor allow-list — a real depth-3 Merkle tree, up to eight vendors. This root at the top is what the smart contract has stored on-chain right now."

*[Toggle a vendor off]*

> "Watch what happens when I remove a vendor: that's a real `update_policy` transaction going to Stellar right now, and the root changes — a completely different Merkle root, because the tree was genuinely rebuilt. If I try to add a ninth vendor, it'll actually be rejected — this circuit's tree depth caps out at eight leaves, and that's a real cryptographic constraint, not a UI-imposed limit."

### 5d. Compliance Attestation — the second wow moment (4:00–5:00)

*[ON SCREEN: navigate to /attestation, pick an agent, click "Generate Compliance Attestation"]*

> "This is the second core feature. One button generates a completely different, much smaller zero-knowledge proof — one that discloses only an aggregate fact."

*[Wait ~2 seconds for the real proof to generate]*

> "That's real proving time — a couple of seconds — not a fake spinner. And here's the result: 'Total spend at or under this amount. Zero payments to non-allow-listed vendors.' A real transaction hash, verified on Stellar Testnet, and a QR code."

*[Point at "Verify independently"]*

> "Here's the part that matters most: anyone — a judge, an auditor, a regulator — can click 'Show verify command' and get the exact `stellar-cli` command to re-check this attestation themselves, against the live Stellar network, with zero access to my dashboard, my database, or any trust in me at all. That's the whole point of a compliance proof — it doesn't ask anyone to trust the tool that generated it."

---

## 6. Why this is real ZK, not a rebranded database check (5:00–5:35)

*[ON SCREEN: optionally cut to the `aegis-circuit/src/main.nr` file in an editor]*

> "If there's one thing to remember from this demo: the constraints you just watched enforce themselves are literal `assert` statements inside a Noir program, compiled down to an arithmetic circuit, proved with real Barretenberg, and verified on-chain using Stellar's Protocol 26 BN254 host functions — infrastructure that shipped only weeks before this was built, specifically to make this kind of on-chain zero-knowledge verification cheap enough to gate a real payment instead of just being a research curiosity."

*[Optional: mention test coverage]*

> "Every layer of this has real, passing tests — the circuits, the smart contract including a real 14-kilobyte UltraHonk proof verified in-process, and an end-to-end Playwright suite driving the actual browser against the actual running app."

---

## 7. Say the limitation before anyone asks (5:35–6:00)

> "One honest limitation, stated up front because it's a real cryptographic boundary, not a shortcut I took: the very last hop — the actual transfer to a vendor's real Stellar address — has to be publicly visible by construction, the same way a Tornado-Cash-style privacy pool keeps internal transfers private but a withdrawal to an outside address reveals an amount. What Aegis hides is *which* agent's shielded budget funded a payment, and the link between that agent's successive payments — not the mere existence of a real payment rail at the very end. In this build, that final settlement hop is logged, not wired to a live x402 facilitator yet."

---

## 8. Closing line (6:00–6:15)

*[ON SCREEN: back to the landing page]*

> "Your agents pay in the open. What they spent, and why it was allowed, stays between you and the proof."

*[End recording]*

---

## The 2-minute cut

If you only have two minutes, keep sections **1, 3, 5b (feed), 7, and 8** — the hook, the one-sentence solution, the live feed with one pass and one rejection, the honest limitation, and the closing line. That's the entire pitch in its smallest form, and it's still backed end-to-end by real proofs and real transactions, not a script pretending to be one.
