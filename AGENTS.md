# Agent Instructions

This repository is a Codex/agent skill package for the Pharos RWA Yield Router.

## Install Behavior

- Treat `SKILL.md` as the skill entry point.
- If the user says "install this skill", "install the Pharos RWA Yield Router
  skill", or gives this repository URL as a skill, interpret that as a file-only
  skill installation request.
- Installing the skill means cloning/copying this repository into the agent's
  skills directory.
- Do not run `npm install` as part of skill installation unless the user
  explicitly asks to execute the CLI or install runtime dependencies.
- Do not create or commit `.env`; `.env` is intentionally ignored.
- Install runtime dependencies only when the user asks to execute or verify the
  CLI locally.

## Runtime Behavior

- Run `npx ts-node scripts/router-cli.ts discover` before any write action.
- Use read-only commands for exploration: `discover`, `drag`, `risk`, `position`.
- Use write commands only after the user clearly asks to deposit or withdraw:
  `allocate`, `withdraw`.
- Never invent APY, oracle prices, tx hashes, or verification status.
