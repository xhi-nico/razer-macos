#!/bin/bash
# One-time, per Mac: creates the self-signed code signing identity scripts/sign.js
# uses, in the login keychain. Builds signed with it keep macOS's permissions
# (Calendar, microphone, system audio) from one build to the next. It needs no
# trust setting and no Apple account; Gatekeeper still warns on first open.
# The first build afterwards asks once to let codesign use the key: Always Allow.
set -euo pipefail

NAME="Razer macOS Local Signing"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -p codesigning | grep -q "\"$NAME\""; then
  echo "\"$NAME\" already exists."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/cert.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CNF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$work/cert.cnf" \
  -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
# OpenSSL 3 needs -legacy for a file the keychain can read; LibreSSL has no such flag.
password=$(openssl rand -hex 16)
openssl pkcs12 -export -legacy -inkey "$work/key.pem" -in "$work/cert.pem" -out "$work/identity.p12" -passout "pass:$password" 2>/dev/null \
  || openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" -out "$work/identity.p12" -passout "pass:$password"
security import "$work/identity.p12" -k "$KEYCHAIN" -P "$password" -T /usr/bin/codesign >/dev/null

echo "Created \"$NAME\". Builds from now on keep their permissions; the next one asks for them once more."
