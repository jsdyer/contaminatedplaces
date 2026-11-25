import {FILTER_KEYS, STEP_NAMES, prepareSites, filterSites, hasLocation, officialURL, stepLabel, distanceKm, readFilters, searchString, exportCSV} from './model.mjs';
const $ = id => document.getElementById(id);
const element = (tag, text, className) => {const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node;};
const number = value => value.toLocaleString('en-CA');
let sites = [], matching = [], status, currentPage = 0, selected = '', near = null, map, pointLayer, streetLayer, nearLayer;
const pageSize = 25;
const filters = () => Object.fromEntries(FILTER_KEYS.map(key => [key, $(key).value]));
function updateURL() {const query = searchString(filters(), selected); history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));}
function fillSelect(id, values, label = value => value) {
  for (const value of [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))) {
    const option = element('option', label(value)); option.value = value; $(id).append(option);
  }
}
function populate() {
  fillSelect('province', sites.map(s => s.province || '__other'), v => v === '__other' ? 'Outside Canada / province not reported' : v);
  fillSelect('status', sites.map(s => s.status));
  for (const [id, key] of [['contaminant', 'contaminants'], ['medium', 'media'], ['strategy', 'strategies'], ['step', 'steps']]) {
    fillSelect(id, sites.flatMap(s => s[key]), v => id === 'step' ? `${Number(v)} · ${STEP_NAMES[v] || 'Reported step'}` : v);
  }
  fillSelect('custodian', sites.map(s => s.custodian));
  const stored = readFilters(location.search);
  for (const key of FILTER_KEYS) $(key).value = stored[key];
}
function showDetails(site, focus = false) {
  selected = site.id; const panel = $('details'); panel.replaceChildren();
  const heading = element('h3', site.name); heading.id = 'detail-title'; heading.tabIndex = -1; panel.append(heading);
  const summary = element('p', `${site.municipality || 'Municipality not reported'} · ${site.province || site.country || 'Location not reported'}`); panel.append(summary);
  const list = element('dl');
  const facts = [
    ['Federal site ID', site.id], ['Inventory status', site.status], ['Classification', site.classification || 'Not reported'],
    ['Federal custodian', site.custodian || 'Not reported'], ['Management strategy', site.strategies.join('; ') || 'Not reported'],
    ['Latest fiscal year', site.fiscal_year || 'Not reported'], ['Highest completed step', stepLabel(site.steps)],
    ['Record modified', site.updated || 'Not reported'], ['Coordinates', hasLocation(site) ? site.geo.join(', ') : 'Not published / unusable']
  ];
  if (near && hasLocation(site)) facts.push(['Distance from search point', `${distanceKm(near.geo, site.geo).toFixed(1)} km (straight line)`]);
  for (const [label, value] of facts) list.append(element('dt', label), element('dd', value));
  panel.append(list);
  if (site.description) panel.append(element('h4', 'Reported status details'), element('p', site.description));
  panel.append(element('h4', 'Reported contaminants and media'));
  if (site.contamination_media.length) {
    const pairs = element('ul'); for (const [contaminant, medium] of site.contamination_media) pairs.append(element('li', `${contaminant || 'Contaminant not specified'} — ${medium || 'Medium not specified'}`)); panel.append(pairs);
  } else panel.append(element('p', 'No contaminant/media pairs published for this record. This does not establish that no contamination exists.'));
  if (site.action_plan) panel.append(element('h4', 'Action plan'), element('p', site.action_plan));
  if (site.information) panel.append(element('h4', 'Additional information'), element('p', site.information));
  const official = element('a', 'Open the official federal record'); official.href = officialURL(site.id); const officialP = element('p'); officialP.append(official); panel.append(officialP);
  if (['British Columbia', 'Nova Scotia'].includes(site.province)) {
    const history = element('a', 'Explore year-by-year history in Toxic Ground');
    history.href = `https://coolcode.ca/toxic-ground/?region=${site.province === 'British Columbia' ? 'BC' : 'NS'}&id=${encodeURIComponent(site.id)}`;
    const historyP = element('p'); historyP.append(history); panel.append(historyP);
  }
  if (hasLocation(site) && map) {
    const show = element('button', 'Show this site on the map'); show.type = 'button';
    show.onclick = () => {map.setView(site.geo, 13); $('map').scrollIntoView({block: 'center'});}; panel.append(show);
  }
  panel.append(element('p', 'A record describes the inventory’s reported status. Verify current conditions with the official custodian.', 'muted'));
  updateURL(); drawList(); if (focus) heading.focus({preventScroll: false});
}
function drawList() {
  const container = $('results'); container.replaceChildren();
  if (!matching.length) container.append(element('p', 'No sites match these filters. Try fewer filters, a broader place name or a larger nearby radius.', 'empty'));
  for (const site of matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize)) {
    const button = element('button', undefined, `result${site.id === selected ? ' selected' : ''}`); button.type = 'button';
    button.append(element('strong', site.name), element('small', `${site.municipality || 'Location not reported'} · ${site.province || site.country || 'Province not reported'}`));
    button.append(element('small', `${site.status} · ${site.id}${near && hasLocation(site) ? ` · ${distanceKm(near.geo, site.geo).toFixed(1)} km` : ''}`));
    button.addEventListener('click', () => showDetails(site, true)); container.append(button);
  }
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  $('page-number').textContent = `Page ${currentPage + 1} of ${number(pages)}`;
  $('previous').disabled = currentPage === 0; $('next').disabled = currentPage + 1 >= pages;
}
function fitMap() {
  if (!map) return;
  const coords = matching.filter(hasLocation).map(s => s.geo);
  if (coords.length) map.fitBounds(coords, {padding: [25, 25], maxZoom: 13});
}
function drawMap() {
  if (!map) return;
  pointLayer.clearLayers();
  const colours = {Active: '#be4c2c', Suspected: '#a7780b', Closed: '#567b89'};
  // Aggregate points into screen-space groups at small scales to keep all records interactive.
  const groups = new Map();
  for (const site of matching) {
    if (!hasLocation(site)) continue;
    const pixel = map.project(site.geo, map.getZoom()), cell = map.getZoom() < 12 ? 22 : 8;
    const key = `${Math.floor(pixel.x / cell)}:${Math.floor(pixel.y / cell)}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(site);
  }
  for (const group of groups.values()) {
    const first = group[0]; const coord = [group.reduce((s, r) => s + r.geo[0], 0) / group.length, group.reduce((s, r) => s + r.geo[1], 0) / group.length];
    const colour = group.length === 1 ? colours[first.status] || '#567b89' : '#176f79';
    const point = L.circleMarker(coord, {radius: group.length === 1 ? 5 : Math.min(18, 7 + Math.log2(group.length)), color: '#fff', weight: 1, fillColor: colour, fillOpacity: .85}).addTo(pointLayer);
    const popup = element('div');
    if (group.length === 1) {
      popup.append(element('strong', first.name), element('p', `${first.status} · ${first.municipality}`));
      const choose = element('button', 'Read site details'); choose.onclick = () => showDetails(first, true); popup.append(choose);
    } else {
      popup.append(element('strong', `${number(group.length)} nearby or overlapping sites`));
      const zoom = element('button', 'Zoom to this group'); zoom.onclick = () => map.fitBounds(group.map(s => s.geo), {padding: [30, 30], maxZoom: Math.min(18, map.getZoom() + 3)}); popup.append(zoom);
      const choices = element('select'); choices.setAttribute('aria-label', 'Choose a site in this map group'); choices.append(element('option', 'Choose a site…'));
      choices.firstElementChild.value = '';
      for (const item of group.slice().sort((a,b) => a.name.localeCompare(b.name))) {const option = element('option', `${item.name} · ${item.id}`); option.value = item.id; choices.append(option);}
      choices.onchange = () => {const site = group.find(s => s.id === choices.value); if (site) showDetails(site, true);}; popup.append(choices);
    }
    point.bindPopup(popup); point.bindTooltip(group.length === 1 ? element('span', first.name) : element('span', `${number(group.length)} sites`));
  }
}
function render(fit = false) {
  if (!status) return;
  matching = filterSites(sites, filters(), near); currentPage = 0;
  const mapped = matching.filter(hasLocation).length;
  $('result-count').textContent = `${number(matching.length)} matching sites · ${number(mapped)} mapped · ${number(matching.length - mapped)} without coordinates`;
  $('map-status').textContent = `${number(mapped)} matching sites on the map. Larger teal points group nearby records; zoom in or choose a record within the group. ${number(matching.length - mapped)} records without coordinates remain in the list and CSV.`;
  $('download').disabled = matching.length === 0;
  if (selected && !matching.some(s => s.id === selected)) {
    selected = ''; $('details').replaceChildren(element('h3', 'Choose a site'), element('p', 'The previous selection is outside these filters. Choose a matching result.')); $('details').firstElementChild.id = 'detail-title';
  }
  drawList(); updateURL(); if (fit && map && matching.some(hasLocation)) fitMap(); drawMap();
  if (nearLayer && map) {map.removeLayer(nearLayer); nearLayer = null;}
  if (near && map) nearLayer = L.circle(near.geo, {radius: near.radius * 1000, color: '#007a81', fill: false, weight: 2, interactive: false}).addTo(map);
}
function clearNear() {near = null; $('near-status').textContent = ''; $('clear-near').hidden = true;}
function reset() {for (const key of FILTER_KEYS) $(key).value = ''; selected = ''; clearNear(); render(true);}
function setNearby(lat, lon) {
  const radius = Number($('radius').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 1 || radius > 2000) { $('near-status').textContent = 'Enter valid latitude (−90 to 90), longitude (−180 to 180), and radius (1 to 2,000 km).'; return; }
  selected = ''; $('details').replaceChildren(element('h3', 'Choose a site'), element('p', 'Choose a nearby result to see its distance and record.')); $('details').firstElementChild.id = 'detail-title';
  near = {geo: [lat, lon], radius}; $('latitude').value = lat.toFixed(5); $('longitude').value = lon.toFixed(5);
  $('near-status').textContent = `Within ${number(radius)} km of ${lat.toFixed(4)}, ${lon.toFixed(4)}. Other selected filters still apply. Location is not included in shared links.`;
  $('clear-near').hidden = false; render(true);
}
async function init() {
  const responses = await Promise.all([fetch('./data/status.json'), fetch('./data/sites.json')]);
  if (responses.some(response => !response.ok)) throw new Error('Could not load the published snapshot');
  const [edition, payload] = await Promise.all(responses.map(response => response.json()));
  if (payload.schema_version !== 1 || payload.sites.length !== edition.count) throw new Error('The snapshot and check metadata do not match. Reload to retry.');
  status = edition; sites = prepareSites(payload.sites); populate();
  $('edition').textContent = `${number(status.count)} federal sites · Source checked ${status.checked_at.replace('T', ' ').replace('Z', ' UTC')} · Source file modified ${status.source_modified?.slice(0, 10) || 'not supplied'} · Latest fiscal year ${status.latest_fiscal_year}. Scheduled checks: weekly.`;
  if (Date.now() - Date.parse(status.checked_at) > 14 * 86400000) $('edition').append(' The last successful source check is over two weeks old; use the official record to verify current information.');
  if (globalThis.L) {
    map = L.map('map', {preferCanvas: true, scrollWheelZoom: false, minZoom: 2}).setView([58, -96], 3);
    map.attributionControl.addAttribution('Outlines: Natural Earth'); pointLayer = L.layerGroup().addTo(map);
    map.on('zoomend', drawMap);
    fetch('./basemap.json').then(r => {if (!r.ok) throw new Error('outline fetch'); return r.json();}).then(data => L.geoJSON(data, {style: {color: '#9aafb7', weight: .7, fillColor: '#f7fafb', fillOpacity: .8}, interactive: false}).addTo(map).bringToBack()).catch(() => {$('map-status').textContent += ' Local outlines could not load; site points and results remain available.';});
  } else $('map').replaceChildren(element('p', 'The map could not load. Search, results, site details and downloads still work.'));
  const chosen = new URLSearchParams(location.search).get('site');
  render(false);
  if (chosen) {const site = matching.find(s => s.id === chosen); if (site) showDetails(site);}
}
let searchTimer;
$('q').addEventListener('input', () => {clearTimeout(searchTimer); searchTimer = setTimeout(() => render(true), 160);});
for (const key of FILTER_KEYS.filter(key => key !== 'q')) $(key).addEventListener('change', () => render(key !== 'sort'));
for (const button of document.querySelectorAll('[data-province]')) button.addEventListener('click', () => {reset(); $('province').value = button.dataset.province; render(true);});
$('all-canada').onclick = reset; $('reset').onclick = reset;
$('previous').onclick = () => {currentPage--; drawList(); $('results').scrollIntoView({block: 'start'});};
$('next').onclick = () => {currentPage++; drawList(); $('results').scrollIntoView({block: 'start'});};
$('fit-map').onclick = fitMap;
$('street-map').onchange = () => {
  if (!map) return;
  if ($('street-map').checked) {
    streetLayer ||= L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'});
    streetLayer.addTo(map); streetLayer.on('tileerror', () => {$('map-status').textContent = 'Some street tiles could not load. Site points, local outlines and the results list remain available.';});
  } else if (streetLayer) map.removeLayer(streetLayer);
};
$('near-coordinates').onclick = () => {if (!$('latitude').value.trim() || !$('longitude').value.trim()) {$('near-status').textContent = 'Enter both latitude and longitude.'; return;} setNearby(Number($('latitude').value), Number($('longitude').value));};
$('near-me').onclick = () => {
  if (!navigator.geolocation) {$('near-status').textContent = 'This browser does not provide location. Enter coordinates instead.'; return;}
  $('near-status').textContent = 'Waiting for location permission…';
  navigator.geolocation.getCurrentPosition(p => setNearby(p.coords.latitude, p.coords.longitude), () => {$('near-status').textContent = 'Location was unavailable or permission was declined. Enter coordinates instead.';}, {timeout: 15000, maximumAge: 60000, enableHighAccuracy: false});
};
$('clear-near').onclick = () => {clearNear(); render(true);};
$('download').onclick = () => {const url = URL.createObjectURL(new Blob(['\uFEFF', exportCSV(matching, status.checked_at)], {type: 'text/csv;charset=utf-8'})); const link = element('a'); link.href = url; link.download = 'contaminated-places.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('action-status').textContent = `Downloaded all ${number(matching.length)} matching records.`;};
$('share').onclick = async () => {
  updateURL(); try {await navigator.clipboard.writeText(location.href); $('action-status').textContent = near ? 'Search link copied. Nearby coordinates are private to this tab and are not included.' : 'Search link copied.';} catch { $('action-status').replaceChildren(element('span', 'Copy this link: ')); const input = element('input'); input.readOnly = true; input.value = location.href; input.setAttribute('aria-label', 'Shareable search link'); $('action-status').append(input); input.select(); }
};
init().catch(error => { $('edition').textContent = 'The published data could not be loaded. Reload to try again, or open the official inventory below.'; $('result-count').textContent = error.message; $('download').disabled = true; });
