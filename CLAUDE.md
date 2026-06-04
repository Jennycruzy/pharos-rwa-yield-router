# Claude Code Instructions

This repository ships a skill. Read `SKILL.md` first when deciding how to use
it.

If the user says "install this skill" or provides this repository URL as a
skill, treat that as a file-only install request. Clone or copy this repository
into the skill location so `SKILL.md` is readable. Runtime dependencies are only
needed when executing `scripts/router-cli.ts`; do not install them during skill
installation unless the user explicitly asks.

For any live run, start with:

```bash
npx ts-node scripts/router-cli.ts discover
```

Only run `allocate` or `withdraw` after the user explicitly asks to move funds.
Keep `.env` private and never commit it.
