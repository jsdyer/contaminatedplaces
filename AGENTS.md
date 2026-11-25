# Working on Contaminated Places

- Keep browser source in `web/`, build/ingestion code in `scripts/`, validated compressed snapshots in `data/`, configuration in `config/`, and meaningful tests in `tests/`. Never commit `dist/`.
- This is a finished national FCSI discovery tool, not a starter. Preserve its identity and public `/contaminatedplaces/` path. Do not add a CNAME.
- Keep data transformations separate from DOM code. Render external text using textContent, not innerHTML. No API secrets belong in browser code.
- `config/source.json` owns source URLs and ingestion guards. Do not turn a source outage into a successful empty data refresh. Preserve the prior snapshot and check date on failure.
- Source check time, server Last-Modified, record modification date and fiscal reporting year have different meanings. Never substitute one for another.
- Keep all source records, including overseas sites and missing coordinates. Derive filters/counts from captured data. When combining contaminant and medium, match their source pair.
- Do not infer present danger, remediation completeness or property safety from inventory membership, status or completed step. Keep published labels accurate.
- Location search is opt-in and tab-local. Do not persist coordinates or include them in shared URLs. Preserve the offline outline map and optional street tiles.
- Run `node --test tests/*.test.mjs`, `python3 -m unittest discover -s tests -v`, `python3 scripts/build.py`, and the browser smoke check when its installed Chromium is available.
- Update the README's marked guide for changed inputs/results/coverage/schedules. Reconcile tool.json and the main catalogue using the hub's docs/tool-lifecycle.md. New schedules require guard and watchdog review.
