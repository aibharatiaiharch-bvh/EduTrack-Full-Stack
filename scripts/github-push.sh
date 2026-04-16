#!/bin/bash
# Automatically push unpushed commits to GitHub origin.
# Runs in a loop every 5 minutes. Requires GITHUB_TOKEN secret.
#
# Auth strategy: passes credentials via a temporary http.extraHeader
# flag on each git command (-c flag). The stored remote URL and git
# config are never modified. No token is persisted anywhere.

INTERVAL_SECONDS=300  # 5 minutes
SYNC_STATUS_FILE="${GITHUB_SYNC_STATUS_FILE:-/home/runner/workspace/.github-sync-status.json}"
STATUS_FILE="${GITHUB_PUSH_STATUS_FILE:-/tmp/github-push-status.json}"

# ─── Status helpers ───────────────────────────────────────────────────────────

write_sync_status() {
  local branch="$1"
  local ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  local commit_hash commit_msg
  commit_hash=$(git log -1 --format='%h' 2>/dev/null || echo "")
  commit_msg=$(git log -1 --format='%s' 2>/dev/null || echo "")
  local hash_json msg_json
  hash_json="$(echo "$commit_hash" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  msg_json="$(echo "$commit_msg" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '{"lastSyncedAt":"%s","branch":"%s","commitHash":"%s","commitMessage":"%s"}\n' \
    "$ts" "$branch" "$hash_json" "$msg_json" > "$SYNC_STATUS_FILE"
}

write_status() {
  local status="$1"
  local message="$2"
  local failure_count="$3"
  local now
  now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  # Read existing timestamps from the file to preserve the ones we're not updating.
  # We strip surrounding quotes and whitespace, then re-add them when writing.
  local last_succeeded_raw=""
  local last_failed_raw=""
  if [ -f "$STATUS_FILE" ]; then
    last_succeeded_raw=$(grep -o '"lastSucceededAt" *: *"[^"]*"' "$STATUS_FILE" | grep -o '"[^"]*"$' | tr -d '"' || true)
    last_failed_raw=$(grep -o '"lastFailedAt" *: *"[^"]*"' "$STATUS_FILE" | grep -o '"[^"]*"$' | tr -d '"' || true)
  fi

  # Update whichever timestamp applies to this call
  if [ "$status" = "ok" ]; then
    last_succeeded_raw="$now"
  else
    last_failed_raw="$now"
  fi

  # Format timestamps as JSON values (quoted string or null)
  local last_succeeded_json="null"
  local last_failed_json="null"
  [ -n "$last_succeeded_raw" ] && last_succeeded_json="\"$last_succeeded_raw\""
  [ -n "$last_failed_raw" ]    && last_failed_json="\"$last_failed_raw\""

  local message_json
  message_json="\"$(echo "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')\""

  cat > "$STATUS_FILE" <<EOF
{
  "status": "$status",
  "message": $message_json,
  "failureCount": $failure_count,
  "lastAttemptAt": "$now",
  "lastSucceededAt": $last_succeeded_json,
  "lastFailedAt": $last_failed_json
}
EOF
}

push_if_needed() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "[github-push] ERROR: GITHUB_TOKEN is not set. Cannot push."
    write_status "no_token" "GITHUB_TOKEN is not set" 0
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

  # Read previous failure count from status file
  local prev_failures=0
  if [ -f "$STATUS_FILE" ]; then
    prev_failures=$(grep -o '"failureCount":[^,}]*' "$STATUS_FILE" | grep -o '[0-9]*' || echo "0")
    [ -z "$prev_failures" ] && prev_failures=0
  fi

  # Check whether the remote tracking branch exists yet
  if ! git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — Branch '$BRANCH' not on remote. Pushing and setting upstream…"
    if git -c "http.extraHeader=${AUTH_HEADER}" push -u origin "$BRANCH" --quiet 2>&1; then
      echo "[github-push] Push succeeded (new branch created on remote)."
      write_sync_status "$BRANCH"
      write_status "ok" "Push succeeded (new branch created on remote)" 0
    else
      local new_failures=$((prev_failures + 1))
      echo "[github-push] Push FAILED — will retry next cycle. (consecutive failures: $new_failures)"
      write_status "failed" "Push failed — new branch could not be pushed to remote" "$new_failures"
    fi
    return
  fi

  AHEAD=$(git rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null || echo "0")

  if [ "$AHEAD" -gt 0 ]; then
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — Pushing $AHEAD commit(s) on '$BRANCH'…"

    PUSH_OUT=$(git -c "http.extraHeader=${AUTH_HEADER}" push origin "$BRANCH" --quiet 2>&1)
    PUSH_EXIT=$?

    if [ $PUSH_EXIT -eq 0 ]; then
      echo "[github-push] Push succeeded."
      write_sync_status "$BRANCH"
      write_status "ok" "Pushed $AHEAD commit(s) on '$BRANCH'" 0
    elif echo "$PUSH_OUT" | grep -q "non-fast-forward\|fetch first"; then
      echo "[github-push] Remote has new commits — pulling and rebasing…"
      if GIT_EDITOR=true git -c "http.extraHeader=${AUTH_HEADER}" pull --rebase origin "$BRANCH" --quiet 2>&1; then
        echo "[github-push] Rebase OK — retrying push…"
        if git -c "http.extraHeader=${AUTH_HEADER}" push origin "$BRANCH" --quiet 2>&1; then
          echo "[github-push] Push succeeded after rebase."
          write_sync_status "$BRANCH"
          write_status "ok" "Pushed $AHEAD commit(s) on '$BRANCH' (after rebase)" 0
        else
          local new_failures=$((prev_failures + 1))
          echo "[github-push] Push FAILED after rebase — will retry next cycle. (consecutive failures: $new_failures)"
          write_status "failed" "Push failed after rebase on '$BRANCH' — check token permissions or conflicts" "$new_failures"
        fi
      else
        echo "[github-push] Rebase had conflicts — aborting. Manual intervention needed."
        git rebase --abort 2>/dev/null || true
        local new_failures=$((prev_failures + 1))
        write_status "failed" "Rebase conflict on '$BRANCH' — manual intervention needed" "$new_failures"
      fi
    else
      local new_failures=$((prev_failures + 1))
      echo "[github-push] Push FAILED — will retry next cycle. (consecutive failures: $new_failures)"
      echo "$PUSH_OUT"
      write_status "failed" "Push failed on branch '$BRANCH' — check token permissions or conflicts" "$new_failures"
    fi
  else
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — No new commits on '$BRANCH'."
    # Only write ok status (resetting failure count) if there wasn't already a clean state
    if [ "$prev_failures" -gt 0 ]; then
      write_status "ok" "No new commits — sync is healthy" 0
    else
      # Preserve existing ok status without overwriting timestamps unnecessarily
      write_status "ok" "No new commits on '$BRANCH'" 0
    fi
  fi
}

echo "[github-push] GitHub auto-push service started. Interval: ${INTERVAL_SECONDS}s."

while true; do
  push_if_needed
  sleep "$INTERVAL_SECONDS"
done
