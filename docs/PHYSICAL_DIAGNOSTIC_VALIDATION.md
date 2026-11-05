# Diagnostic build validation: 2.3.29 / code 80

Source commit: 6b20e3b55675e0d515ee8043641d62ea29b44ba2.

- Initial complete host batch: 152 Node tests and 307 Playwright scenarios passed.
- Native verification exposed console-line truncation; the export-only fix then
  passed 26 affected tests. Native verification also exposed a separate cached
  LocalStorage counter being overwritten by score writes; shared-instance access
  and its regression assertion passed 79 affected tests. Unchanged successful
  unrelated suites were not repeatedly run.
- Actual Zepp Simulator: Balance 2 firmware 1.1.0/API 4.2. Reviewed gameplay,
  pointer movement, natural results and replay. Final complete reports verified
  persisted run indices 1 and 2 with sampling 0 and 13 respectively, including
  98 sampled steps in the latter. Earlier truncated/incomplete reports remain
  preserved as failure evidence. These are functionality/transport checks, not
  physical watch-performance measurements.
- Final build passed and was immediately committed as the source commit above.
- On 5 November 2026, resumed physical Bridge discovery connected to app-Android.
  Bridge install targeted Amazfit Balance 2, rebuilt the preview package, and
  returned `Install lite app result: success.` This record is committed
  immediately after that successful deployment build.
- User-supplied physical device information: firmware 6.4.15.1/API 5.0,
  deviceSource 9568513. Physical game timing reports remain to be collected and
  checked against this source and device identifier. Installation success alone
  does not identify the regression cause or establish restored smoothness.

Full raw evidence, package hashes, transcripts and decoded native reports are
retained outside the app repository in the project documentation workspace at
`performance-regression/physical-debug-2026-11-05/`.
