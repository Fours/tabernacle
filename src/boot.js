// Entry point: start analytics first, then load the scene. main.js is a large bundle that also
// builds the whole scene before the loading screen goes, so starting analytics from inside it
// would miss visitors who leave during the load (src/analytics.js).
import { initAnalytics, track } from './analytics.js';

initAnalytics();
import('./main.js').catch((error) => {
  track('scene_load_failed', { message: String(error?.message ?? error) });
  throw error;
});
