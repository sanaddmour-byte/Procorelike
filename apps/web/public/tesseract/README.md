# Vendored tesseract.js assets

Self-hosted so OCR (`lib/ocr.ts`) works without reaching tesseract.js's
jsdelivr CDN defaults — construction-site connectivity is often
poor-to-nonexistent, and the OCR feature would otherwise silently break the
moment that CDN is unreachable.

| File | Source | Version |
| --- | --- | --- |
| `worker.min.js` | `tesseract.js` npm package, `dist/worker.min.js` | 6.0.1 |
| `tesseract-core-simd-lstm.wasm(.js)` | `tesseract.js-core` npm package | 6.1.2 |
| `lang-data/eng.traineddata.gz` | `@tesseract.js-data/eng` npm package, `4.0.0_best_int/eng.traineddata.gz` (the LSTM-only variant, matching the SIMD-LSTM core above) | 1.0.0 |

To refresh: bump the pinned version in `lib/ocr.ts`'s import comment, `pnpm add tesseract.js@<version>` and temporarily `pnpm add @tesseract.js-data/eng@<version>` in `apps/web`, re-copy the files listed above from `node_modules/.pnpm/...` into this directory, then remove the temporary `@tesseract.js-data/eng` dependency again (it's not imported anywhere — only used as a one-time source for the vendored file).
