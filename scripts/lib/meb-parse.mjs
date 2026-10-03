// tymm.meb.gov.tr ünite sayfalarını ayrıştıran yardımcılar (bağımlılıksız; testlerde de kullanılır).

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Bir içerik kutusunun HTML'ini satırlara çevirir: <p> ve <br> satır sonu, diğer etiketler (strong, em, a) silinir. */
export function contentToLines(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Ünite sayfasındaki "başlık kutusu → içerik kutusu" çiftlerini { başlık: html } olarak döndürür. */
export function extractSections(html) {
  const sections = {};
  const re = /<div class="col-md-3[^"]*\btitle\b[^"]*">\s*([\s\S]*?)\s*<\/div>\s*<div class="col-md-9[^"]*\bcontent\b[^"]*">([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(re)) {
    const label = decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (label && !(label in sections)) sections[label] = m[2];
  }
  return sections;
}

// "FB.6.1.1." "MAT.5.2.3." "T.D.4.1" "ENG.6.1.L1" "TDE1.1." gibi öğrenme çıktısı kodları
const OUTCOME_RE = /^([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9]{0,9}\.(?:[0-9A-Za-zÇĞİÖŞÜçğıöşü]+\.)*[0-9A-Za-z]+)\.?\s+(.+)$/;
// Bazı programlarda çıktılar "Okuma", "Yazma", "Metin Tahlili (Anlama)" gibi alt başlıklarla gruplanır
const isHeading = (line) => line.length <= 40 && /^[A-ZÇĞİÖŞÜ]/.test(line) && !/[.:;]$/.test(line);
// Süreç bileşenleri: "a) ...", "ç) ...", "ğ) ..."
const COMPONENT_RE = /^([a-zçğıöşü])\)\s*(.+)$/;

/**
 * "Metin. a) Bir. b) İki." → ["Metin.", "a) Bir.", "b) İki."]
 * Yalnızca a) ile başlayan ve alfabetik sırayla devam eden işaretlerde böler (metin içindeki rastgele "x)" ifadelerine dokunmaz).
 */
const TR_LETTERS = 'abcçdefgğhıijklmnoöprsştuüvyz';
export function splitInlineComponents(text) {
  const parts = text.split(/\s+(?=[a-zçğıöşü]\)\s)/);
  if (parts.length < 2) return [text.trim()];
  const head = COMPONENT_RE.test(parts[0]) ? null : parts.shift();
  const letters = parts.map((p) => p[0]);
  const startIdx = TR_LETTERS.indexOf(letters[0]);
  const sequential = letters.every((l, i) => TR_LETTERS.indexOf(l) > (i === 0 ? -1 : TR_LETTERS.indexOf(letters[i - 1])));
  if (!sequential || (head !== null && startIdx !== 0)) return [text.trim()];
  return [...(head !== null ? [head.trim()] : []), ...parts.map((p) => p.trim())];
}

const META_LABELS = {
  'Ders Saati': 'hours',
  'Alan Becerileri': 'fieldSkills',
  'Kavramsal Beceriler': 'conceptualSkills',
  'Eğilimler': 'dispositions',
  'Sosyal-Duygusal Öğrenme Becerileri': 'sel',
  'Değerler': 'values',
  'Okuryazarlık Becerileri': 'literacies',
  'Disiplinler Arası İlişkiler': 'interdisciplinary',
  'Beceriler Arası İlişkiler': 'skillRelations',
  'İçerik Çerçevesi': 'content',
  'Anahtar Kavramlar': 'keyConcepts',
};

// "FBAB2. Sınıflandırma, FBAB8. Bilimsel Çıkarım Yapma" → ["FBAB2. Sınıflandırma", "FBAB8. Bilimsel Çıkarım Yapma"]
const splitList = (text) =>
  text === '-' ? [] : text.split(/,\s*/).map((x) => x.trim()).filter((x) => x && x !== '-');

export function parseUnitPage(html) {
  const sections = extractSections(html);
  const meta = {};
  for (const [label, key] of Object.entries(META_LABELS)) {
    if (!(label in sections)) continue;
    const lines = contentToLines(sections[label]);
    if (key === 'hours') meta.hours = Number(lines[0]) || null;
    else if (key === 'content') meta.content = lines;
    else meta[key] = splitList(lines.join(', '));
  }
  const outcomeLabel = Object.keys(sections).find((l) => /^Öğrenme Çıktıları/i.test(l));
  const outcomes = [];
  if (outcomeLabel) {
    for (const rawLine of contentToLines(sections[outcomeLabel])) {
      // Sitedeki boşluklu yazımlar düzeltilir: "MAT. 1.3.3." / "TT 7.9.1." → "MAT.1.3.3." / "TT.7.9.1."
      const line = rawLine.replace(/^([A-ZÇĞİÖŞÜ]{1,6})(?:\.\s+|\s+)(?=\d+\.\d)/, '$1.');
      const om = line.match(OUTCOME_RE);
      const cm = line.match(COMPONENT_RE);
      if (om) {
        // Bazı programlarda (ör. İngilizce) bileşenler aynı satırda yazılır: "... text. a) ... b) ..."
        const [text, ...inline] = splitInlineComponents(om[2]);
        outcomes.push({ code: om[1], text, components: inline });
      } else if (cm && outcomes.length) outcomes.at(-1).components.push(...splitInlineComponents(line));
      else if (isHeading(line)) continue;
      else if (outcomes.length) {
        // satıra bölünmüş metin: önceki bileşene ya da çıktıya eklenir
        const last = outcomes.at(-1);
        if (last.components.length) last.components[last.components.length - 1] += ` ${line}`;
        else {
          const [text, ...inline] = splitInlineComponents(`${last.text} ${line}`);
          last.text = text;
          last.components.push(...inline);
        }
      }
    }
  }
  return { outcomes, meta, hasOutcomeSection: Boolean(outcomeLabel) };
}

/** "Fen Bilimleri Dersi" → "Fen Bilimleri", "Ortaokul Matematik Dersi" → "Matematik" */
export function cleanSubjectName(name) {
  return String(name)
    .replace(/\s+Dersi\b/i, '')
    .replace(/^(İlkokul|Ortaokul)\s+/i, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s(Ve|İle)\s/g, (w) => w.toLocaleLowerCase('tr-TR'))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1. Ünite: Güneş Sistemi Ve Tutulmalar" → { order: 1, name: "Güneş Sistemi ve Tutulmalar" } */
export function parseUnitTitle(title, levelName) {
  const m = String(title).match(/^\s*(\d+)\s*\.?\s*(?:Ünite|Tema|Öğrenme Alanı|Modül)?\s*[:.-]?\s*(.*)$/i);
  let order = m ? Number(m[1]) : null;
  let name = (m ? m[2] : title).trim() || String(title).trim();
  name = name.replace(/\s(Ve|İle|Ya Da|Veya)\s/g, (w) => w.toLocaleLowerCase('tr-TR'));
  if (levelName) name = `${name} (${levelName})`;
  return { order, name };
}
