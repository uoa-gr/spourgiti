// Re-exports getSodium through the package's own exports map.
// The runtime (Node vs browser) picks which sodium file is loaded.
export { getSodium } from '@spourgiti/crypto/sodium';
