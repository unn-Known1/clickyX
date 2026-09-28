#!/usr/bin/env bash
# install-hooks.sh — point git at the repo-local hooks in .githooks/.
set -euo pipefail
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
echo "hooksPath set to .githooks (bypass any hook with SKIP_HOOKS=1)"
