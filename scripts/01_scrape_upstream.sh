#!/usr/bin/env bash
set -euo pipefail
UPSTREAM="${REPO:-mattermost-community/focalboard}"
OUT_DIR="${DATA_DIR:-./data}"
mkdir -p "$OUT_DIR"
echo "==> Scraping upstream: $UPSTREAM"
echo "[1/3] Fetching open issues..."
gh api "repos/$UPSTREAM/issues" --paginate \
  --jq '[.[] | select(.pull_request == null) | {number:.number,title:.title,body:.body,state:.state,labels:[.labels[].name],created_at:.created_at,updated_at:.updated_at,comments:.comments,url:.html_url,user:.user.login}]' \
  | jq -s 'add // []' > "$OUT_DIR/issues_raw.json"
IC=$(jq length "$OUT_DIR/issues_raw.json"); echo "    Found $IC open issues"
echo "[2/3] Fetching open pull requests..."
gh api "repos/$UPSTREAM/pulls?state=open&per_page=100" --paginate \
  --jq '[.[] | {number:.number,title:.title,body:.body,state:.state,labels:[.labels[].name],created_at:.created_at,updated_at:.updated_at,head_ref:.head.ref,head_sha:.head.sha,base_ref:.base.ref,diff_url:.diff_url,patch_url:.patch_url,url:.html_url,user:.user.login,draft:.draft}]' \
  | jq -s 'add // []' > "$OUT_DIR/prs_raw.json"
PC=$(jq length "$OUT_DIR/prs_raw.json"); echo "    Found $PC open PRs"
echo "[3/3] Fetching PR diffs..."
mkdir -p "$OUT_DIR/diffs"
jq -r '.[].number' "$OUT_DIR/prs_raw.json" | while read -r n; do
  [ -f "$OUT_DIR/diffs/pr_${n}.diff" ] && continue
  gh api "repos/$UPSTREAM/pulls/$n" --header "Accept: application/vnd.github.diff" \
    > "$OUT_DIR/diffs/pr_${n}.diff" 2>/dev/null || echo "    Warning: no diff for PR #$n"
  sleep 0.2
done
echo "==> Done: $IC issues, $PC PRs"
