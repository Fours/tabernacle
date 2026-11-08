const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;

// posthog-js is a separate async chunk, kept out of the scene bundle. initAnalytics() is called
// from src/boot.js before the scene bundle is even requested, so the pageview (and the automatic
// $pageleave) are recorded for visitors who leave while the loading screen is still up. A
// pageview with no `scene_loaded` event is a bounce during loading.
// No-op when the key is missing (local builds without .env.local).
let ready = null;

export function initAnalytics() {
  if (!posthogKey || ready) return;
  ready = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      defaults: '2025-05-24',
      capture_pageview: true,
    });
    return posthog;
  });
  ready.catch(() => {}); // blocked by an ad blocker, offline: the game runs without analytics
}

// Capture an event once PostHog is up; dropped silently if analytics is off or failed to load.
export function track(event, properties) {
  ready?.then((posthog) => posthog.capture(event, properties)).catch(() => {});
}
