// Keep legacy installations on their existing callback while the Palisty app
// uses a same-origin auth helper (including Safari's redirect fallback).
export function withAppAuthDomain(config, hostname) {
  return hostname === 'app.palisty.com' && config.projectId === 'groceries-ros'
    ? { ...config, authDomain: 'app.palisty.com' }
    : config;
}
