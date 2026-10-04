// Yapay zeka ile soru üretiminin saf (ağ kullanmayan) parçaları: JSON şeması, istem (prompt), doğrulama, dönüşüm.
// Testleri: tests/question-ai.test.js

import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_TYPES, SCHOOL_LEVELS, levelOfGrade, optionCountForGrade, OPTION_KEYS } from '../../src/data/constants.js';

export const PROMPT_VERSION = '2026-10-04.1';

const str = (description) => ({ type: 'string', description });
const strArr = (description) => ({ type: 'array', items: { type: 'string' }, description });

/** Claude'un dönmesi gereken yapı (structured outputs: output_config.format). Her soru tipi aynı şemayı kullanır; ilgisiz alanlar boş bırakılır. */
export const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['outcome_code', 'context', 'stem', 'options', 'true_false_answer', 'blank_answers', 'pairs', 'rubric', 'model_answer', 'solution', 'skills', 'self_check'],
        properties: {
          outcome_code: str('Sorunun ölçtüğü öğrenme çıktısının kodu (verilen listeden, aynen)'),
          context: str('Bağlam / senaryo / okuma metni. Bağlam gerekmeyen kısa sorularda boş dize.'),
          stem: str('Soru kökü. Boşluk doldurmada boşluk ____ (dört alt çizgi) ile gösterilir.'),
          options: {
            type: 'array',
            description: 'Yalnızca çoktan seçmelide dolu; diğer tiplerde boş dizi. Tam olarak bir seçenek doğrudur.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'is_correct', 'rationale'],
              properties: {
                text: str('Seçenek metni (harf olmadan)'),
                is_correct: { type: 'boolean' },
                rationale: str('Çeldiricide hedeflenen kavram yanılgısı; doğru seçenekte boş dize'),
              },
            },
          },
          true_false_answer: { type: 'boolean', description: 'Yalnızca doğru/yanlış sorusunda anlamlı; diğerlerinde false' },
          blank_answers: strArr('Boşluk doldurmada kabul edilen cevaplar (eş anlamlı yazımlar dahil); diğerlerinde boş dizi'),
          pairs: {
            type: 'array',
            description: 'Yalnızca eşleştirmede dolu (3-6 çift); sağ taraflar birbirinden farklı olmalı',
            items: { type: 'object', additionalProperties: false, required: ['left', 'right'], properties: { left: { type: 'string' }, right: { type: 'string' } } },
          },
          rubric: {
            type: 'array',
            description: 'Yalnızca açık uçluda dolu: dereceli puanlama ölçütleri (2-4 ölçüt)',
            items: { type: 'object', additionalProperties: false, required: ['criterion', 'points'], properties: { criterion: { type: 'string' }, points: { type: 'integer' } } },
          },
          model_answer: str('Açık uçluda beklenen örnek cevap; diğerlerinde boş dize'),
          solution: str('Öğretmen için kısa çözüm yolu / gerekçe'),
          skills: {
            type: 'object',
            additionalProperties: false,
            required: ['conceptual', 'values', 'literacies', 'sel'],
            properties: {
              conceptual: strArr('Sorunun işe koştuğu kavramsal beceriler (verilen listeden)'),
              values: strArr('İlişkili değerler (verilen listeden; yoksa boş)'),
              literacies: strArr('İlişkili okuryazarlık becerileri (verilen listeden; yoksa boş)'),
              sel: strArr('İlişkili sosyal-duygusal öğrenme becerileri (verilen listeden; yoksa boş)'),
            },
          },
          self_check: str('Kısa öz denetim: bağlam işlevsel mi, tek doğru cevap var mı, sınıf düzeyine uygun mu'),
        },
      },
    },
  },
};

