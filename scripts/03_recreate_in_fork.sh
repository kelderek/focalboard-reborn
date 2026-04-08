#!/usr/bin/env bash
set -euo pipefail
FORK="${FORK:-}"; BACKLOG="${BACKLOG:-./data/backlog.json}"; DIFFS="${DATA_DIR:-./data}/diffs"
[ -z "$FORK" ] && { echo "ERROR: FORK required"; exit 1; }
echo "==> Recreating in $FORK"

echo "[1/3] Creating labels..."
declare -A L=(["priority:security"]="B60205" ["priority:crash"]="E4E669" ["priority:bug"]="D73A4A"
  ["priority:performance"]="C5DEF5" ["priority:feature"]="0075CA" ["priority:docs"]="0075CA"
  ["priority:i18n"]="BFD4F2" ["priority:chore"]="E4E669" ["auto-attempt"]="28A745"
  ["human-review"]="D93F0B" ["from-upstream"]="EDEDED" ["status:open"]="C2E0C6"
  ["status:in-progress"]="FEF2C0" ["status:done"]="0E8A16" ["status:failed"]="EE0701"
  ["complexity:trivial"]="F9D0C4" ["complexity:small"]="F9D0C4" ["complexity:medium"]="FEF2C0"
  ["complexity:large"]="E4E669" ["status-tracker"]="0075CA")
for lbl in "${!L[@]}"; do
  gh api "repos/$FORK/labels" --method POST --field name="$lbl" --field color="${L[$lbl]}" --silent 2>/dev/null || true
done
echo "    Done"

echo "[2/3] Creating issues..."
TOTAL=$(jq length "$BACKLOG"); C=0; S=0

for i in $(seq 0 $((TOTAL-1))); do
  # Use Python to safely extract fields and build body — avoids shell control-char issues
  PAYLOAD=$(python3 - "$BACKLOG" "$i" "$DIFFS" <<'PYEOF'
import sys, json, os, re

backlog_file, idx, diffs_dir = sys.argv[1], int(sys.argv[2]), sys.argv[3]
items = json.load(open(backlog_file))
it = items[idx]

# Skip already processed
if it.get('fork_issue_number'):
    print("ALREADY_DONE")
    sys.exit(0)

n    = it['number']
tt   = it['title']
tp   = it['type']
cat  = it['triage']['category']
cx   = it['triage']['complexity']
su   = it['triage']['summary']
au   = it['triage']['auto_attempt']
skp  = it['triage'].get('skip_reason') or ''
url  = it.get('url', '')
aff  = it['triage']['affected_area']
th   = it['triage'].get('test_hint') or ''
ob   = (it.get('body') or 'No description.').replace('\x00', '')
# strip other control chars except newline/tab
ob   = re.sub(r'[\x01-\x08\x0b-\x1f\x7f]', '', ob)
ob   = ob[:8000]  # cap body size

ut = 'pull request' if tp == 'pr' else 'issue'

ds = ''
diff_path = os.path.join(diffs_dir, f'pr_{n}.diff')
if tp == 'pr' and os.path.exists(diff_path):
    with open(diff_path, 'rb') as f:
        dc = f.read(8000).decode('utf-8', errors='replace')
    ds = f'\n\n## Original patch\n```diff\n{dc}\n```'

if au:
    ab = '🤖 **Auto-attempt:** YES'
    al = 'auto-attempt'
else:
    ab = f'👤 **Auto-attempt:** NO — {skp}'
    al = 'human-review'

th_row = f'| Test hint | `{th}` |\n' if th else ''

body = f"""<!-- upstream_number:{n} upstream_type:{tp} -->
> Imported from upstream [{ut} #{n}]({url})

## Summary
{su}

## Triage
| Field | Value |
|---|---|
| Category | `{cat}` |
| Complexity | `{cx}` |
| Area | `{aff}` |
| {ab} | |
{th_row}
## Original description
{ob}{ds}"""

title = f'[{tp}#{n}] {tt}'

result = json.dumps({
    'number': n,
    'title': title,
    'body': body,
    'cat': cat,
    'cx': cx,
    'al': al,
})
print(result)
PYEOF
)

  [ "$PAYLOAD" = "ALREADY_DONE" ] && { echo "  ↷ #$i already has fork_issue_number"; C=$((C+1)); continue; }
  [ -z "$PAYLOAD" ] && { echo "  SKIP #$i (python error)"; S=$((S+1)); continue; }

  N=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['number'])")
  TITLE=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['title'])")
  CAT=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['cat'])")
  CX=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['cx'])")
  AL=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['al'])")

  # Write body to temp file via Python to avoid any shell encoding issues
  TMPBODY=$(mktemp)
  echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); open('$TMPBODY','w').write(d['body'])"

  RES=""; ATTEMPT=0
  while [ $ATTEMPT -lt 4 ]; do
    RES=$(gh api "repos/$FORK/issues" --method POST \
      --field title="$TITLE" --field body=@"$TMPBODY" \
      --field "labels[]"="from-upstream" --field "labels[]"="priority:$CAT" \
      --field "labels[]"="complexity:$CX" --field "labels[]"="status:open" \
      --field "labels[]"="$AL" --jq '.number' 2>&1) && break
    ATTEMPT=$((ATTEMPT+1))
    echo "  RETRY $ATTEMPT/3 #$N (${RES:0:80})"
    sleep $((300 * ATTEMPT))
  done
  if [ $ATTEMPT -eq 4 ]; then
    echo "  SKIP #$N: $RES"; rm -f "$TMPBODY"; S=$((S+1)); continue
  fi
  rm -f "$TMPBODY"

  TMP=$(mktemp)
  python3 -c "
import sys, json
data = json.load(open('$BACKLOG'))
data[$i]['fork_issue_number'] = int('$RES'.strip())
open('$TMP','w').write(json.dumps(data, indent=2))
"
  mv "$TMP" "$BACKLOG"
  echo "  ✓ fork#$RES ← upstream#$N: $TITLE"
  C=$((C+1))
  sleep 3
  # Every 50 successful creates, pause 5 minutes to avoid GitHub secondary rate limits
  if [ $((C % 50)) -eq 0 ]; then
    echo "  --- Batch pause: 5 min rate-limit cooldown (${C} done so far) ---"
    sleep 300
  fi
done
echo "[3/3] Done: $C created, $S skipped"
