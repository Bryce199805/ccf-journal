# Frontend experience regression

`experience.cjs` runs Chromium against the local Vite server. API requests are
mocked, including delayed responses and failures. It never writes production data.

Start Vite from `web` with `npm run dev`. The test requires Playwright and Chromium.
To keep browser dependencies outside the application:

```sh
npm install --prefix /tmp/ccf-ui-tests playwright
/tmp/ccf-ui-tests/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/ccf-ui-tests/node_modules node web/tests/experience.cjs
```

Run the last command from the repository root. Set `CCF_TEST_ORIGIN` if Vite is on
another port, and optionally `CCF_SCREENSHOTS` to an output directory.

Coverage: hidden tag filters, layout/page persistence, URL restoration/history,
search and filter recovery, slow type changes, list/detail retries, keyboard detail
opening and focus restoration, duplicate favorite clicks, failed note drafts,
Chinese input composition, nested tag dialogs, page jumps, and responsive overflow
at 320, 390, 768, and 1440 pixels.

Run `node web/tests/theme.cjs` with the same environment for visual-theme checks:
system preference, persistent overrides, cross-tab sync, representative color
contrast, semantic legend, and responsive light/dark screenshots. Screenshot data
is synthetic and must not be treated as actual journal rankings or metrics.

Run `node web/tests/details.cjs` for detail-specific regression: long text at
320–1440px, fixed close/footer controls during scrolling, focus restoration,
zero and missing metrics, expandable history and rankings, and malformed optional
JSON fields. API data remains mocked.
