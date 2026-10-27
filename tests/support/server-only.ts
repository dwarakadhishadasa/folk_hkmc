/**
 * Stand-in for the `server-only` package.
 *
 * `server-only` throws at import time unless the bundler selected the
 * `react-server` condition, which Next sets and plain Node does not. Unit tests
 * run in Node, so `vitest.config.ts` aliases the specifier here.
 *
 * Aliasing is safe in this direction only: the guard exists to stop server code
 * reaching a browser bundle, and a Node test never becomes one. Do not invert
 * it — nothing under test may assume it is running in a client.
 */

export {}
