# Contaminated Places

[Open Contaminated Places](https://coolcode.ca/contaminatedplaces/)

A searchable map of the complete **Federal Contaminated Sites Inventory**: find a place, inspect reported contaminants and cleanup status, then follow its official record. The browser app needs no account, installation or API key.

<!-- coolcode:guide -->
Search Halifax or choose British Columbia, then narrow the results by contaminant, inventory status, management strategy or completed cleanup step. Select a site for its custodian, record date and reported contaminant/media pairs. Download every matching result as CSV, or copy a link to the current search and selected site. Nearby search accepts coordinates or optional browser location permission. Closed records remain searchable; a listing alone is not evidence of present-day danger.
<!-- /coolcode:guide -->

## What is included

The complete federal export is retained, including records without coordinates and overseas federal sites. The province selector groups missing provinces under **Outside Canada / province not reported**. This is not an inventory of every contaminated property: provincial, municipal and private sites outside federal responsibility may be absent.

- Search site names, municipality, province, country, federal site ID, custodian, property number, contaminants and media. Search words are combined and accents are ignored.
- Combine province, status, contaminant, affected medium, management strategy, custodian and latest reported cleanup step. When both a contaminant and medium are selected, they must occur in the **same reported pair**.
- Browse all matching records with 25 results per page. CSV exports contain **all** matches, including unmapped sites. Numeric coordinates remain numeric; untrusted text beginning with a spreadsheet formula character is neutralized.
- Use optional nearby search (1–2,000 km). Results use straight-line distance and exclude records without usable coordinates. Other filters still apply. The selected location is kept only in the tab and is omitted from shared links.
- Zoom map point groups or choose an individual record within an overlapping group. The local Natural Earth outline map works without an external map service. Street tiles from OpenStreetMap are optional.
- BC and Nova Scotia records link directly to [Toxic Ground](https://coolcode.ca/toxic-ground/) for their year-by-year spending and investigation history. Contaminated Places concentrates on nationwide current discovery; Toxic Ground provides deeper regional history.

**Read status, classification and cleanup step separately.** Closed can mean no contamination was found or work was completed. Suspected means further assessment is needed. An active record can be in assessment, remediation, risk management or monitoring. The latest completed step is taken from the latest fiscal year, not from the highest step ever reported. Conflicting steps in the same latest year are preserved. None of these labels is a safety certificate.

## Data and dates

Source: Treasury Board of Canada Secretariat, [Federal Contaminated Sites Inventory](https://open.canada.ca/data/en/dataset/1d42f7b9-1549-40aa-8ac6-0e0302ff2902), [official ZIP/XML export](https://map-carte.tbs-sct.gc.ca/fcsi-rscf/oddo/fcsi-rscf.zip).

A successful refresh records its actual UTC check time in `data/status.json` (`checked_at`, also date-only `retrieved`). `source_modified` is the download server's Last-Modified header, not the date every individual record was updated. Site-modified dates and latest fiscal years are preserved separately. The source ZIP SHA-256 is recorded for reproducibility. The page warns when its last successful check is more than 14 days old.

The initial verified import on **2026-11-25 UTC** contains **24,433 records**, including **23,509 with usable coordinates**. These figures are an import receipt, not a fixed application limit: filters, map groups, pages and exports derive from each snapshot. HTTP 200 was verified for the official download and a sample official site-detail link. Missing, out-of-range, non-finite and zero/zero coordinates remain in the list but are not mapped.

Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). Natural Earth outlines derive from its public-domain 1:50m admin-1 dataset. Leaflet 1.9.4 is bundled under its [BSD licence](web/vendor/LICENSE). Optional map tiles contain © OpenStreetMap contributors. Source data can contain omissions or outdated records; verify a site's current circumstances with its official custodian.

## Refresh, test and build

Python 3.12+ and Node 24+ are used in CI. The application and build use no npm dependencies. Playwright is a browser-test dependency only.

```sh
python3 scripts/refresh.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. Ordinary builds are offline: `data/sites.json.gz` is the validated checked-in snapshot, expanded to `dist/data/sites.json`. `data/status.json` is copied to `dist/data/status.json` for the page and external freshness monitoring. `dist/` is generated and is never committed.

For the browser test, install `tests/browser-requirements.txt`, provide an existing Chromium with `CHROMIUM_PATH=/path/to/chromium`, then run `python3 tests/browser_smoke.py` after the build. The test exercises the app at a project subpath, searching, selection, official/history links, selected-record deep links, export, empty results, nearby search and a mobile viewport.

Configuration lives in [`config/source.json`](config/source.json): official download and catalogue URLs, timeouts, size limits, minimum coverage and permitted record-count decline. Change these only after reviewing an upstream schema or coverage change; they are integrity guards, not result limits. Adding or changing filters does not require rebuilding the source export format unless its fields change. There is no fixed province or site watchlist.

A refresh validates the entire download before replacing the cache, including ZIP/XML structure, IDs, coordinates, inventory status, complete provincial coverage and unexpected record loss. Failed downloads, HTTP 403/404, malformed data or failing tests stop the workflow and retain the previous working deployment and its truthful check date.

## Publication and schedule

`.github/workflows/pages.yml` checks every push and pull request. Only successful `main` builds publish through GitHub Pages; PRs receive preview artifacts. The workflow configures Pages with `enablement: true` and deploys only `dist/`.

The same workflow refreshes the source every **Wednesday at 11:23 UTC** (`23 11 * * 3`) and on pushes to `main` or manual `workflow_dispatch`, with no required inputs. These refreshes commit the validated snapshot after tests, then publish it. Pull requests test the checked-in snapshot without contacting the source. Concurrent publications are serialized, and a push conflict fails instead of overwriting another commit.

The independent `.github/workflows/schedule-guard.yml` runs each Wednesday at 19:17 UTC. It explicitly covers `pages.yml` and itself, restores inactivity-disabled workflows, and preserves workflows disabled manually. GitHub schedules can still be delayed or dropped; the central CoolCode watchdog monitors `data/status.json` and can dispatch the refresh independently once repository permission is granted.

Central integration belongs in `jsdyer/jsdyer.github.io`: reviewed `tool.json` catalogue record, this README guide, repository accounting, generated Cloudflare ID registry, operations/watchdog target and freshness probe, and generated sitemap. No API keys or registration are required.

## Privacy

Search and filter calculations run in the browser using the published data. Filters and the selected record appear in the URL so searches can be shared. Nearby coordinates are never stored in local storage or inserted in the URL. Browser geolocation runs only after pressing **Use my location**. Optional OpenStreetMap tiles send tile requests to that provider; clicking an official link opens the government website.

## Ready-to-use searches

- [Federal Contaminated Sites in Langley, BC](https://coolcode.ca/contaminatedplaces/langley.html). Explore federal inventory records matching Langley in British Columbia. Choose a site to inspect its reported status, contaminants, cleanup stage and official record. Closed records are included.
- [Federal Contaminated Sites in Halifax, Nova Scotia](https://coolcode.ca/contaminatedplaces/halifax.html). Explore federal inventory records matching Halifax in Nova Scotia. Filter by contaminant or cleanup stage, then select a result to open the federal custodian’s record. Federal inventory coverage differs from provincial site registries.
