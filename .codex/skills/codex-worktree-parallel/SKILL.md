---
name: codex-worktree-parallel
description: Orchestrate parallel Codex CLI workflows across multiple Git branches using `git worktree` and `tmux`. Use when the user asks to run Codex on several branches at once, set up branch-specific working directories, standardize session and log naming, stop parallel sessions, or clean up worktrees safely.
---

# Codex Worktree Parallel

## Overview

Automate multi-branch Codex execution with repeatable commands.
Use `scripts/orchestrate.sh` to create worktrees, launch parallel Codex sessions, inspect status, and clean up safely.

## Workflow

1. Validate prerequisites.
- Require `git`, `tmux`, `codex`, and `python3`.
- Run from inside the target Git repository.

2. Start a parallel session.
- Run:
  - `skills/codex-worktree-parallel/scripts/orchestrate.sh start --base <ref> --job <branch>:<prompt> [--job ...] [--session <name>]`
- Default session name rule: `codexp-<repo>-<yyyyMMdd-HHmmss>`.
- Worktree path rule: `../<repo>-wt-<branch-slug>`.
- Runtime metadata and logs: `.codex-runtime/<session>/`.

3. Check running status.
- Run:
  - `skills/codex-worktree-parallel/scripts/orchestrate.sh status`
  - `skills/codex-worktree-parallel/scripts/orchestrate.sh status --session <name>`

4. Stop parallel Codex windows.
- Run:
  - `skills/codex-worktree-parallel/scripts/orchestrate.sh stop --session <name>`
- This stops `tmux` windows but does not remove worktrees.

5. Clean worktrees manually.
- Run:
  - `skills/codex-worktree-parallel/scripts/orchestrate.sh clean --session <name>`
  - `skills/codex-worktree-parallel/scripts/orchestrate.sh clean --session <name> --branch <branch>`
- Cleanup refuses dirty worktrees by default.

## Guardrails

- Keep cleanup manual as the default lifecycle policy.
- Use `tmux` for TUI parallelism; do not rely on GUI terminal automation.
- Keep branch validation strict: `[A-Za-z0-9._/-]+`.
- Do not remove worktrees that contain uncommitted changes.

## References

- Operational details and command examples: `references/operating-rules.md`