const TYPE_RULES = {
  multiple_choice: (n) => `Çoktan seçmeli: tam olarak ${n} seçenek, yalnızca biri doğru. Doğru seçeneğin yeri sorular arasında değişsin.`,
  true_false: () => 'Doğru/Yanlış: tek, net, tartışmaya kapalı bir yargı. true_false_answer alanını doldur. Doğru ve yanlış cevaplı sorular dengeli olsun.',
  fill_blank: () => 'Boşluk doldurma: kökte tek bir boşluk (____). Cevap tek kelime ya da kısa kelime grubu olsun; kabul edilebilir tüm yazımları blank_answers alanına yaz.',
  matching: () => 'Eşleştirme: 3-6 çift; her sol öğenin tek bir doğru eşi olsun, sağ öğeler birbirinden farklı olsun.',
  open_ended: () => 'Açık uçlu: öğrencinin düşünme sürecini gösterebileceği bir görev; 2-4 ölçütlü dereceli puanlama anahtarı (rubric) ve örnek cevap ver.',
};

const BLOOM_HINTS = {
  hatirlama: 'bilgiyi tanıma/hatırlama',
  anlama: 'açıklama, örneklendirme, sınıflandırma, özetleme',
  uygulama: 'bilinen bir yöntemi yeni bir durumda kullanma',
  analiz: 'parçalara ayırma, ilişkileri ve nedenleri çözümleme',
  degerlendirme: 'ölçütlere göre yargıda bulunma, gerekçelendirme',
  sentez: 'özgün bir ürün, plan ya da çözüm oluşturma (yaratma)',
};

export const SYSTEM_PROMPT = `Sen, Türkiye Yüzyılı Maarif Modeli (TYMM) öğretim programlarına hâkim, deneyimli bir ölçme-değerlendirme uzmanı ve soru yazarısın. Öğretmenlerin yazılı sınav ve testlerinde kullanacağı özgün sorular yazıyorsun.

Uyduğun ilkeler (MEB TYMM Bağlam Temelli Çoktan Seçmeli Soru Yazım Kılavuzu temel alınarak):
1. Hedef: Her soru verilen öğrenme çıktısını ve onun süreç bileşenlerinden en az birini ölçer; istenen Bloom basamağındaki bilişsel işlemi gerektirir.
2. Bağlam: Mümkün olduğunda öğrencinin günlük hayatta karşılaşabileceği gerçekçi, kapsayıcı bir bağlam (okul, ev, park, doğa, alışveriş vb.) kur. Bağlam dekor olmamalı: soru bağlam okunmadan yalnızca ön bilgiyle çözülebiliyorsa bağlamı yeniden kurgula. Çözüm için gereken bilginin tamamını da bağlamda hazır verme; öğrenci bağlamı alan bilgisiyle birleştirsin. Yapay, zorlama kurgulardan ve yalnızca belirli bir sosyoekonomik grubun bildiği konulardan (borsa, golf vb.) kaçın.
3. Dil: Sınıf düzeyine uygun söz varlığı ve cümle uzunluğu; Türkçe yazım ve noktalama kurallarına tam uyum; anlatım bozukluğu yok. Sayısal veriler ve terimler öğrencinin hazırbulunuşluğunu aşmasın.
4. Soru kökü: Açık, tek anlamlı ve nesnel ("Sizce...?" gibi öznel ifadeler yok). Çift olumsuzluk yok; olumsuz kök gerekiyorsa tek ve net olsun ("... değildir?"). Bilgi anlatımı kökte değil bağlamda olsun.
5. Seçenekler: "Hepsi", "Hiçbiri", "A ve B" gibi seçenekler kullanma. Seçenekler uzunluk, dil yapısı ve karmaşıklık bakımından benzer olsun; doğru seçenek daha uzun ya da ayrıntılı olmasın. Bağlamdaki ifadeyi seçeneğe aynen kopyalama, anlamca özdeşini yaz.
6. Çeldiriciler: Rastgele yanlışlar değil; konuyu eksik öğrenen ya da yanlış yapılandıran öğrencinin düşebileceği gerçek kavram yanılgılarına ve hatalı akıl yürütmelere dayansın. Her çeldiricinin hedeflediği yanılgıyı rationale alanına yaz.
7. Tek doğru cevap: Soruyu yazdıktan sonra kendin çöz; tartışmalı ya da birden fazla doğru cevap olmadığından emin ol. Hesap gerektiren sorularda işlemi çözüm alanında adım adım doğrula.
8. Etik ve tarafsızlık: Hiçbir birey, grup, kültür veya cinsiyet hakkında olumsuz çağrışım yok. Kişi adlarında çeşitlilik gözet.
9. Bağımsızlık: Aynı istekteki sorular birbirine ipucu vermesin, birbirinin ön koşulu olmasın, birbirinin kopyası olmasın. Verilen "mevcut sorular" listesindekileri tekrar etme.
10. Görsel yok: Sorular görsel/şekil gerektirmeden metinle eksiksiz çözülebilmeli.

Beceri ve değer etiketlerini yalnızca kullanıcının verdiği listelerden seç. Çıktıyı yalnızca istenen JSON şemasına uygun ver.`;

