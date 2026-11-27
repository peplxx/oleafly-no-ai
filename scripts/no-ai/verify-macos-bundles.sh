#!/usr/bin/env bash
set -euo pipefail

bundle_dir="${1:?Usage: verify-macos-bundles.sh BUNDLE_DIRECTORY}"
shopt -s nullglob
dmgs=("$bundle_dir"/dmg/*.dmg)
updaters=("$bundle_dir"/macos/*.app.tar.gz)
if [[ ${#dmgs[@]} -ne 1 || ${#updaters[@]} -ne 1 ]]; then
  echo "Expected exactly one macOS DMG and one updater archive in $bundle_dir" >&2
  exit 1
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/oleafly-signature-check.XXXXXX")"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then
    # Never recursively remove a directory while a disk image is mounted in it.
    hdiutil detach "$work/dmg" >/dev/null || return 1
  fi
  rm -rf "$work"
}
trap cleanup EXIT

mkdir "$work/dmg" "$work/updater"
tar -xzf "${updaters[0]}" -C "$work/updater"
echo "Verifying the app in the updater archive"
codesign --verify --deep --strict --verbose=2 "$work/updater/Oleafly.app"

hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$work/dmg" "${dmgs[0]}" >/dev/null
mounted=true
echo "Verifying the app in the DMG"
codesign --verify --deep --strict --verbose=2 "$work/dmg/Oleafly.app"
hdiutil detach "$work/dmg" >/dev/null
mounted=false
