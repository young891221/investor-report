# Codex Worktree Parallel Operating Rules

## Purpose

Provide deterministic, repeatable orchestration for running Codex CLI across multiple Git branches in parallel.

## Lifecycle Commands

1. Start parallel TUI sessions.
`skills/codex-worktree-parallel/scripts/orchestrate.sh start --base origin/main --job feature/a:"작업 A" --job feature/b:"작업 B"`

2. Check all saved sessions.
`skills/codex-worktree-parallel/scripts/orchestrate.sh status`

3. Inspect one session.
`skills/codex-worktree-parallel/scripts/orchestrate.sh status --session codexp-myrepo-20260218-103000`

4. Stop windows while keeping worktrees.
`skills/codex-worktree-parallel/scripts/orchestrate.sh stop --session codexp-myrepo-20260218-103000`

5. Remove all clean worktrees for a session.
`skills/codex-worktree-parallel/scripts/orchestrate.sh clean --session codexp-myrepo-20260218-103000`

6. Remove a subset of branches.
`skills/codex-worktree-parallel/scripts/orchestrate.sh clean --session codexp-myrepo-20260218-103000 --branch feature/a`

## Runtime Layout

- Session root: `.codex-runtime/<session>/`
- Session metadata: `.codex-runtime/<session>/session.json`
- Job metadata: `.codex-runtime/<session>/jobs/<branch-slug>.json`
- Job table: `.codex-runtime/<session>/jobs.tsv`
- Logs: `.codex-runtime/<session>/logs/<branch-slug>.log`

## Safety Rules

- Require `tmux` for parallel TUI operation.
- Create one worktree per branch with naming rule `../<repo>-wt-<branch-slug>`.
- Refuse invalid branch names (`[A-Za-z0-9._/-]+` only).
- Refuse clean while the tmux session is still running.
- Refuse dirty worktree removal; clean manually first.
- Keep cleanup manual by default.