/**
 * Kullanıcı mesajını oluşturur.
 * ctx: { grade, subjectName, theme: {name, meta}, outcomes: [{code, text, processComponents}], existingStems: [], similarTo? }
 */
export function buildUserPrompt(req, ctx, labels) {
  const level = SCHOOL_LEVELS[levelOfGrade(req.grade)]?.label ?? '';
  const meta = ctx.theme?.meta ?? {};
  const optionCount = optionCountForGrade(req.grade);
  const lines = [];
  lines.push(`# Görev\n${req.count} adet özgün soru yaz.`);
  lines.push(`\n# Kapsam\n- Sınıf: ${req.grade}. sınıf (${level})\n- Ders: ${ctx.subjectName}\n- Tema / ünite: ${ctx.theme?.name ?? '-'}`);
  if (meta.summary) lines.push(`- Ünitenin amacı: ${meta.summary}`);
  if (meta.content?.length) lines.push(`- İçerik çerçevesi: ${meta.content.join('; ')}`);
  if (meta.keyConcepts?.length) lines.push(`- Anahtar kavramlar: ${meta.keyConcepts.join(', ')}`);
  if (meta.fieldSkills?.length) lines.push(`- Alan becerileri: ${meta.fieldSkills.join(', ')}`);

  lines.push(`\n# Öğrenme çıktıları${ctx.outcomes.length > 1 ? ' (soruları bunlara dengeli dağıt)' : ''}`);
  for (const o of ctx.outcomes) {
    lines.push(`- ${o.code}: ${o.text}`);
    for (const c of o.processComponents ?? []) lines.push(`    ${c}`);
  }

  lines.push(`\n# Soru özellikleri\n- Tip: ${labels.type}. ${TYPE_RULES[req.type](optionCount)}\n- Bloom basamağı: ${labels.bloom} (${BLOOM_HINTS[req.bloom]})\n- Zorluk: ${labels.difficulty}`);

  const focusConceptual = req.focus?.conceptual?.length ? req.focus.conceptual : null;
  const focusValues = req.focus?.values?.length ? req.focus.values : null;
  if (focusConceptual) lines.push(`- Öne çıkarılacak kavramsal beceriler: ${focusConceptual.join(', ')}`);
  if (focusValues) lines.push(`- Bağlamda sezdirilecek değerler: ${focusValues.join(', ')} (öğüt verme, doğal biçimde yansıt)`);
  if (req.notes) lines.push(`- Öğretmenin ek yönergesi: ${req.notes}`);

  if (ctx.similarTo) {
    lines.push(`\n# Benzer soru isteği\nAşağıdaki soru öğretmen tarafından daha önce bir sınavda kullanıldı. Aynı öğrenme çıktısını aynı Bloom basamağında ölçen, ancak bağlamı, sayıları ve ifadeleri tamamen farklı YENİ bir soru yaz (kopya ya da küçük değişiklik değil):\n---\n${ctx.similarTo.context ? `${ctx.similarTo.context}\n` : ''}${ctx.similarTo.stem}\n---`);
  }

  if (ctx.existingStems?.length) {
    lines.push(`\n# Havuzda zaten bulunan sorular (bunları tekrar etme)`);
    ctx.existingStems.slice(0, 40).forEach((s) => lines.push(`- ${s.replace(/\s+/g, ' ').slice(0, 200)}`));
  }

  lines.push(`\n# Etiket listeleri\n- Kavramsal beceriler: ${labels.conceptualOptions.join(', ')}\n- Değerler: ${labels.valueOptions.join(', ')}\n- Okuryazarlıklar: ${labels.literacyOptions.join(', ')}\n- Sosyal-duygusal: ${labels.selOptions.join(', ')}`);
  return lines.join('\n');
}

