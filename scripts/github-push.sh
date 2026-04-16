#!/bin/bash
# Automatically push unpushed commits to GitHub origin.
# Runs in a loop every 5 minutes. Requires GITHUB_TOKEN secret.
#
# Auth strategy: passes credentials via a temporary http.extraHeader
# flag on each git command (-c flag). The stored remote URL and git
# config are never modified. No token is persisted anywhere.

INTERVAL_SECONDS=300  # 5 minutes
SYNC_STATUS_FILE="${GITHUB_SYNC_STATUS_FILE:-/home/runner/workspace/.github-sync-status.json}"

write_sync_status() {
  local branch="$1"
  local ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  printf '{"lastSyncedAt":"%s","branch":"%s"}\n' "$ts" "$branch" > "$SYNC_STATUS_FILE"
}

push_if_needed() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "[github-push] ERROR: GITHUB_TOKEN is not set. Cannot push."
    return
  fi

  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -z "$BRANCH" ]; then
    echo "[github-push] Could not determine current branch. Skipping."
    return
  fi

  # Build a Base64-encoded Basic auth header: "x-token:<GITHUB_TOKEN>"
  # This is the standard way GitHub accepts PAT auth over HTTPS.
  AUTH_HEADER="Authorization: Basic $(printf "x-token:%s" "$GITHUB_TOKEN" | base64 -w 0 2>/dev/null || printf "x-token:%s" "$GITHUB_TOKEN" | base64)"

  # Fetch to update remote tracking refs (transient auth, no config mutation)
  git -c "http.extraHeader=${AUTH_HEADER}" fetch origin --quiet 2>/dev/null || true

  # Check whether the remote tracking branch exists yet
  if ! git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — Branch '$BRANCH' not on remote. Pushing and setting upstream…"
    if git -c "http.extraHeader=${AUTH_HEADER}" push -u origin "$BRANCH" --quiet 2>&1; then
      echo "[github-push] Push succeeded (new branch created on remote)."
      write_sync_status "$BRANCH"
    else
      echo "[github-push] Push FAILED — will retry next cycle."
    fi
    return
  fi

  AHEAD=$(git rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null || echo "0")

  if [ "$AHEAD" -gt 0 ]; then
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — Pushing $AHEAD commit(s) on '$BRANCH'…"

    if git -c "http.extraHeader=${AUTH_HEADER}" push origin "$BRANCH" --quiet 2>&1; then
      echo "[github-push] Push succeeded."
      write_sync_status "$BRANCH"
    else
      echo "[github-push] Push FAILED — will retry next cycle."
    fi
  else
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — No new commits on '$BRANCH'."
  fi
}

echo "[github-push] GitHub auto-push service started. Interval: ${INTERVAL_SECONDS}s."

while true; do
  push_if_needed
  sleep "$INTERVAL_SECONDS"
done
