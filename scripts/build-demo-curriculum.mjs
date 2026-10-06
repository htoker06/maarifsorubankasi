#!/usr/bin/env node
// Demo Modu müfredatını resmî veriden üretir: 4. sınıf Türkçe, 6. sınıf Matematik ve Fen Bilimleri.
// Kullanım: node scripts/build-demo-curriculum.mjs data/curriculum/meb_tymm_tum_siniflar.csv
import { readFile, writeFile } from 'node:fs/promises';
import { parseCurriculumCsv } from '../src/features/curriculum/csv-import.js';

const DEMO_SUBJECTS = ['g4-turkce', 'g6-matematik', 'g6-fen-bilimleri'];
const src = process.argv[2] ?? 'data/curriculum/meb_tymm_tum_siniflar.csv';
const parsed = parseCurriculumCsv(await readFile(src, 'utf8'));
if (parsed.errors.length) throw new Error(`CSV hatalı: ${parsed.errors[0].message}`);

const subjects = parsed.subjects.filter((s) => DEMO_SUBJECTS.includes(s.id)).map((s) => ({ ...s, programYear: s.programYear ?? 2024 }));
const themes = parsed.themes.filter((t) => DEMO_SUBJECTS.includes(t.subjectId));
const themeIds = new Set(themes.map((t) => t.id));
const outcomes = parsed.outcomes.filter((o) => themeIds.has(o.themeId));

const out = `// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: tymm.meb.gov.tr (Türkiye Yüzyılı Maarif Modeli öğretim programları)
// Yeniden üretmek için: node scripts/build-demo-curriculum.mjs
export const demoSubjects = ${JSON.stringify(subjects, null, 1)};
export const demoThemes = ${JSON.stringify(themes, null, 1)};
export const demoOutcomes = ${JSON.stringify(outcomes)};
`;
await writeFile('src/data/demo-curriculum.js', out);
console.log(`${subjects.length} ders, ${themes.length} tema, ${outcomes.length} öğrenme çıktısı → src/data/demo-curriculum.js`);
