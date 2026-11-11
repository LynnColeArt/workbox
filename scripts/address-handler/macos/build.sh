#!/bin/sh
set -eu

if [ "$(uname -s)" != Darwin ]; then
  echo "Build the AppKit handler on macOS." >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 OUTPUT_DIRECTORY" >&2
  exit 2
fi

source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
mkdir -p -- "$1"
output_dir=$(CDPATH='' cd -- "$1" && pwd)
bundle_name="Workbox Address Handler.app"
destination="$output_dir/$bundle_name"
if [ -e "$destination" ] || [ -L "$destination" ]; then
  echo "Choose an output directory without an existing $bundle_name." >&2
  exit 1
fi

staging=$(mktemp -d "$output_dir/.workbox-handler.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT
trap 'exit 1' HUP INT TERM
bundle="$staging/$bundle_name"
mkdir -p "$bundle/Contents/MacOS"
cp "$source_dir/Info.plist" "$bundle/Contents/Info.plist"
plutil -lint "$bundle/Contents/Info.plist"
xcrun swiftc -parse-as-library -swift-version 5 -O -target "$(uname -m)-apple-macosx12.0" \
  "$source_dir/WorkboxAddressHandler.swift" -o "$bundle/Contents/MacOS/WorkboxAddressHandler"

identity=${WORKBOX_CODESIGN_IDENTITY:--}
if [ "$identity" = "-" ]; then
  codesign --sign - "$bundle"
else
  codesign --options runtime --timestamp --sign "$identity" "$bundle"
fi
codesign --verify --strict "$bundle"
# Reserve the output after signing so concurrent builds cannot replace it.
mkdir -- "$destination"
if ! mv -- "$bundle/Contents" "$destination/Contents"; then
  rmdir -- "$destination"
  exit 1
fi
printf '%s\n' "$destination"
