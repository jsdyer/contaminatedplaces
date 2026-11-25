export const STEP_NAMES = {
  '01': 'Identify suspected sites', '02': 'Historical review', '03': 'Initial testing',
  '04': 'Classify site', '05': 'Detailed testing', '06': 'Reclassify site',
  '07': 'Develop cleanup / risk management strategy', '08': 'Implement cleanup / risk management',
  '09': 'Confirmatory sampling and final reporting', '10': 'Long-term monitoring'
};
export const textKey = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const hasLocation = site => Array.isArray(site.geo) && site.geo.length === 2 && site.geo.every(Number.isFinite);
export const officialURL = id => `https://www.tbs-sct.gc.ca/fcsi-rscf/fsi-isf/${encodeURIComponent(id)}-eng.aspx`;
export const stepLabel = steps => steps.length ? steps.map(step => `${Number(step)} · ${STEP_NAMES[step] || 'Unrecognized reported step'}`).join('; ') : 'Not reported';
export function distanceKm(a, b) {
  const rad = Math.PI / 180, dlat = (b[0] - a[0]) * rad, dlon = (b[1] - a[1]) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function prepareSites(sites) {
  return sites.map(site => ({...site, search: textKey([site.id, site.name, site.municipality, site.province, site.country, site.custodian, site.property, ...site.contaminants, ...site.media].join(' '))}));
}
export function filterSites(sites, filters = {}, near = null) {
  const words = textKey(filters.q).trim().split(/\s+/).filter(Boolean);
  const rows = sites.filter(site =>
    words.every(word => site.search.includes(word)) &&
    (!filters.province || (site.province || '__other') === filters.province) &&
    (!filters.status || site.status === filters.status) &&
    (!filters.contaminant || site.contaminants.includes(filters.contaminant)) &&
    (!filters.medium || site.media.includes(filters.medium)) &&
    (!(filters.contaminant && filters.medium) || site.contamination_media.some(([contaminant, medium]) => contaminant === filters.contaminant && medium === filters.medium)) &&
    (!filters.strategy || site.strategies.includes(filters.strategy)) &&
    (!filters.step || site.steps.includes(filters.step)) &&
    (!filters.custodian || site.custodian === filters.custodian) &&
    (!near || (hasLocation(site) && distanceKm(near.geo, site.geo) <= near.radius))
  );
  const rank = {Active: 0, Suspected: 1, Closed: 2};
  return rows.sort((a, b) => {
    if (near) return distanceKm(near.geo, a.geo) - distanceKm(near.geo, b.geo) || a.id.localeCompare(b.id);
    if (filters.sort === 'updated') return b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name);
    if (filters.sort === 'status') return (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
export const FILTER_KEYS = ['q', 'province', 'status', 'contaminant', 'medium', 'strategy', 'step', 'custodian', 'sort'];
export function readFilters(search) {
  const params = new URLSearchParams(search), filters = {};
  for (const key of FILTER_KEYS) filters[key] = (params.get(key) || '').slice(0, 500);
  return filters;
}
export function searchString(filters, selected = '') {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  if (selected) params.set('site', selected);
  return params.toString();
}
function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportCSV(sites, checkedAt) {
  const columns = ['Site ID', 'Name', 'Municipality', 'Province', 'Country', 'Custodian', 'Status', 'Classification', 'Contaminants', 'Media', 'Management strategies', 'Latest fiscal year', 'Highest completed step(s)', 'Record modified', 'Latitude', 'Longitude', 'Official record', 'Source checked UTC'];
  const rows = sites.map(s => [s.id, s.name, s.municipality, s.province, s.country, s.custodian, s.status, s.classification, s.contaminants.join('; '), s.media.join('; '), s.strategies.join('; '), s.fiscal_year, stepLabel(s.steps), s.updated, s.geo?.[0], s.geo?.[1], officialURL(s.id), checkedAt]);
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
