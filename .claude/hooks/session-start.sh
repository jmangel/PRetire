# Cloud sessions only: install the compound-engineering plugin, which isn't
# installed in a fresh cloud VM even though .claude/settings.json enables it.
# Run with bash from .claude/settings.json, so no shebang or chmod is needed.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

if claude plugin list 2>/dev/null | grep -q compound-engineering; then
  echo "compound-engineering plugin already installed"
  exit 0
fi

echo "installing compound-engineering plugin"
if claude plugin marketplace add EveryInc/compound-engineering-plugin > /dev/null 2>&1 &&
   claude plugin install compound-engineering@compound-engineering-plugin --scope user > /dev/null 2>&1; then
  echo "compound-engineering plugin installed"
else
  echo "WARNING: compound-engineering plugin install failed" >&2
fi
exit 0
