#!/usr/bin/env bash
# Builds an unsigned PBTouch.ipa (your sideloading tool signs it).
# Runs on macOS with Xcode; used by the GitHub Actions workflow.
set -euo pipefail

APP=PBTouch
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build"
BUNDLE="$OUT/Payload/$APP.app"

rm -rf "$OUT"
mkdir -p "$BUNDLE"

SDK_PATH="$(xcrun --sdk iphoneos --show-sdk-path)"
SDK_VER="$(xcrun --sdk iphoneos --show-sdk-version)"
echo "iOS SDK $SDK_VER at $SDK_PATH"

xcrun -sdk iphoneos swiftc \
  -parse-as-library \
  -O \
  -swift-version 5 \
  -target arm64-apple-ios16.0 \
  -sdk "$SDK_PATH" \
  "$ROOT"/Sources/*.swift \
  -o "$BUNDLE/$APP"

cp "$ROOT"/Resources/*.js "$BUNDLE/"
cp "$ROOT/Info.plist" "$BUNDLE/Info.plist"

PL="$BUNDLE/Info.plist"

# App icon: compile the asset catalog (makes Assets.car + the PNG sizes iOS needs)
# and merge the icon keys actool reports into Info.plist.
xcrun actool "$ROOT/Assets.xcassets" \
  --compile "$BUNDLE" \
  --platform iphoneos \
  --minimum-deployment-target 16.0 \
  --target-device iphone --target-device ipad \
  --app-icon AppIcon \
  --output-format human-readable-text \
  --output-partial-info-plist "$OUT/partial.plist"
/usr/bin/python3 - "$PL" "$OUT/partial.plist" <<'PY'
import plistlib, sys
main, part = sys.argv[1], sys.argv[2]
with open(main, 'rb') as f: d = plistlib.load(f)
with open(part, 'rb') as f: d.update(plistlib.load(f))
with open(main, 'wb') as f: plistlib.dump(d, f)
print('icon keys:', [k for k in d if 'Icon' in k])
PY
plutil -replace CFBundleVersion -string "${GITHUB_RUN_NUMBER:-1}" "$PL"
plutil -replace DTSDKName -string "iphoneos$SDK_VER" "$PL"
plutil -replace DTPlatformVersion -string "$SDK_VER" "$PL"
plutil -replace DTXcode -string "$(xcodebuild -version | awk 'NR==1{print $2}' | tr -d .)" "$PL" || true
plutil -convert binary1 "$PL"
plutil -lint "$PL"

printf 'APPL????' > "$BUNDLE/PkgInfo"

# Ad-hoc signature so the bundle is well-formed; sideloading tools re-sign it.
codesign --force --sign - --timestamp=none "$BUNDLE"

(cd "$OUT" && zip -qry "$APP.ipa" Payload)
ls -l "$OUT/$APP.ipa"
shasum -a 256 "$OUT/$APP.ipa"
