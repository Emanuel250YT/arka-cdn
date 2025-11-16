## MILESTONE 2 PLAN: Arka CDN  
**Team:** Arka-Pol  
**Track:** [x] SHIP-A-TON &nbsp;&nbsp; [ ] IDEA-TON  
**Date:** 2025-11-16

---

## 📍 WHERE WE ARE NOW

**What we built/validated this weekend:**
- NestJS API that ingests files, compresses assets, and pins chunks to Arkiv Network with Prisma persistence.
- Hardhat + Viem toolchain to deploy the Storage.sol contract on Paseo TestNet using our SubWallet-exported private key.
- Wallet pool / JWT auth flows that keep uploads parallelized and auditable from Swagger + API docs.

**What's working:**
- End-to-end upload pipeline with DASH transcoding disabled/enabled per file and resumable chunking.
- Paseo network read endpoints (network health + retrieve()) wired into the backend with automatic RPC fallbacks.
- Multi-wallet queue running in round-robin mode so Arkiv transactions do not bottleneck.

**What still needs work:**
- SubWallet-only connection UX so every signer (web + backend) stays in sync with the SubWallet extension.
- Better monitoring around PAS gas usage and auto-funding alerts for the Paseo private key.
- Finishing touches on the public file viewer so creators can embed DASH manifests directly.

**Blockers or hurdles we hit:**
- Limited faucet throughput on Paseo delays repeated deploys when testing compression cycles.
- DASH encoding is CPU-heavy on laptops; need autoscaling guidance for the transcoding workers.
- Coordinating SubWallet connection state across browser + backend sessions still requires glue code.

---

## 🚀 WHAT WE'LL SHIP IN 30 DAYS

**Our MVP will do this:**  
Arka CDN will let SubWallet-authenticated creators upload long-form video or metadata files, convert them into adaptive DASH renditions, and persist payloads on Arkiv with an on-chain receipt stored in Paseo Hub. Operators can prove storage with the Storage.sol contract and programmatic hashes.

### Features We'll Build (3-5 max)

**Week 1-2:**
- Feature: SubWallet-only session flow (extension detection, message signing, and private RPC hand-off).
- Why it matters: Guarantees every contract call and dashboard action uses the sanctioned wallet profile without mixing MetaMask accounts.
- Who builds it: Leo C. (Protocol/DevOps)

**Week 2-3:**
- Feature: Storage contract events indexer that mirrors NumberUpdated logs into Prisma for audit + analytics.
- Why it matters: Lets reviewers trace which upload resulted in which on-chain write and cross-check block explorer entries.
- Who builds it: Emanuel G. (Backend)

**Week 3-4:**
- Feature: DASH player + public gateway that streams Arkiv-hosted content with signed SubWallet sessions for gated assets.
- Why it matters: Demonstrates the playback experience for creators plus enforces wallet-based entitlements.
- Who builds it: Sofia M. (Frontend/Streaming)

*(Add more if needed, max 5 total)*

### Team Breakdown (if applicable)

**Leo C. – Protocol & DevOps** | 25 hrs/week – Owns: SubWallet integration, contract deployments, gas strategy.  
**Emanuel G. – Backend Lead** | 30 hrs/week – Owns: Nest services, Prisma schema, Arkiv multi-wallet orchestration.  
**Sofia M. – Frontend & Media** | 20 hrs/week – Owns: DASH viewer, upload UX, gated access flows.

### Mentoring & Expertise We Need

**Areas where we need support:**
- Advice on best practices for SubWallet-only authentication patterns in production.
- Guidance on scaling FFmpeg workers + storage pricing on Arkiv for multi-GB libraries.

**Specific expertise we're looking for:**
- Polkadot Hub gas estimation + RPC reliability tuning for Paseo deployments.
- Media streaming QA to validate DASH manifests across browsers.

---

## 🎯 WHAT HAPPENS AFTER

**When M2 is done, we plan to...**
- Open an invite-only beta with 10 creators uploading long-form educational video and JSON metadata packs.
- Publish a public dashboard showing upload stats, PAS spend, and contract proofs per asset.

**And 6 months out we see our project achieve:**
- Fully automated SubWallet-gated CDN nodes operating across three regions with on-demand autoscaling.
- Deep integrations with Subsocial/Polkadot parachains so apps can request Arka storage via simple API keys.

---

✅ Be specific: "Add SubWallet session gating" instead of "Improve auth"  
✅ Be realistic: 3 core features over 30 days with clear owners  
✅ Show you've thought it through: Weekly breakdown + support needs  
✅ Prioritize ruthlessly: Focus on wallet connection, on-chain logging, and playback  
✅ Identify support you need: RPC/gas + streaming QA experts

❌ Be vague: "Finish everything" is not a plan  
❌ Be overambitious: Shipping 10+ features is risky in 30 days  
❌ Ignore capacity: Each owner committed specific hours  
❌ Skip risks: We call out faucet + transcoding constraints  
❌ Forget the why: Every feature includes why it matters
