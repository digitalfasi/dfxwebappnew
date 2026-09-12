#!/usr/bin/env bash
# Build the deploy tarball for the E2E node, with the commit stamped inside it.
#
# /opt/dfx-web/DEPLOYED_SHA used to be typed by hand after deploy.sh ran, so it
# silently lied whenever that step was skipped - and DEPLOYED_SHA is the only
# thing anyone checks to answer "what is actually live". Stamping the sha into
# the archive lets deploy.sh write that file itself, from the code it just
# unpacked, so the two cannot disagree.
#
# Usage:  bash scripts/archive.sh [output.tar.gz]
set -euo pipefail

out="${1:-web-src.tar.gz}"
sha="$(git rev-parse --short HEAD)"

# A dirty tree would ship code the stamped sha does not describe, which is the
# exact failure this script exists to remove.
if [ -n "$(git status --porcelain)" ]; then
  echo "working tree is dirty; commit first or the stamped sha will be a lie" >&2
  exit 1
fi

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
printf '%s\n' "$sha" > "$dir/DEPLOY_SHA"

# --add-file places the file at the archive root under its basename.
git archive HEAD --add-file="$dir/DEPLOY_SHA" -o "$out"

echo "$out  ($sha)"
