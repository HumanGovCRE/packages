# HumanGov

Sybil-resistant DAO governance with **World ID**, **Chainlink CRE**, and **CCIP**.

HumanGov enforces **one-human-one-vote** by registering unique World ID nullifiers on Ethereum Sepolia and propagating verified status to Base Sepolia for governance.

---

## Table of Contents

- [What HumanGov Solves](#what-humangov-solves)
- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start (Local + Testnets)](#quick-start-local--testnets)
- [Environment Configuration](#environment-configuration)
- [Deployment Guide](#deployment-guide)
- [CRE Workflow Guide](#cre-workflow-guide)
- [Frontend Guide](#frontend-guide)
- [Operational Runbooks](#operational-runbooks)
- [Testing](#testing)
- [Contract Reference](#contract-reference)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Roadmap Ideas](#roadmap-ideas)
- [License](#license)

---

## What HumanGov Solves

Traditional token or wallet-based governance is vulnerable to Sybil attacks (one person controlling many wallets). HumanGov introduces a personhood layer:

1. User proves uniqueness with World ID.
2. Chainlink CRE validates proof via Confidential HTTP.
3. `HumanRegistry` stores nullifier-based verification on Sepolia.
4. Chainlink CCIP propagates status cross-chain.
5. `HumanGovDAO` on Base Sepolia enforces one-human-one-vote.

No biometric or personal data is stored on-chain.

---

## System Architecture

```text
User Wallet + World App
        │
        ▼
Frontend (Next.js)
        │  POST verification payload
        ▼
CRE verify-human workflow
  ├─ validates payload + level
  ├─ calls World ID verify API (Confidential HTTP)
  ├─ checks duplicate nullifier on HumanRegistry
  └─ writeReport -> HumanGovCREReceiver
                    │
                    ▼
            HumanRegistry (Sepolia)
              ├─ registerVerification
              └─ propagateToChainWithLink (CCIP)
                    │
                    ▼
              HumanGovDAO (Base Sepolia)
              ├─ receives ccipReceive
              └─ enables proposal/vote for verified humans
```

### Verification Lifecycle

- Verification validity window: **180 days** (`VERIFICATION_DURATION`).
- Expiry monitor workflow scans `HumanVerified` events and can auto-revoke expired nullifiers.
- Revoked or expired verification removes voting eligibility.

---

## Core Components

### On-chain Contracts

- `HumanRegistry.sol` (Sepolia)
  - Stores nullifier↔wallet mappings and expiries.
  - Restricts registration to authorized CRE receiver.
  - Supports CCIP propagation with native ETH or LINK fee paths.
- `HumanGovCREReceiver.sol` (Sepolia)
  - Receives DON-signed reports via `onReport`.
  - Executes register/revoke against `HumanRegistry`.
  - Optional metadata checks: expected workflow owner/name.
- `HumanGovDAO.sol` (Base Sepolia)
  - Receives human status via `ccipReceive` from router.
  - Allows only verified humans to create proposals and vote.
  - Enforces one vote per nullifier per proposal.

### Off-chain Workflows (`cre-workflow/`)

- `verify-human`
  - HTTP trigger.
  - Calls World ID verify endpoint with secret API key.
  - Produces `ACTION_REGISTER` report and writes to receiver.
- `expiry-monitor`
  - Cron trigger.
  - Scans recent `HumanVerified` logs.
  - Optionally writes `ACTION_REVOKE` reports for expired records.

### Frontend (`frontend/`)

- `/` landing page.
- `/verify` verification flow with World ID widget.
- `/dao` proposal listing + filtering.
- `/dao/[id]` proposal details, voting, finalization.
- `/admin` owner utilities for CRE and CCIP config.

---

## Repository Layout

```text
.
├── contracts/
│   ├── HumanRegistry.sol
│   ├── HumanGovCREReceiver.sol
│   ├── HumanGovDAO.sol
│   ├── interfaces/IReceiver.sol
│   └── mocks/
├── cre-workflow/
│   ├── workflows/verify-human/
│   ├── workflows/expiry-monitor/
│   ├── tests/
│   ├── project.yaml
│   └── secrets.yaml.example
├── frontend/
│   ├── app/
│   ├── components/
│   └── lib/
├── scripts/
│   ├── deploy.ts
│   ├── check-env.ts
│   ├── demo-setup.ts
│   └── e2e-test.ts
├── test/HumanGov.test.ts
├── hardhat.config.ts
└── package.json
```

---

## Prerequisites

- Node.js 20+
- npm 10+
- Bun (for CRE workspace tests/simulation scripts)
- Hardhat (via local dependency, no global required)
- CRE CLI (`cre`) authenticated for deployment/simulation
- Wallet funded on Sepolia and Base Sepolia
- World ID app + API credentials

Optional but recommended:

- Etherscan + Basescan API keys for verification
- Dedicated deploy key and separate CRE simulation key

---

## Quick Start (Local + Testnets)

### 1) Install dependencies

```bash
npm install
cd cre-workflow && bun install
cd ../frontend && npm install
cd ..
```

Or use bootstrap:

```bash
npm run bootstrap
```

### 2) Configure environment

```bash
cp .env.example .env
cp cre-workflow/.env.example cre-workflow/.env
cp cre-workflow/secrets.yaml.example cre-workflow/secrets.yaml
cp frontend/.env.example frontend/.env.local
```

Fill values, then validate:

```bash
npm run check-env
```

### 3) Compile + test

```bash
npx hardhat compile
npm run test:all
```

### 4) Deploy contracts

```bash
npm run deploy:sepolia
npm run deploy:base
```

### 5) Start frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

---

## Environment Configuration

### Root `.env`

| Variable | Required | Purpose |
|---|---:|---|
| `PRIVATE_KEY` | ✅ | Hardhat deployer/private signer |
| `SEPOLIA_RPC_URL` | ✅ | Sepolia RPC endpoint |
| `BASE_SEPOLIA_RPC_URL` | ✅ | Base Sepolia RPC endpoint |
| `ETHERSCAN_API_KEY` | ➖ | Contract verification |
| `BASESCAN_API_KEY` | ➖ | Contract verification |
| `WORLD_ID_APP_ID` | ✅ | World ID app id (`app_...`) |
| `WORLD_ID_ACTION` | ✅ | Frontend/workflow action name |
| `WORLDCOIN_API_KEY` | ✅ | World ID backend API key |
| `CHAINLINK_CRE_DON_ID` | ✅ | CRE DON identifier |
| `CRE_ETH_PRIVATE_KEY` | ✅ | CRE write/simulation private key |
| `CRE_FORWARDER_ADDRESS` | ➖ | Optional trusted forwarder for receiver |

### `cre-workflow/.env`

| Variable | Required | Purpose |
|---|---:|---|
| `WORLDCOIN_API_KEY` | ✅ | Used by Confidential HTTP |
| `CRE_ETH_PRIVATE_KEY` | ✅ | Used for report writes |

### `frontend/.env.local`

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_WLD_APP_ID` | ✅ | World ID widget app id |
| `NEXT_PUBLIC_WLD_ACTION` | ✅ | Widget action (must match configured action) |
| `NEXT_PUBLIC_CRE_ENDPOINT` | ✅ | Verify endpoint URL |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | ✅ | `HumanRegistry` address |
| `NEXT_PUBLIC_DAO_ADDRESS` | ✅ | `HumanGovDAO` address |
| `NEXT_PUBLIC_CHAIN_ID` | ✅ | Source chain id (`11155111`) |
| `NEXT_PUBLIC_TARGET_CHAIN_ID` | ✅ | Target chain id (`84532`) |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | ✅ | Read-only status checks |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | ✅ | Read-only status checks |

---

## Deployment Guide

### Network constants used by this repo

- Sepolia CCIP Router: `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59`
- Base Sepolia CCIP Router: `0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93`
- Sepolia LINK: `0x779877A7B0D9E8603169DdbD7836e478b4624789`
- Base Sepolia chain selector: `10344971235874465080`

### Contract deployment

Run:

```bash
npm run deploy:sepolia
npm run deploy:base
```

The deployment script writes:

- `deployments/addresses.json`
- `frontend/.env.local` updates for addresses
- `cre-workflow/.env` updates for addresses/selectors

### Post-deploy owner setup checklist

1. Ensure `HumanRegistry.authorizedCREWorkflow` is set to deployed `HumanGovCREReceiver`.
2. Ensure target receiver mapping is set:
   - `setTargetChainReceiver(10344971235874465080, DAO_ADDRESS)`
3. Ensure registry has enough LINK for `propagateToChainWithLink`.
4. Optionally set `CRE_FORWARDER_ADDRESS` and workflow metadata validation on receiver.

---

## CRE Workflow Guide

### Verify-human workflow

Location: `cre-workflow/workflows/verify-human/`

Main behavior:

- Parses and validates payload.
- Enforces app/action consistency and minimum verification level.
- Calls World ID verify endpoint via Confidential HTTP.
- Checks duplicate nullifier on `HumanRegistry`.
- Optionally estimates LINK propagation fee.
- Emits signed report payload:

```text
(uint8 action, bytes32 nullifier, address wallet, uint64 destinationChainSelector, bool propagate)
```

With register action:

- `action = 1`
- `propagate = true`

### Expiry-monitor workflow

Location: `cre-workflow/workflows/expiry-monitor/`

Main behavior:

- Runs on cron schedule.
- Scans recent `HumanVerified` logs.
- Reads expiry per nullifier from registry.
- Counts expired and expiring-soon records.
- Optionally sends revoke reports (`action = 2`) with max-per-run guard.

### Local simulation

From repo root:

```bash
npm run cre:simulate:verify
npm run cre:simulate:expiry
```

or directly in `cre-workflow`:

```bash
cre workflow simulate workflows/verify-human \
  --target local-simulation \
  --trigger-index 0 \
  --non-interactive \
  --http-payload @workflows/verify-human/payloads/verify.request.json

cre workflow simulate workflows/expiry-monitor \
  --target local-simulation \
  --trigger-index 0 \
  --non-interactive
```

If you see auth errors, run:

```bash
cre login
```

---

## Frontend Guide

### Run

```bash
cd frontend
npm run dev
```

### User flow

1. Connect wallet on `/verify`.
2. Complete World ID verification.
3. Wait for on-chain registration + cross-chain propagation.
4. Go to `/dao` to create or vote on proposals.

### Admin flow (`/admin`)

- Set authorized CRE workflow address.
- Set target chain receiver address.
- Manually trigger `propagateToChain` for a nullifier.

Use with owner wallet only.

---

## Operational Runbooks

### A) Full smoke run (recommended before demo)

```bash
npm run check-env
npx hardhat compile
npx hardhat test
cd cre-workflow && bun test && cd ..
npm run deploy:sepolia
npm run deploy:base
```

### B) End-to-end script (local hardhat style)

```bash
npx hardhat run scripts/e2e-test.ts
```

This script deploys mocks/contracts, simulates registration + CCIP delivery, and validates governance lifecycle.

### C) Demo data bootstrap

```bash
npm run demo:setup
```

Creates mock verification records and attempts sample proposals.

---

## Testing

### Root contract tests

```bash
npx hardhat test
```

Coverage includes:

- Registry registration, duplicate protection, authorization
- Native + LINK propagation fee paths
- CRE receiver report processing and metadata validation
- DAO human gating, single-vote enforcement, proposal finalization

### CRE workflow tests

```bash
cd cre-workflow
bun test
```

### Combined test command

```bash
npm run test:all
```

---

## Contract Reference

### `HumanRegistry`

Important functions:

- `registerVerification(bytes32,address)`
- `revokeVerification(bytes32)`
- `propagateToChain(bytes32,uint64)` (native fee)
- `propagateToChainWithLink(bytes32,uint64)` (LINK fee)
- `quotePropagationFeeNative(bytes32,uint64)`
- `quotePropagationFeeInLink(bytes32,uint64)`
- `setAuthorizedCREWorkflow(address)`
- `setTargetChainReceiver(uint64,address)`
- `isHuman(address)`
- `getVerification(address)`

### `HumanGovCREReceiver`

Important functions:

- `onReport(bytes metadata, bytes report)`
- `setForwarderAddress(address)`
- `setExpectedWorkflowOwner(address)`
- `setExpectedWorkflowName(bytes10)`

Actions encoded in report:

- `1` = register
- `2` = revoke

### `HumanGovDAO`

Important functions:

- `ccipReceive(Any2EVMMessage)`
- `createProposal(string,string,uint256)`
- `vote(uint256,bool)`
- `finalizeProposal(uint256)`
- `isHuman(address)`
- `getProposal(uint256)`
- `getHumanStatus(address)`

---

## Security Model

- **No PII on-chain**: only nullifier hashes and expiry metadata.
- **Single-human voting**: vote tracking keyed by nullifier per proposal.
- **Auth boundaries**:
  - Only authorized CRE receiver can register in registry.
  - Receiver can restrict `onReport` sender via forwarder.
  - Optional workflow owner/name metadata checks.
- **Expiry controls**: human status expires after 180 days and can be revoked.
- **Secret handling**: Worldcoin API key accessed via CRE secret + Confidential HTTP.

### Operational security recommendations

- Use separate keys for deployer, CRE write signer, and admin ops.
- Monitor LINK balance on registry to prevent propagation failures.
- Set non-zero `forwarderAddress` in production.
- Restrict owner key exposure; use multisig for ownership if possible.

---

## Troubleshooting

### `NotAuthorized` on registry writes

- Verify `authorizedCREWorkflow` is the deployed receiver.
- Confirm `onReport` is being called by allowed forwarder (if configured).

### `InsufficientLinkBalance` on propagation

- Fund `HumanRegistry` with Sepolia LINK.
- Re-check quoted fee using `quotePropagationFeeInLink`.

### Verification succeeds in World ID but not on-chain

- Confirm workflow config addresses (`registryAddress`, `receiverAddress`).
- Check CRE simulation/deployment target config and DON auth.
- Ensure payload app/action match workflow config constraints.

### User verified on Sepolia but not on Base Sepolia

- Confirm `setTargetChainReceiver` mapping for Base chain selector.
- Check CCIP message status and router configuration.
- Verify DAO `ccipRouter` points to Base Sepolia CCIP router.

### Frontend shows wallet as unverified

- Confirm `NEXT_PUBLIC_CONTRACT_ADDRESS` and `NEXT_PUBLIC_DAO_ADDRESS` are correct.
- Confirm public RPC URLs are reachable.
- Wait for propagation latency and refresh status.

---

## Roadmap Ideas

- Multi-chain DAO fanout beyond Base Sepolia.
- Proposal execution module for passed votes.
- Delegation model with human-only delegate constraints.
- On-chain governance parameter tuning (quorum, durations).
- Observability dashboard for verification and CCIP events.

---

## License

MIT
