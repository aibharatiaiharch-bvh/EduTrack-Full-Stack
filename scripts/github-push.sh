#!/bin/bash
# Automatically push unpushed commits to GitHub origin.
# Runs in a loop every 5 minutes. Requires GITHUB_TOKEN secret.

set -euo pipefail

INTERVAL_SECONDS=300  # 5 minutes

configure_remote() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "[github-push] ERROR: GITHUB_TOKEN is not set. Skipping push."
    return 1
  fi

  # Inject the token into the origin URL so git can authenticate
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -z "$REMOTE_URL" ]; then
    echo "[github-push] ERROR: No 'origin' remote found."
    return 1
  fi

  # Build authenticated URL: https://<token>@github.com/...
  AUTH_URL=$(echo "$REMOTE_URL" | sed "s|https://|https://${GITHUB_TOKEN}@|")
  git remote set-url origin "$AUTH_URL"
}

push_if_needed() {
  # Fetch quietly to update remote tracking refs
  git fetch origin --quiet 2>/dev/null || true

  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -z "$BRANCH" ]; then
    echo "[github-push] Could not determine current branch. Skipping."
    return
  fi

  AHEAD=$(git rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null || echo "0")

  if [ "$AHEAD" -gt 0 ]; then
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — Pushing $AHEAD commit(s) on branch '$BRANCH'…"
    git push origin "$BRANCH" --quiet && \
      echo "[github-push] Push succeeded." || \
      echo "[github-push] Push failed — will retry next cycle."
  else
    echo "[github-push] $(date -u '+%Y-%m-%d %H:%M:%S UTC') — No new commits to push on '$BRANCH'."
  fi
}

echo "[github-push] GitHub auto-push service started. Interval: ${INTERVAL_SECONDS}s."

# Configure once at startup; re-configure each iteration to handle token rotation
while true; do
  configure_remote && push_if_needed || true
  sleep "$INTERVAL_SECONDS"
done
