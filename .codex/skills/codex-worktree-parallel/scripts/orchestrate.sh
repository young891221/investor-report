#!/usr/bin/env bash
set -euo pipefail

RUNTIME_ROOT=".codex-runtime"

info() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  orchestrate.sh start --base <ref> --job <branch>:<prompt> [--job ...] [--session <name>]
  orchestrate.sh status [--session <name>]
  orchestrate.sh stop --session <name>
  orchestrate.sh clean --session <name> [--branch <name> ...]

Examples:
  orchestrate.sh start --base origin/main --job feature/a:"task A" --job feature/b:"task B"
  orchestrate.sh status --session codexp-myrepo-20260218-103000
  orchestrate.sh stop --session codexp-myrepo-20260218-103000
  orchestrate.sh clean --session codexp-myrepo-20260218-103000 --branch feature/a
EOF
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
}

get_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || return 1
}

slugify() {
  local raw="$1"
  local slug
  slug="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's|[^a-z0-9._-]+|-|g; s/^-+//; s/-+$//; s/-+/-/g')"
  if [ -z "$slug" ]; then
    slug="branch"
  fi
  printf '%s\n' "$slug"
}

validate_branch_name() {
  local branch="$1"
  if [[ ! "$branch" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    die "Invalid branch name '$branch'. Allowed pattern: [A-Za-z0-9._/-]+"
  fi
}

in_array() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [ "$item" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

parse_job_arg() {
  local raw="$1"
  local branch prompt
  branch="${raw%%:*}"
  prompt="${raw#*:}"

  if [ "$branch" = "$raw" ]; then
    die "Invalid --job '$raw'. Format must be <branch>:<prompt>."
  fi
  if [ -z "$branch" ]; then
    die "Invalid --job '$raw'. Branch is empty."
  fi
  if [ -z "$prompt" ]; then
    die "Invalid --job '$raw'. Prompt is empty."
  fi

  PARSED_JOB_BRANCH="$branch"
  PARSED_JOB_PROMPT="$prompt"
}

build_codex_command() {
  local worktree_dir="$1"
  local prompt="$2"
  local log_file="$3"
  local q_worktree q_prompt q_log

  printf -v q_worktree '%q' "$worktree_dir"
  printf -v q_prompt '%q' "$prompt"
  printf -v q_log '%q' "$log_file"
  printf 'codex -C %s %s 2>&1 | tee -a %s' "$q_worktree" "$q_prompt" "$q_log"
}

write_job_json() {
  local out_file="$1"
  local session_name="$2"
  local branch="$3"
  local slug="$4"
  local worktree_dir="$5"
  local prompt="$6"
  local log_file="$7"
  local window_name="$8"
  local status="$9"
  local created_at="${10}"
  local created_new_branch="${11}"

  python3 - "$out_file" "$session_name" "$branch" "$slug" "$worktree_dir" "$prompt" "$log_file" "$window_name" "$status" "$created_at" "$created_new_branch" <<'PY'
import json
import pathlib
import sys

(
    out_file,
    session_name,
    branch,
    slug,
    worktree_dir,
    prompt,
    log_file,
    window_name,
    status,
    created_at,
    created_new_branch,
) = sys.argv[1:]

data = {
    "session": session_name,
    "branch": branch,
    "slug": slug,
    "worktree_dir": worktree_dir,
    "prompt": prompt,
    "log_file": log_file,
    "window_name": window_name,
    "status": status,
    "created_at": created_at,
    "created_new_branch": created_new_branch.lower() == "true",
}

pathlib.Path(out_file).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
PY
}

update_job_status() {
  local job_file="$1"
  local status="$2"

  python3 - "$job_file" "$status" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
status = sys.argv[2]

if not path.exists():
    raise SystemExit(0)

data = json.loads(path.read_text())
data["status"] = status
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
PY
}

write_session_json() {
  local session_file="$1"
  local session_name="$2"
  local repo_root="$3"
  local base_ref="$4"
  local runtime_dir="$5"
  local state="$6"
  local created_at="$7"
  local jobs_tsv="$8"

  python3 - "$session_file" "$session_name" "$repo_root" "$base_ref" "$runtime_dir" "$state" "$created_at" "$jobs_tsv" <<'PY'
import json
import pathlib
import sys

session_file, session_name, repo_root, base_ref, runtime_dir, state, created_at, jobs_tsv = sys.argv[1:]

jobs = []
jobs_path = pathlib.Path(jobs_tsv)
if jobs_path.exists():
    for line in jobs_path.read_text().splitlines():
        if not line.strip():
            continue
        branch, slug, worktree_dir, log_file, window_name = line.split("\t")
        jobs.append(
            {
                "branch": branch,
                "slug": slug,
                "worktree_dir": worktree_dir,
                "log_file": log_file,
                "window_name": window_name,
            }
        )

data = {
    "session": session_name,
    "repo_root": repo_root,
    "base_ref": base_ref,
    "runtime_dir": runtime_dir,
    "state": state,
    "created_at": created_at,
    "jobs": jobs,
}

pathlib.Path(session_file).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
PY
}

update_session_state() {
  local session_file="$1"
  local new_state="$2"
  local now_utc
  now_utc="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  python3 - "$session_file" "$new_state" "$now_utc" <<'PY'
import json
import pathlib
import sys

session_file, new_state, now_utc = sys.argv[1:]
path = pathlib.Path(session_file)
if not path.exists():
    raise SystemExit(0)

data = json.loads(path.read_text())
data["state"] = new_state
data["updated_at"] = now_utc
if new_state == "archived":
    data["archived_at"] = now_utc

path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
PY
}

ensure_runtime_session() {
  local repo_root="$1"
  local session_name="$2"
  local runtime_dir="$repo_root/$RUNTIME_ROOT/$session_name"
  if [ ! -d "$runtime_dir" ]; then
    die "Session metadata not found: $runtime_dir"
  fi
  if [ ! -f "$runtime_dir/jobs.tsv" ]; then
    die "Missing jobs.tsv in: $runtime_dir"
  fi
  printf '%s\n' "$runtime_dir"
}

cmd_start() {
  local base_ref=""
  local session_name=""
  local -a raw_jobs=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --base)
        [ $# -ge 2 ] || die "--base requires a value."
        base_ref="$2"
        shift 2
        ;;
      --job)
        [ $# -ge 2 ] || die "--job requires a value."
        raw_jobs+=("$2")
        shift 2
        ;;
      --session)
        [ $# -ge 2 ] || die "--session requires a value."
        session_name="$2"
        shift 2
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        die "Unknown option for start: $1"
        ;;
    esac
  done

  [ -n "$base_ref" ] || die "start requires --base <ref>."
  [ "${#raw_jobs[@]}" -gt 0 ] || die "start requires at least one --job <branch>:<prompt>."

  require_cmd git
  require_cmd tmux
  require_cmd codex
  require_cmd python3

  local repo_root
  repo_root="$(get_repo_root)" || die "Run this command inside a Git repository."

  git -C "$repo_root" rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1 \
    || die "--base ref '$base_ref' does not resolve to a commit."

  local repo_name repo_slug parent_dir
  repo_name="$(basename "$repo_root")"
  repo_slug="$(slugify "$repo_name")"
  parent_dir="$(cd "$repo_root/.." && pwd)"

  if [ -z "$session_name" ]; then
    session_name="codexp-${repo_slug}-$(date '+%Y%m%d-%H%M%S')"
  fi

  if [[ ! "$session_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    die "Invalid --session '$session_name'. Allowed: [A-Za-z0-9._-]+"
  fi

  if tmux has-session -t "$session_name" 2>/dev/null; then
    die "tmux session already exists: $session_name"
  fi

  local runtime_dir jobs_tsv session_file
  runtime_dir="$repo_root/$RUNTIME_ROOT/$session_name"
  jobs_tsv="$runtime_dir/jobs.tsv"
  session_file="$runtime_dir/session.json"
  mkdir -p "$runtime_dir/jobs" "$runtime_dir/logs"
  : >"$jobs_tsv"

  local created_at
  created_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  local -a branches=()
  local -a prompts=()
  local -a slugs=()
  local -a worktree_dirs=()
  local -a log_files=()
  local -a window_names=()
  local -a created_new_branch_flags=()
  local -a job_files=()
  local -a created_worktrees=()

  rollback_start() {
    local idx wt
    if tmux has-session -t "$session_name" 2>/dev/null; then
      tmux kill-session -t "$session_name" >/dev/null 2>&1 || true
    fi

    for ((idx=${#created_worktrees[@]}-1; idx>=0; idx--)); do
      wt="${created_worktrees[$idx]}"
      if [ -d "$wt" ]; then
        git -C "$repo_root" worktree remove "$wt" >/dev/null 2>&1 || true
      fi
    done

    if [[ "$runtime_dir" == "$repo_root/$RUNTIME_ROOT/"* ]]; then
      rm -rf "$runtime_dir"
    fi
  }

  local raw branch prompt base_slug slug slug_index wt_dir log_file window_name
  for raw in "${raw_jobs[@]}"; do
    parse_job_arg "$raw"
    branch="$PARSED_JOB_BRANCH"
    prompt="$PARSED_JOB_PROMPT"

    validate_branch_name "$branch"
    if in_array "$branch" "${branches[@]:-}"; then
      die "Duplicate branch in --job arguments: $branch"
    fi

    base_slug="$(slugify "$branch")"
    slug="$base_slug"
    slug_index=2
    while in_array "$slug" "${slugs[@]:-}"; do
      slug="${base_slug}-${slug_index}"
      slug_index=$((slug_index + 1))
    done

    wt_dir="$parent_dir/${repo_name}-wt-${slug}"
    if [ -e "$wt_dir" ]; then
      die "Worktree path already exists: $wt_dir"
    fi
    if git -C "$repo_root" worktree list --porcelain | grep -Fqx "worktree $wt_dir"; then
      die "Worktree path already registered: $wt_dir"
    fi

    log_file="$runtime_dir/logs/${slug}.log"
    window_name="$slug"

    branches+=("$branch")
    prompts+=("$prompt")
    slugs+=("$slug")
    worktree_dirs+=("$wt_dir")
    log_files+=("$log_file")
    window_names+=("$window_name")
  done

  local i total branch_exists created_new_branch job_file
  total="${#branches[@]}"

  for ((i=0; i<total; i++)); do
    branch="${branches[$i]}"
    wt_dir="${worktree_dirs[$i]}"

    if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
      branch_exists="true"
      created_new_branch="false"
      if ! git -C "$repo_root" worktree add "$wt_dir" "$branch" >/dev/null; then
        rollback_start
        die "Failed to add worktree for existing branch '$branch'."
      fi
    else
      branch_exists="false"
      created_new_branch="true"
      if ! git -C "$repo_root" worktree add -b "$branch" "$wt_dir" "$base_ref" >/dev/null; then
        rollback_start
        die "Failed to create branch '$branch' from '$base_ref' and add worktree."
      fi
    fi

    created_worktrees+=("$wt_dir")
    created_new_branch_flags+=("$created_new_branch")

    job_file="$runtime_dir/jobs/${slugs[$i]}.json"
    job_files+=("$job_file")
    write_job_json \
      "$job_file" \
      "$session_name" \
      "${branches[$i]}" \
      "${slugs[$i]}" \
      "${worktree_dirs[$i]}" \
      "${prompts[$i]}" \
      "${log_files[$i]}" \
      "${window_names[$i]}" \
      "prepared" \
      "$created_at" \
      "${created_new_branch_flags[$i]}"

    printf '%s\t%s\t%s\t%s\t%s\n' \
      "${branches[$i]}" \
      "${slugs[$i]}" \
      "${worktree_dirs[$i]}" \
      "${log_files[$i]}" \
      "${window_names[$i]}" >>"$jobs_tsv"

    if [ "$branch_exists" = "true" ]; then
      info "Prepared worktree for existing branch: ${branches[$i]} -> ${worktree_dirs[$i]}"
    else
      info "Created branch and worktree: ${branches[$i]} -> ${worktree_dirs[$i]}"
    fi
  done

  local cmd
  for ((i=0; i<total; i++)); do
    cmd="$(build_codex_command "${worktree_dirs[$i]}" "${prompts[$i]}" "${log_files[$i]}")"
    if [ "$i" -eq 0 ]; then
      if ! tmux new-session -d -s "$session_name" -n "${window_names[$i]}"; then
        rollback_start
        die "Failed to create tmux session: $session_name"
      fi
    else
      if ! tmux new-window -t "$session_name" -n "${window_names[$i]}"; then
        rollback_start
        die "Failed to create tmux window for branch '${branches[$i]}'."
      fi
    fi

    if ! tmux send-keys -t "$session_name:${window_names[$i]}" "$cmd" C-m; then
      rollback_start
      die "Failed to start Codex command in tmux window '${window_names[$i]}'."
    fi
    update_job_status "${job_files[$i]}" "running"
  done

  write_session_json \
    "$session_file" \
    "$session_name" \
    "$repo_root" \
    "$base_ref" \
    "$runtime_dir" \
    "running" \
    "$created_at" \
    "$jobs_tsv"

  info "Session started: $session_name"
  info "Runtime path: $runtime_dir"
  info "Attach with: tmux attach -t $session_name"
}

cmd_status() {
  local session_name=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --session)
        [ $# -ge 2 ] || die "--session requires a value."
        session_name="$2"
        shift 2
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        die "Unknown option for status: $1"
        ;;
    esac
  done

  require_cmd git
  require_cmd tmux

  local repo_root runtime_root
  repo_root="$(get_repo_root)" || die "Run this command inside a Git repository."
  runtime_root="$repo_root/$RUNTIME_ROOT"
  if [ ! -d "$runtime_root" ]; then
    info "No runtime directory found: $runtime_root"
    return 0
  fi

  if [ -z "$session_name" ]; then
    local found=0 d name running
    for d in "$runtime_root"/*; do
      [ -d "$d" ] || continue
      found=1
      name="$(basename "$d")"
      if tmux has-session -t "$name" 2>/dev/null; then
        running="running"
      else
        running="stopped"
      fi
      printf '%s\t%s\n' "$name" "$running"
    done
    if [ "$found" -eq 0 ]; then
      info "No saved sessions in $runtime_root"
    fi
    return 0
  fi

  local runtime_dir jobs_tsv tmux_state
  runtime_dir="$(ensure_runtime_session "$repo_root" "$session_name")"
  jobs_tsv="$runtime_dir/jobs.tsv"
  if tmux has-session -t "$session_name" 2>/dev/null; then
    tmux_state="running"
  else
    tmux_state="stopped"
  fi

  printf 'session=%s\n' "$session_name"
  printf 'runtime=%s\n' "$runtime_dir"
  printf 'tmux=%s\n' "$tmux_state"

  local branch slug wt_dir log_file window_name wt_state window_state
  while IFS=$'\t' read -r branch slug wt_dir log_file window_name; do
    [ -n "$branch" ] || continue

    if [ -d "$wt_dir" ]; then
      wt_state="present"
    else
      wt_state="missing"
    fi

    if [ "$tmux_state" = "running" ]; then
      if tmux list-windows -t "$session_name" -F '#{window_name}' 2>/dev/null | grep -Fxq "$window_name"; then
        window_state="open"
      else
        window_state="closed"
      fi
    else
      window_state="n/a"
    fi

    printf 'branch=%s worktree=%s window=%s log=%s\n' "$branch" "$wt_state" "$window_state" "$log_file"
  done <"$jobs_tsv"
}

cmd_stop() {
  local session_name=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --session)
        [ $# -ge 2 ] || die "--session requires a value."
        session_name="$2"
        shift 2
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        die "Unknown option for stop: $1"
        ;;
    esac
  done

  [ -n "$session_name" ] || die "stop requires --session <name>."

  require_cmd git
  require_cmd tmux
  require_cmd python3

  local repo_root runtime_dir session_file jobs_tsv
  repo_root="$(get_repo_root)" || die "Run this command inside a Git repository."
  runtime_dir="$(ensure_runtime_session "$repo_root" "$session_name")"
  session_file="$runtime_dir/session.json"
  jobs_tsv="$runtime_dir/jobs.tsv"

  if tmux has-session -t "$session_name" 2>/dev/null; then
    tmux kill-session -t "$session_name"
    info "Stopped tmux session: $session_name"
  else
    warn "tmux session is not running: $session_name"
  fi

  local branch slug wt_dir log_file window_name
  while IFS=$'\t' read -r branch slug wt_dir log_file window_name; do
    [ -n "$branch" ] || continue
    update_job_status "$runtime_dir/jobs/${slug}.json" "stopped"
  done <"$jobs_tsv"

  update_session_state "$session_file" "stopped"
}

cmd_clean() {
  local session_name=""
  local -a target_branches=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --session)
        [ $# -ge 2 ] || die "--session requires a value."
        session_name="$2"
        shift 2
        ;;
      --branch)
        [ $# -ge 2 ] || die "--branch requires a value."
        target_branches+=("$2")
        shift 2
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        die "Unknown option for clean: $1"
        ;;
    esac
  done

  [ -n "$session_name" ] || die "clean requires --session <name>."

  require_cmd git
  require_cmd tmux
  require_cmd python3

  local repo_root runtime_dir session_file jobs_tsv
  repo_root="$(get_repo_root)" || die "Run this command inside a Git repository."
  runtime_dir="$(ensure_runtime_session "$repo_root" "$session_name")"
  session_file="$runtime_dir/session.json"
  jobs_tsv="$runtime_dir/jobs.tsv"

  if tmux has-session -t "$session_name" 2>/dev/null; then
    die "Session '$session_name' is running. Stop it before clean."
  fi

  local cwd
  cwd="$(pwd -P)"

  local found_any=0 removed_count=0 skipped_count=0
  local -a seen_selected=()

  local branch slug wt_dir log_file window_name selected wt_real
  while IFS=$'\t' read -r branch slug wt_dir log_file window_name; do
    [ -n "$branch" ] || continue
    selected=0
    if [ "${#target_branches[@]}" -eq 0 ]; then
      selected=1
    elif in_array "$branch" "${target_branches[@]}"; then
      selected=1
      seen_selected+=("$branch")
    fi

    if [ "$selected" -eq 0 ]; then
      continue
    fi

    found_any=1

    if [ ! -d "$wt_dir" ]; then
      warn "Worktree already missing for branch '$branch': $wt_dir"
      skipped_count=$((skipped_count + 1))
      continue
    fi

    wt_real="$(cd "$wt_dir" && pwd -P)"
    case "$cwd/" in
      "$wt_real/"*)
        die "Current directory is inside target worktree '$wt_real'. Move out before clean."
        ;;
    esac

    if [ -n "$(git -C "$wt_dir" status --porcelain --untracked-files=normal)" ]; then
      warn "Skip dirty worktree for branch '$branch': $wt_dir"
      skipped_count=$((skipped_count + 1))
      continue
    fi

    if git -C "$repo_root" worktree remove "$wt_dir" >/dev/null 2>&1; then
      info "Removed worktree: $wt_dir"
      update_job_status "$runtime_dir/jobs/${slug}.json" "cleaned"
      removed_count=$((removed_count + 1))
    else
      warn "Failed to remove worktree for branch '$branch': $wt_dir"
      skipped_count=$((skipped_count + 1))
    fi
  done <"$jobs_tsv"

  if [ "$found_any" -eq 0 ]; then
    die "No matching branches found for clean in session '$session_name'."
  fi

  if [ "${#target_branches[@]}" -gt 0 ]; then
    local target
    for target in "${target_branches[@]}"; do
      if ! in_array "$target" "${seen_selected[@]:-}"; then
        die "Branch '$target' is not registered in session '$session_name'."
      fi
    done
  fi

  git -C "$repo_root" worktree prune >/dev/null 2>&1 || true

  local remaining=0
  while IFS=$'\t' read -r branch slug wt_dir log_file window_name; do
    [ -n "$branch" ] || continue
    if [ -d "$wt_dir" ]; then
      remaining=1
      break
    fi
  done <"$jobs_tsv"

  if [ "$remaining" -eq 0 ]; then
    update_session_state "$session_file" "archived"
    touch "$runtime_dir/ARCHIVED"
    info "Session archived: $session_name"
  else
    update_session_state "$session_file" "stopped"
  fi

  info "Clean summary: removed=$removed_count skipped=$skipped_count"
}

main() {
  local command="${1:-}"
  if [ -z "$command" ]; then
    usage
    exit 1
  fi
  shift || true

  case "$command" in
    start)
      cmd_start "$@"
      ;;
    status)
      cmd_status "$@"
      ;;
    stop)
      cmd_stop "$@"
      ;;
    clean)
      cmd_clean "$@"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      die "Unknown command: $command"
      ;;
  esac
}

main "$@"
