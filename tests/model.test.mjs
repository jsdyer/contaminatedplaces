import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareSites,filterSites,distanceKm,readFilters,searchString,exportCSV} from '../web/model.mjs';
const base={id:'0001',name:'Île Test',municipality:'Halifax',province:'Nova Scotia',country:'Canada',custodian:'Test',status:'Active',classification:'',contaminants:['Lead','Oil'],media:['Soil','Groundwater'],contamination_media:[['Lead','Soil'],['Oil','Groundwater']],strategies:['Remediation'],steps:['08'],updated:'2026-11-01',fiscal_year:'2025-2026',geo:[44.65,-63.57],property:''};
const sites=prepareSites([base,{...base,id:'0002',name:'BC Site',municipality:'Langley',province:'British Columbia',geo:[49.1,-122.6],status:'Closed'},{...base,id:'0003',name:'Missing coordinates',geo:null,status:'Suspected'},{...base,id:'0004',name:'Overseas federal record',province:'',country:'France',geo:[48.8,2.3]}]);
test('combined filters include accent-insensitive search and preserve overseas records',()=>{
 assert.deepEqual(filterSites(sites,{q:'ile halifax',province:'Nova Scotia',status:'Active'}).map(x=>x.id),['0001']);
 assert.equal(filterSites(sites,{province:'__other'}).length,1);
 assert.equal(filterSites(sites,{q:'no result'}).length,0);
});
test('contaminant and medium must match the same source pair',()=>{
 assert.equal(filterSites(sites,{contaminant:'Lead',medium:'Groundwater'}).length,0);
 assert.equal(filterSites(sites,{contaminant:'Oil',medium:'Groundwater'}).length,4);
});
test('nearby search excludes missing coordinates and sorts by distance',()=>{
 assert.ok(distanceKm([44.65,-63.57],[44.65,-63.57])<.001);
 assert.ok(distanceKm([44.65,-63.57],[49.1,-122.6])>4000);
 assert.deepEqual(filterSites(sites,{}, {geo:[44.65,-63.57],radius:25}).map(x=>x.id),['0001']);
});
test('search links round-trip filters and never include nearby coordinates',()=>{
 const f={q:'PFAS & oil',province:'Nova Scotia',status:'Active'};
 const search=searchString(f,'0001');assert.equal(readFilters(search).q,f.q);assert.equal(readFilters(search).province,f.province);assert.equal(new URLSearchParams(search).get('site'),'0001');assert.equal(new URLSearchParams(search).has('latitude'),false);
});
test('CSV exports all rows and neutralizes formula strings while retaining numeric coordinates',()=>{
 const text=exportCSV([{...base,name:'=SUM(1,1)'}],'2026-11-25T00:00:00Z');
 assert.ok(text.includes('"\'=SUM(1,1)"'));assert.ok(text.includes('"-63.57"'));assert.ok(!text.includes("'-63.57"));assert.ok(text.includes('2026-11-25T00:00:00Z'));
 assert.equal(exportCSV(sites,'date').split('\r\n').length,6);
});
