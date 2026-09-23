// In `vite dev` the page is same-origin with the proxied edge, so relative
// URLs work; the packaged TV build has no origin of its own (file://).
export const ORIGIN = import.meta.env.DEV ? "" : __GRABIUM_ORIGIN__;

export const url = (path) => `${ORIGIN}${path}`;

// Server-driven status is the source of truth; these only set how often we ask.
export const LOBBY_POLL_MS = 5000;
export const MACHINE_POLL_MS = 3000;
