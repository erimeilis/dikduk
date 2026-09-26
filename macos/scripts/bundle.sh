#!/usr/bin/env bash
# Builds build/DikDuk.app from the SwiftPM package and signs it with a stable
# local identity, so macOS keeps the Accessibility grant across rebuilds.
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="DikDuk Local Signing"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
APP="build/DikDuk.app"

ensure_identity() {
  if security find-identity -v -p codesigning | grep -q "\"$IDENTITY\""; then
    return
  fi
  echo "Creating code-signing identity \"$IDENTITY\" (one time; macOS asks for your login password to trust it)."
  local tmp
  tmp="$(mktemp -d)"
  cat > "$tmp/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $IDENTITY
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -config "$tmp/cert.cnf" -keyout "$tmp/key.pem" -out "$tmp/cert.pem"
  /usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" \
    -name "$IDENTITY" -passout pass:dikduk -out "$tmp/identity.p12"
  security import "$tmp/identity.p12" -k "$KEYCHAIN" -P dikduk -T /usr/bin/codesign
  security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$tmp/cert.pem"
  rm -rf "$tmp"
  if ! security find-identity -v -p codesigning | grep -q "\"$IDENTITY\""; then
    echo "error: \"$IDENTITY\" is not a valid code-signing identity after import" >&2
    exit 1
  fi
}

swift build -c release --product DikDuk
BIN="$(swift build -c release --show-bin-path)/DikDuk"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/DikDuk"
cp Resources/Info.plist "$APP/Contents/Info.plist"

ensure_identity
codesign --force --options runtime --sign "$IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"
echo "Built $APP"
