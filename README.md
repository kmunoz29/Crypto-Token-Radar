# Solana Token Radar

An on-chain risk evaluation dashboard designed to analyze token security, monitor liquidity stability, and identify holder concentration vulnerabilities in real time.

---

## Overview

Solana Token Radar provides a transparent security layer for interacting with new and volatile cryptocurrency tokens. By pulling contract data and liquidity metrics directly from decentralized networks, the application evaluates risk factors and categorizes tokens into straightforward risk tiers to help users make informed decisions.

### Core Features

- **Concentration Analysis**: Tracks token holder distributions and highlights disproportionate wallet holdings and deployer allocations.
- **Liquidity Health Auditing**: Scans decentralized exchange pairs to check locked liquidity, LP token burn states, and pool depth.
- **Contract Threat Detection**: Flags risky smart contract mechanisms, including active mint capabilities, honeypot patterns, high transfer taxes, and blacklist logic.
- **Dynamic Risk Categorization**: Assigns structured risk scores (Low, Moderate, High, Critical) based on multi-factor evaluation models.

---

## Architecture & Data Flow

```text
  [ Blockchain / RPC Nodes ]        [ External Analytics APIs ]
               │                                │
               └───────────────┬────────────────┘
                               ▼
                   [ Ingestion & Normalizer ]
                               │
                               ▼
                   [ Risk Scoring Pipeline ]
             ┌─────────────────┴─────────────────┐
             ▼                                   ▼
    [ Holder Concentration ]            [ Contract Integrity ]
             │                                   │
             └─────────────────┬─────────────────┘
                               ▼
                [ Web Dashboard & Analytics UI ]
