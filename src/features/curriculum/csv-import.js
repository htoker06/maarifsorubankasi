// Müfredat CSV içe aktarma: ayrıştırma, doğrulama ve veritabanı kayıtlarına dönüştürme.
// Bu modül DOM kullanmaz; hem tarayıcıda hem testlerde çalışır.

export const CSV_COLUMNS = [
  { key: 'sinif', label: 'Sınıf (1–12)', required: true },
  { key: 'ders', label: 'Ders adı', required: true },
  { key: 'program_yili', label: 'Öğretim programı yılı', required: false },
  { key: 'tema_sira', label: 'Tema / ünite sıra no', required: true },
  { key: 'tema', label: 'Tema / ünite adı', required: true },
  { key: 'kazanim_kodu', label: 'Öğrenme çıktısı kodu', required: true },
  { key: 'kazanim', label: 'Öğrenme çıktısı metni', required: true },
  { key: 'surec_bilesenleri', label: 'Süreç bileşenleri (| ile ayrılır)', required: false },
];

/** Excel'de Türkçe karakterlerle doğru açılması için UTF-8 BOM ve ; ayracı kullanılır. */
export function buildTemplateCsv(rows = TEMPLATE_ROWS) {
  return toCsv([CSV_COLUMNS.map((c) => c.key), ...rows]);
}

const TEMPLATE_ROWS = [
  ['6', 'Matematik', '2024', '1', 'Sayılar ve Nicelikler (1)', 'ÖRN.M6.1.1', 'Örnek: Asal sayıları ve bölünebilme kurallarını kullanarak çıkarım yapabilme', 'a) Bölünebilme kurallarını açıklar.|b) Asal sayıları belirler.'],
  ['6', 'Matematik', '2024', '1', 'Sayılar ve Nicelikler (1)', 'ÖRN.M6.1.2', 'Örnek: EBOB ve EKOK ile ilgili problemleri çözebilme', ''],
];

