# HumanGov CRE Workflows

This directory is a real Chainlink CRE project with two production-focused workflows:

- `workflows/verify-human`: HTTP trigger -> confidential World ID verification -> on-chain dedupe read -> report write -> registry + CCIP propagation.
- `workflows/expiry-monitor`: cron trigger -> on-chain event/log scan -> expiry checks -> optional on-chain revocations.

## Setup

```bash
cd /Users/ginmax/Downloads/human-gov-main/cre-workflow
cp .env.example .env
cp secrets.yaml.example secrets.yaml
bun install
```

## Configure workflow artifacts

Update the following values before simulation/deployment:

- `workflows/verify-human/config.*.json`
  - `evm.registryAddress`
  - `evm.receiverAddress`
- `workflows/expiry-monitor/config.*.json`
  - `evm.registryAddress`
  - `evm.receiverAddress`

## Local tests

```bash
bun test
```

## CRE simulation commands

```bash
# Verification workflow (HTTP trigger)
cre workflow simulate workflows/verify-human \
  --target local-simulation \
  --trigger-index 0 \
  --non-interactive \
  --http-payload @workflows/verify-human/payloads/verify.request.json

# Expiry monitor workflow (cron trigger)
cre workflow simulate workflows/expiry-monitor \
  --target local-simulation \
  --trigger-index 0 \
  --non-interactive
```

If simulation fails with `authentication required`, run `cre login` in an environment with network access.
