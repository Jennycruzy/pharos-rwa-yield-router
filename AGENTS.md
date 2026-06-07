# Agent Instructions

This repository is a Codex/agent skill package for the Pharos Yield Compass
(machine name `pharos-yield-compass`) — a Pharos lending router with RWA-vault
intelligence. (The git repository is still named `pharos-rwa-yield-router`.)

## Install Behavior

- Treat `SKILL.md` as the skill entry point.
- If the user says "install this skill", "install the Pharos Yield Compass
  skill", or gives this repository URL as a skill, interpret that as a minimal,
  file-only skill installation request.
- Installing the skill means placing only `SKILL.md` and `scripts/` into the
  agent's skills directory (`~/.claude/skills/pharos-yield-compass/`). The
  whole payload is ~60 KB.
- Do **not** do a full `git clone` of this repository (it pulls the entire git
  history and repo-only files like `README.md`, `AGENTS.md`, and
  `package-lock.json` that the skill does not need). If fetching from GitHub, do
  a shallow + sparse checkout limited to `SKILL.md` and `scripts/`, then remove
  the `.git` directory.
- Do **not** copy `node_modules/` (~52 MB) and do **not** run `npm install` as
  part of skill installation unless the user explicitly asks to execute the CLI
  or install runtime dependencies.
- Do not commit `.env`; `.env` is intentionally ignored. For wallet-dependent
  CLI commands, if `PRIVATE_KEY` is missing and no `--address` was supplied, it
  is acceptable to create `.env` from `.env.example` so the user can fill it and
  retry. Never invent or log a private key.
- Install runtime dependencies only when the user asks to execute or verify the
  CLI locally.
- Before executing any `npx ts-node scripts/router-cli.ts ...` command, check
  whether `node_modules/` exists. If it is missing, run `npm install` first;
  otherwise `npx` may stall while resolving `ts-node` during the demo.
- All router CLI commands require live Pharos/OpenFi RPC access. In Codex or any
  sandboxed agent environment, request network/escalated access before running
  `npx ts-node scripts/router-cli.ts ...`; do not run it once in the restricted
  sandbox just to observe DNS/RPC failure.

## Runtime Behavior

- Before the first CLI run, ensure runtime dependencies are installed with
  `npm install` if `node_modules/` is missing.
- Run `npx ts-node scripts/router-cli.ts discover` with network access before
  any write action.
- Use read-only commands for exploration: `discover`, `drag`, `risk`, `position`.
- If `discover` returns `read-error` for every reserve, treat it as an RPC or
  sandbox network failure and do not answer from pAlpha or historical docs
  alone.
- Use write commands only after the user clearly asks to deposit or withdraw:
  `allocate`, `withdraw`.
- Never invent APY, oracle prices, tx hashes, or verification status.