export function toCsv(rows, delimiter = ';') {
  const esc = (v) => {
    const s = String(v ?? '');
    return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(esc).join(delimiter)).join('\r\n')}\r\n`;
}

/** Ayraç tespiti: başlık satırında en çok geçen ; , veya sekme. */
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

/** RFC 4180 uyumlu CSV ayrıştırıcı (tırnak içi ayraç, satır sonu ve "" kaçışı desteklenir). */
export function parseCsv(input) {
  const text = String(input ?? '').replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delimiter) row.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) row.push(field), rows.push(row);
  return { delimiter, rows: rows.filter((r) => r.some((c) => c.trim() !== '')) };
}

const normHeader = (h) =>
  h.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/[\s/-]+/g, '_');

// Öğretmenlerin elle yazabileceği farklı başlıklar da kabul edilir.
const HEADER_ALIASES = {
  sinif: ['sinif', 'sinif_duzeyi', 'grade'],
  ders: ['ders', 'ders_adi', 'subject'],
  program_yili: ['program_yili', 'yil', 'program'],
  tema_sira: ['tema_sira', 'tema_no', 'unite_no', 'unite_sira', 'sira'],
  tema: ['tema', 'tema_adi', 'unite', 'unite_adi'],
  kazanim_kodu: ['kazanim_kodu', 'ogrenme_ciktisi_kodu', 'kod'],
  kazanim: ['kazanim', 'kazanim_metni', 'ogrenme_ciktisi', 'ogrenme_ciktisi_metni'],
  surec_bilesenleri: ['surec_bilesenleri', 'surec_bileseni', 'alt_kazanimlar'],
};

export function slugTr(text) {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * CSV metnini doğrular ve müfredat kayıtlarına çevirir.
 * @returns {{ subjects, themes, outcomes, errors: [{line, message}], warnings: [{line, message}], rowCount }}
 */
export function parseCurriculumCsv(text) {
  const { rows } = parseCsv(text);
  const errors = [];
  const warnings = [];
  const result = { subjects: [], themes: [], outcomes: [], errors, warnings, rowCount: 0 };
  if (!rows.length) {
    errors.push({ line: 0, message: 'Dosya boş.' });
    return result;
  }

  const headers = rows[0].map(normHeader);
  const colIndex = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) colIndex[key] = idx;
  }
  const missing = CSV_COLUMNS.filter((c) => c.required && colIndex[c.key] === undefined);
  if (missing.length) {
    errors.push({ line: 1, message: `Eksik sütun(lar): ${missing.map((c) => c.key).join(', ')}. Şablondaki başlıkları kullanın.` });
    return result;
  }

  const subjects = new Map();
  const themes = new Map();
  const outcomes = new Map();

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2; // başlık 1. satır
    const get = (key) => (colIndex[key] === undefined ? '' : String(cells[colIndex[key]] ?? '').trim());
    result.rowCount += 1;

    const grade = Number(get('sinif'));
    const subjectName = get('ders');
    const themeOrder = Number(get('tema_sira'));
    const themeName = get('tema');
    const code = get('kazanim_kodu');
    const outcomeText = get('kazanim');
    const programYear = get('program_yili') ? Number(get('program_yili')) : null;

    const rowErrors = [];
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) rowErrors.push(`Sınıf 1–12 arasında bir sayı olmalı ("${get('sinif')}")`);
    if (!subjectName) rowErrors.push('Ders adı boş');
    if (!Number.isInteger(themeOrder) || themeOrder < 1) rowErrors.push(`Tema sıra no pozitif bir tam sayı olmalı ("${get('tema_sira')}")`);
    if (!themeName) rowErrors.push('Tema adı boş');
    if (!code) rowErrors.push('Kazanım kodu boş');
    if (!outcomeText) rowErrors.push('Kazanım metni boş');
    if (programYear !== null && (!Number.isInteger(programYear) || programYear < 2000 || programYear > 2100)) rowErrors.push(`Program yılı geçersiz ("${get('program_yili')}")`);
    if (rowErrors.length) {
      rowErrors.forEach((message) => errors.push({ line, message }));
      return;
    }

    const subjectId = `g${grade}-${slugTr(subjectName)}`;
    if (!subjects.has(subjectId)) subjects.set(subjectId, { id: subjectId, gradeId: grade, name: subjectName, programYear });
    else if (programYear && subjects.get(subjectId).programYear && subjects.get(subjectId).programYear !== programYear) {
      warnings.push({ line, message: `${grade}. sınıf ${subjectName} için farklı program yılları var; ilk değer (${subjects.get(subjectId).programYear}) kullanıldı.` });
    }

    const themeId = `${subjectId}-t${themeOrder}`;
    if (!themes.has(themeId)) themes.set(themeId, { id: themeId, subjectId, order: themeOrder, name: themeName });
    else if (themes.get(themeId).name !== themeName) {
      errors.push({ line, message: `${themeOrder}. tema için farklı adlar var: "${themes.get(themeId).name}" / "${themeName}"` });
      return;
    }

    // Aynı kod farklı temalarda geçebilir (resmî programlarda olağan); aynı temada iki kez geçemez.
    const key = `${themeId}|${code}`;
    if (outcomes.has(key)) {
      errors.push({ line, message: `"${code}" kodu aynı temada birden fazla kez geçiyor (ilk: ${outcomes.get(key).line}. satır)` });
      return;
    }
    const components = get('surec_bilesenleri')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    outcomes.set(key, { code, themeId, text: outcomeText, processComponents: components, line });
    if (/^ÖRN\./i.test(code)) warnings.push({ line, message: `"${code}" örnek koddur; resmî kodla değiştirin.` });
  });

  result.subjects = [...subjects.values()];
  result.themes = [...themes.values()];
  result.outcomes = [...outcomes.values()].map(({ line, ...o }) => o);
  return result;
}

/** Mevcut müfredatı aynı CSV biçiminde dışa aktarır (düzenleyip geri yüklemek için). */
export function curriculumToCsv({ subjects, themes, outcomes }) {
  const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const themeById = Object.fromEntries(themes.map((t) => [t.id, t]));
  const rows = outcomes
    .map((o) => ({ o, t: themeById[o.themeId] }))
    .filter(({ t }) => t && subjectById[t.subjectId])
    .sort((a, b) => {
      const sa = subjectById[a.t.subjectId];
      const sb = subjectById[b.t.subjectId];
      // Tema içindeki sıra, programdaki (kayıt) sırası olarak korunur
      return sa.gradeId - sb.gradeId || sa.name.localeCompare(sb.name, 'tr') || a.t.order - b.t.order;
    })
    .map(({ o, t }) => {
      const s = subjectById[t.subjectId];
      return [s.gradeId, s.name, s.programYear ?? '', t.order, t.name, o.code, o.text, (o.processComponents ?? []).join('|')];
    });
  return toCsv([CSV_COLUMNS.map((c) => c.key), ...rows]);
}