export function labelsFor(req, MAARIF_DIMENSIONS) {
  return {
    type: QUESTION_TYPES[req.type]?.label,
    bloom: BLOOM_LEVELS[req.bloom]?.label,
    difficulty: DIFFICULTIES[req.difficulty]?.label,
    conceptualOptions: MAARIF_DIMENSIONS.conceptual.options,
    valueOptions: MAARIF_DIMENSIONS.values.options,
    literacyOptions: MAARIF_DIMENSIONS.literacies.options,
    selOptions: MAARIF_DIMENSIONS.sel.options,
  };
}

/** İstek doğrulaması (istemciden gelen veriye güvenilmez). */
export function validateRequest(body) {
  const errors = [];
  const r = {
    grade: Number(body?.grade),
    subjectId: String(body?.subjectId ?? ''),
    themeId: String(body?.themeId ?? ''),
    outcomeCode: body?.outcomeCode ? String(body.outcomeCode) : null,
    type: String(body?.type ?? ''),
    bloom: String(body?.bloom ?? ''),
    difficulty: String(body?.difficulty ?? ''),
    count: Number(body?.count ?? 1),
    focus: {
      conceptual: Array.isArray(body?.focus?.conceptual) ? body.focus.conceptual.map(String).slice(0, 6) : [],
      values: Array.isArray(body?.focus?.values) ? body.focus.values.map(String).slice(0, 6) : [],
    },
    notes: String(body?.notes ?? '').slice(0, 500),
    similarToId: body?.similarToId ? String(body.similarToId) : null,
  };
  if (!r.similarToId) {
    if (!Number.isInteger(r.grade) || r.grade < 1 || r.grade > 12) errors.push('Geçersiz sınıf.');
    if (!r.subjectId || !r.themeId) errors.push('Ders ve tema seçilmelidir.');
    if (!QUESTION_TYPES[r.type]) errors.push('Geçersiz soru tipi.');
    if (!BLOOM_LEVELS[r.bloom]) errors.push('Geçersiz Bloom basamağı.');
    if (!DIFFICULTIES[r.difficulty]) errors.push('Geçersiz zorluk.');
  }
  if (!Number.isInteger(r.count) || r.count < 1 || r.count > 10) errors.push('Soru sayısı 1-10 arasında olmalı.');
  return { request: r, errors };
}

const norm = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

/**
 * Modelin ürettiği bir soruyu denetler ve uygulamanın soru modeline çevirir.
 * @returns {{ ok: boolean, errors: string[], question?: object }}
 */
