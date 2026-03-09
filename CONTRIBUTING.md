# Contributing to Project Zeno

Thank you for your interest in contributing to Project Zeno — the world's first blockchain-based industrial effluent compliance platform.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/zeno.git`
3. Copy `.env.example` to `.env` and fill in your credentials
4. Install dependencies: `npm install`
5. Build all packages: `npx turbo run build`
6. Run the dev server: `npm run dev -w apps/web`

## Development

### Monorepo Structure

This project uses **npm workspaces** with **Turborepo** for build orchestration.

| Package | Description |
|---------|-------------|
| `apps/web` | Next.js 16 dashboard (3 portals: regulator, industry, public) |
| `packages/blockchain` | Hedera SDK wrappers (HCS, HTS, KMS signer, Mirror Node) |
| `packages/simulator` | OCEMS sensor data generator |
| `packages/contracts` | Solidity smart contracts (ComplianceChecker, PenaltyCalculator) |
| `packages/agent` | AI compliance agent (Hedera Agent Kit + LangChain) |
| `packages/satellite` | Sentinel-2 water quality API (Python/FastAPI) |

### Commands

```bash
npx turbo run build      # Build all packages
npx turbo run test       # Run all tests
npx turbo run lint       # Lint all packages
npm run dev -w apps/web  # Start dashboard dev server
```

### Branch Naming

- `feat/<description>` — New features
- `fix/<description>` — Bug fixes
- `docs/<description>` — Documentation

### Commit Messages

Use concise, descriptive commit messages. Focus on the "why" over the "what".

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure `npx turbo run build` and `npx turbo run test` pass
4. Open a PR with a clear description

## Code of Conduct

Be respectful, constructive, and inclusive. We're building technology to protect rivers — let's protect each other too.

## Questions?

Open an issue or reach out to the maintainers.
