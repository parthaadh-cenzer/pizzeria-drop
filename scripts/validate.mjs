import fs from 'node:fs';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import validator from 'gltf-validator';
const manifest=JSON.parse(fs.readFileSync('assets/manifest.json'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),reports=[];
const paths=[...manifest.characters,...manifest.worlds,...manifest.props].map(a=>a.path).concat(manifest.worlds.map(w=>w.assembled));
for(const file of paths){
 const bytes=fs.readFileSync(`assets/${file}`);const report=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:100});
 reports.push({file,errors:report.issues.numErrors,warnings:report.issues.numWarnings,messages:report.issues.messages});assert.equal(report.issues.numErrors,0,`${file}: glTF validation errors`);
 const doc=await io.readBinary(bytes);for(const a of doc.getRoot().listAccessors())for(const v of a.getArray())assert(Number.isFinite(v),`${file} has nonfinite data`);
 if(file.startsWith('characters/')){assert.deepEqual(doc.getRoot().listAnimations().map(a=>a.getName()).sort(),['dance','fall','hit','idle','jump','landing','recovery','run']);assert(doc.getRoot().listSkins().every(s=>s.listJoints().length===19));assert(bytes.length<1_000_000);}
}
for(const biome of ['volcano','cityscape']){const data=JSON.parse(fs.readFileSync(`assets/worlds/${biome}.layout.json`));assert.equal(data.tiles.length,363);assert.equal(new Set(data.tiles.map(t=>t.id)).size,363);assert.equal(data.tiles.filter(t=>!t.startsPresent).length,18);assert.equal(data.spawnPoints.length,15);for(const p of data.spawnPoints)assert(data.tiles.some(t=>t.level===0&&t.startsPresent&&t.x===p.x&&t.z===p.z));for(const id of data.pickupCandidates)assert(data.tiles.some(t=>t.id===id&&t.startsPresent&&!t.hammer&&t.variant==='normal'));}
for(const kind of ['girl','boy']){const doc=await io.read(`assets/characters/${kind}.glb`);assert(doc.getRoot().listNodes().some(n=>n.getName()==='WeaponSocket'));}
const gun=await io.read('assets/props/rocket-held.glb');for(const name of ['RightGrip','LeftGrip','Muzzle'])assert(gun.getRoot().listNodes().some(n=>n.getName()===name));
fs.writeFileSync('assets/reports/validation.json',JSON.stringify(reports,null,2));console.log(`PASS: ${paths.length} GLBs, finite geometry/animation data, shared 19-joint rigs, 8 clips each, valid 15-player spawn layouts.`);
