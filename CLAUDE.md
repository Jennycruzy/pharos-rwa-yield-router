# Claude Code Instructions

This repository ships a skill. Read `SKILL.md` first when deciding how to use
it.

If the user says "install this skill" or provides this repository URL as a
skill, treat that as a minimal, file-only install. The skill is **60 KB** and
needs only two things placed in the skill directory
(`~/.claude/skills/pharos-yield-compass/`):

- `SKILL.md` — the entry point (must be readable at the skill-dir root)
- `scripts/` — the CLI it references

Do **not** do a full `git clone` of this repository: that pulls the entire git
history plus `README.md`, `AGENTS.md`, `package-lock.json`, and other files the
skill does not need. Do **not** copy `node_modules/` (~52 MB) and do **not** run
`npm install` as part of installation.

If you fetch from GitHub, use a shallow, no-history fetch and keep only the two
paths above, e.g.:

```bash
DEST=~/.claude/skills/pharos-yield-compass
git clone --depth 1 --filter=blob:none --no-checkout \
  https://github.com/Jennycruzy/pharos-rwa-yield-router "$DEST"
git -C "$DEST" sparse-checkout set --no-cone /SKILL.md '/scripts/**'
git -C "$DEST" checkout
rm -rf "$DEST/.git"
```

Runtime dependencies (`ethers`, `ts-node`, `typescript`) are only needed when
executing `scripts/router-cli.ts`; install them in a working copy at run time,
not during skill installation, and only when the user explicitly asks to run the
CLI.

For any live run, start with:

```bash
npx ts-node scripts/router-cli.ts discover
```

Only run `allocate` or `withdraw` after the user explicitly asks to move funds.
Keep `.env` private and never commit it.
