#!/usr/bin/env node
// data/curriculum/meb_tymm_tum_siniflar.json → public/data/meb-mufredat.json
// Yönetici panelindeki "Resmî MEB müfredatını yükle" düğmesinin kullandığı, ünite bilgileriyle (beceriler, değerler,
// içerik çerçevesi, anahtar kavramlar) birlikte içe aktarılabilir paket.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { slugTr } from '../src/features/curriculum/csv-import.js';

const src = JSON.parse(await readFile(process.argv[2] ?? 'data/curriculum/meb_tymm_tum_siniflar.json', 'utf8'));
const subjects = new Map();
const themes = [];
const outcomes = [];
for (const u of src.units) {
  if (!u.outcomes?.length) continue;
  const subjectId = `g${u.grade}-${slugTr(u.subject)}`;
  if (!subjects.has(subjectId)) subjects.set(subjectId, { id: subjectId, gradeId: u.grade, name: u.subject, programYear: null });
  const themeId = `${subjectId}-t${u.order}`;
  const meta = Object.fromEntries(
    ['summary', 'hours', 'fieldSkills', 'conceptualSkills', 'dispositions', 'sel', 'values', 'literacies', 'content', 'keyConcepts']
      .filter((k) => u[k] !== undefined && !(Array.isArray(u[k]) && !u[k].length))
      .map((k) => [k, u[k]]),
  );
  meta.source = u.source;
  themes.push({ id: themeId, subjectId, order: u.order, name: u.theme, meta });
  const seen = new Set();
  for (const o of u.outcomes) {
    if (seen.has(o.code)) continue;
    seen.add(o.code);
    outcomes.push({ themeId, code: o.code, text: o.text, processComponents: o.components });
  }
}
await mkdir('public/data', { recursive: true });
const out = { source: src.source, fetchedAt: src.fetchedAt, subjects: [...subjects.values()], themes, outcomes };
await writeFile('public/data/meb-mufredat.json', JSON.stringify(out));
console.log(`${out.subjects.length} ders, ${themes.length} tema, ${outcomes.length} öğrenme çıktısı → public/data/meb-mufredat.json`);
