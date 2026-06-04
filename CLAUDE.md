# Claude Code Instructions

This repository ships a skill. Read `SKILL.md` first when deciding how to use
it.

Installing the skill is file-only: clone or copy this repository into the skill
location and do not run `npm install` during installation. Runtime dependencies
are only needed when executing `scripts/router-cli.ts`.

For any live run, start with:

```bash
npx ts-node scripts/router-cli.ts discover
```

Only run `allocate` or `withdraw` after the user explicitly asks to move funds.
Keep `.env` private and never commit it.
