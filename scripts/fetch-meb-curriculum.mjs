#!/usr/bin/env node
// MEB Türkiye Yüzyılı Maarif Modeli öğretim programlarından (tymm.meb.gov.tr) tema / ünite ve
// öğrenme çıktılarını çekip SoruBankasıMatik'in içe aktarma biçiminde CSV (ve ayrıntılı JSON) üretir.
//
// Kullanım:
//   node scripts/fetch-meb-curriculum.mjs                 # 1–12. sınıfların tümü
//   node scripts/fetch-meb-curriculum.mjs --grades 6,9    # yalnızca belirli sınıflar
//   node scripts/fetch-meb-curriculum.mjs --out data/curriculum
//
// Yanıtlar .cache/meb/ altında saklanır; tekrar çalıştırınca siteye yeniden istek atılmaz
// (--no-cache ile kapatılır). Siteyi yormamak için istekler sırayla ve aralıklı gönderilir.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { toCsv, CSV_COLUMNS } from '../src/features/curriculum/csv-import.js';
import { parseUnitPage, cleanSubjectName, parseUnitTitle } from './lib/meb-parse.mjs';

const BASE = 'https://tymm.meb.gov.tr';
const DELAY_MS = 150;

// Sitedeki sınıf kimlikleri (kademe 2 = temel eğitim, 3 = ortaöğretim)
const GRADE_MAP = {
  1: { sinifId: 2, kademe: 2 }, 2: { sinifId: 3, kademe: 2 }, 3: { sinifId: 4, kademe: 2 }, 4: { sinifId: 5, kademe: 2 },
  5: { sinifId: 6, kademe: 2 }, 6: { sinifId: 7, kademe: 2 }, 7: { sinifId: 8, kademe: 2 }, 8: { sinifId: 9, kademe: 2 },
  9: { sinifId: 11, kademe: 3 }, 10: { sinifId: 12, kademe: 3 }, 11: { sinifId: 13, kademe: 3 }, 12: { sinifId: 14, kademe: 3 },
};

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const grades = (argValue('--grades') ?? Object.keys(GRADE_MAP).join(',')).split(',').map(Number).filter((g) => GRADE_MAP[g]);
const outDir = argValue('--out') ?? 'data/curriculum';
const useCache = !args.includes('--no-cache');
const cacheDir = '.cache/meb';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, type = 'text') {
  const file = path.join(cacheDir, `${createHash('sha1').update(url).digest('hex')}.${type === 'json' ? 'json' : 'html'}`);
  if (useCache && existsSync(file)) {
    const raw = await readFile(file, 'utf8');
    return type === 'json' ? JSON.parse(raw) : raw;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await sleep(DELAY_MS);
      const res = await fetch(url, { headers: { 'User-Agent': 'SoruBankasiMatik-curriculum-import/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, raw);
      return type === 'json' ? JSON.parse(raw) : raw;
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${err.message}`);
      await sleep(1000 * attempt);
    }
  }
}

const rows = [];
const detailed = [];
const report = [];

for (const grade of grades) {
  const { sinifId, kademe } = GRADE_MAP[grade];
  const subjects = await get(`${BASE}/Ders/GetDerslerBySinif?sinifId=${sinifId}&kademe=${kademe}&programListedOnly=true`, 'json');
  for (const subject of subjects) {
    const subjectName = cleanSubjectName(subject.dersAdi);
    const units = await get(`${BASE}/Unite/GetUnitelerByDersId?dersId=${subject.id}&sinifId=${sinifId}`, 'json');
    let subjectOutcomes = 0;
    // Tema sırası sitedeki listeleme sırasından alınır: başlıklardaki numaralar tekrar edebiliyor
    // (ör. 6. sınıf Matematik'te "Sayılar ve Nicelikler (1)" ve "(2)" ikisi de "1." ile başlıyor).
    for (const [index, unit] of units.entries()) {
      const unitUrl = `${BASE}/${unit.url}/unite/${unit.id}`;
      const pageHtml = await get(unitUrl);
      const parsedTitle = parseUnitTitle(unit.title, unit.duzeyAd);
      const order = index + 1;
      const page = parseUnitPage(pageHtml);
      subjectOutcomes += page.outcomes.length;
      detailed.push({ grade, subject: subjectName, subjectId: subject.id, unitId: unit.id, order, theme: parsedTitle.name, source: unitUrl, ...page.meta, outcomes: page.outcomes });
      const codesInTheme = new Map();
      for (const o of page.outcomes) {
        // Sitede aynı temada birebir tekrar eden satırlar atlanır; metni farklıysa ilki tutulur ve raporlanır
        if (codesInTheme.has(o.code)) {
          if (codesInTheme.get(o.code) !== o.text) report.push(`UYARI: "${o.code}" aynı temada farklı metinlerle iki kez geçiyor; ilki alındı (${grade}. sınıf ${subjectName}, ${parsedTitle.name})`);
          continue;
        }
        codesInTheme.set(o.code, o.text);
        rows.push([grade, subjectName, '', order, parsedTitle.name, o.code, o.text, o.components.join('|')]);
      }
      if (!page.outcomes.length && unit.title?.trim()) report.push(`UYARI: öğrenme çıktısı bulunamadı → ${grade}. sınıf ${subjectName} / ${unit.title} (${unitUrl})`);
    }
    console.log(`${grade}. sınıf ${subjectName}: ${units.length} ünite, ${subjectOutcomes} öğrenme çıktısı`);
  }
}

// Aynı temada tekrar eden kodları raporla. (Farklı temalarda aynı kod olağandır: ör. Türkçe'de
// beceriler temalar boyunca tekrarlanır; İngilizce programlarında da aynı kodlar birden çok ünitede geçer.)
const seen = new Set();
let crossTheme = 0;
const codesSeen = new Set();
for (const r of rows) {
  const key = `${r[0]}|${r[1]}|${r[3]}|${r[5]}`;
  if (seen.has(key)) report.push(`UYARI: "${r[5]}" kodu aynı temada iki kez geçiyor (${r[0]}. sınıf ${r[1]}, ${r[4]})`);
  seen.add(key);
  const codeKey = `${r[0]}|${r[1]}|${r[5]}`;
  if (codesSeen.has(codeKey)) crossTheme += 1;
  codesSeen.add(codeKey);
}
if (crossTheme) console.log(`Bilgi: ${crossTheme} öğrenme çıktısı kodu birden fazla temada tekrar ediyor (programın yapısı gereği).`);

await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const suffix = grades.length === 12 ? 'tum_siniflar' : `sinif_${grades.join('-')}`;
const csvPath = path.join(outDir, `meb_tymm_${suffix}.csv`);
const jsonPath = path.join(outDir, `meb_tymm_${suffix}.json`);
await writeFile(csvPath, toCsv([CSV_COLUMNS.map((c) => c.key), ...rows]));
await writeFile(jsonPath, JSON.stringify({ source: BASE, fetchedAt: stamp, units: detailed }));

console.log(`\n${rows.length} öğrenme çıktısı yazıldı → ${csvPath}`);
console.log(`Ayrıntılı ünite bilgileri (beceriler, değerler, içerik çerçevesi) → ${jsonPath}`);
if (report.length) console.log(`\n${report.length} uyarı:\n${report.join('\n')}`);
