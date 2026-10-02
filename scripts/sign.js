// electron-builder's mac.sign hook. Signs with the local identity from
// scripts/make-signing-identity.sh when this Mac has it, else ad hoc as before.
// A fixed identity keeps macOS's Calendar, microphone and audio permissions
// across rebuilds; an ad hoc signature changes with every build, so each new
// build asks again. electron-builder only looks for trusted certificates, and
// this one is self-signed, hence the hook.
const { execFileSync } = require('child_process');
const { signAsync } = require('@electron/osx-sign');

const IDENTITY = 'Razer macOS Local Signing';

exports.default = async function sign(options) {
  const identities = execFileSync('security', ['find-identity', '-p', 'codesigning']).toString();
  const identity = identities.includes(`"${IDENTITY}"`) ? IDENTITY : '-';
  console.log(`  • signing with ${identity === '-' ? 'an ad hoc signature (run scripts/make-signing-identity.sh to keep permissions across builds)' : identity}`);
  await signAsync({ ...options, identity, identityValidation: false });
};
