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