export function convertGenerated(g, req, ctx, allowedSkills) {
  const errors = [];
  const validCodes = new Set(ctx.outcomes.map((o) => o.code));
  const outcomeCode = validCodes.has(g.outcome_code) ? g.outcome_code : ctx.outcomes.length === 1 ? ctx.outcomes[0].code : null;
  if (!outcomeCode) errors.push(`Bilinmeyen öğrenme çıktısı kodu: ${g.outcome_code}`);
  const stem = String(g.stem ?? '').trim();
  if (stem.length < 5) errors.push('Soru kökü boş ya da çok kısa.');

  let body = {};
  let answer = null;
  switch (req.type) {
    case 'multiple_choice': {
      const expected = optionCountForGrade(req.grade);
      const opts = (g.options ?? []).map((o) => ({ text: String(o.text ?? '').trim(), isCorrect: Boolean(o.is_correct), rationale: String(o.rationale ?? '').trim() }));
      if (opts.length < expected || opts.length > 5) errors.push(`Seçenek sayısı ${expected} olmalı (gelen: ${opts.length}).`);
      if (opts.filter((o) => o.isCorrect).length !== 1) errors.push('Tam olarak bir doğru seçenek olmalı.');
      if (opts.some((o) => !o.text)) errors.push('Boş seçenek var.');
      if (new Set(opts.map((o) => norm(o.text))).size !== opts.length) errors.push('Aynı metinli seçenekler var.');
      if (opts.some((o) => /^(hepsi|hiçbiri|yukarıdakilerin hepsi|yukarıdakilerin hiçbiri)\b/i.test(o.text))) errors.push('"Hepsi/Hiçbiri" seçeneği kullanılmamalı.');
      const options = opts.slice(0, 5).map((o, i) => ({ key: OPTION_KEYS[i], text: o.text, rationale: o.isCorrect ? null : o.rationale || null }));
      body = { options };
      answer = options[opts.findIndex((o) => o.isCorrect)]?.key ?? null;
      break;
    }
    case 'true_false':
      answer = Boolean(g.true_false_answer);
      break;
    case 'fill_blank': {
      const answers = [...new Set((g.blank_answers ?? []).map((a) => String(a).trim()).filter(Boolean))];
      if (!/_{3,}/.test(stem)) errors.push('Boşluk doldurma kökünde ____ yok.');
      if (!answers.length) errors.push('Kabul edilen cevap yok.');
      answer = answers;
      break;
    }
    case 'matching': {
      const pairs = (g.pairs ?? []).map((p) => ({ left: String(p.left ?? '').trim(), right: String(p.right ?? '').trim() })).filter((p) => p.left && p.right);
      if (pairs.length < 3 || pairs.length > 8) errors.push('Eşleştirmede 3-8 çift olmalı.');
      if (new Set(pairs.map((p) => norm(p.right))).size !== pairs.length) errors.push('Eşleştirmede aynı sağ öğe birden fazla kez geçiyor.');
      body = { pairs };
      break;
    }
    case 'open_ended': {
      const rubric = (g.rubric ?? []).map((r) => ({ criterion: String(r.criterion ?? '').trim(), points: Math.max(0, Math.round(Number(r.points) || 0)) })).filter((r) => r.criterion);
      if (!rubric.length) errors.push('Açık uçlu soruda puanlama ölçütü yok.');
      body = { rubric };
      answer = String(g.model_answer ?? '').trim();
      break;
    }
    default:
      errors.push('Bilinmeyen soru tipi.');
  }

  const pick = (list, allowed) => [...new Set((list ?? []).filter((x) => allowed.includes(x)))];
  const skills = {
    conceptual: pick(g.skills?.conceptual, allowedSkills.conceptual),
    values: pick(g.skills?.values, allowedSkills.values),
    literacies: pick(g.skills?.literacies, allowedSkills.literacies),
    sel: pick(g.skills?.sel, allowedSkills.sel),
  };

  const defaultPoints = req.type === 'open_ended' ? Math.max(1, (body.rubric ?? []).reduce((a, r) => a + r.points, 0)) || 10 : req.type === 'matching' ? 8 : req.type === 'multiple_choice' ? 5 : 4;

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    question: {
      grade: req.grade, subjectId: req.subjectId, themeId: req.themeId, outcomeCodes: [outcomeCode],
      type: req.type, difficulty: req.difficulty, bloom: req.bloom, skills,
      stem, context: String(g.context ?? '').trim(), body, answer,
      solution: String(g.solution ?? '').trim(), defaultPoints, status: 'draft', source: 'ai',
    },
  };
}

/** Havuzdaki sorularla neredeyse aynı olanları yakalar (normalize edilmiş kök karşılaştırması). */
export function isDuplicate(stem, existingStems) {
  const a = norm(stem).replace(/[^\p{L}\p{N} ]/gu, '');
  return existingStems.some((s) => {
    const b = norm(s).replace(/[^\p{L}\p{N} ]/gu, '');
    return a === b || (a.length > 40 && (a.includes(b) || b.includes(a)));
  });
}
