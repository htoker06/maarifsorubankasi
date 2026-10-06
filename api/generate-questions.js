// Vercel sunucu fonksiyonu: POST /api/generate-questions
// Öğretmenin isteğine göre Claude ile soru üretir, denetler ve havuza TASLAK olarak kaydeder.
// Gizli anahtarlar (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY) yalnızca burada, sunucuda kullanılır.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { MAARIF_DIMENSIONS } from '../src/data/constants.js';
import { questionFromRow, questionToRow } from '../src/services/mappers.js';
import {
  PROMPT_VERSION, QUESTIONS_SCHEMA, SYSTEM_PROMPT, buildUserPrompt, convertGenerated, isDuplicate, labelsFor, validateRequest,
} from './_lib/question-ai.js';


const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Yalnızca POST desteklenir.' });
  const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
  const EFFORT = process.env.AI_EFFORT || 'high';
  const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 100);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !process.env.ANTHROPIC_API_KEY) {
    return json(res, 500, { error: 'Sunucu yapılandırması eksik (Supabase ya da Claude API anahtarı tanımlı değil).' });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Oturum: istemci Supabase erişim belirtecini (JWT) gönderir
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (userErr || !userData?.user) return json(res, 401, { error: 'Oturum geçersiz. Lütfen yeniden giriş yapın.' });
  const userId = userData.user.id;

  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single();
  if (!profile || !['teacher', 'admin'].includes(profile.role)) return json(res, 403, { error: 'Soru üretmek için öğretmen hesabı gerekir.' });

  // 2) İstek doğrulama
  const { request: r, errors } = validateRequest(req.body);
  if (errors.length) return json(res, 400, { error: errors.join(' ') });

  // "Benzer soru üret": özellikler kaynak sorudan alınır
  let similarTo = null;
  if (r.similarToId) {
    const { data: src } = await admin.from('questions').select('*').eq('id', r.similarToId).single();
    if (!src || (src.owner_id !== userId && src.visibility !== 'public')) return json(res, 404, { error: 'Kaynak soru bulunamadı.' });
    Object.assign(r, { grade: src.grade, subjectId: src.subject_id, themeId: src.theme_id, type: src.type, bloom: src.bloom, difficulty: src.difficulty, outcomeCode: src.outcome_codes?.[0] ?? null, count: 1 });
    similarTo = { stem: src.stem, context: src.context };
    if (!r.themeId) return json(res, 400, { error: 'Kaynak sorunun teması yok; benzer soru üretilemiyor.' });
  }

  // 3) Günlük kota (öğretmen başına üretilen soru sayısı)
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { data: todayJobs } = await admin.from('ai_jobs').select('request').eq('teacher_id', userId).gte('created_at', since.toISOString()).neq('status', 'failed');
  const usedToday = (todayJobs ?? []).reduce((a, j) => a + (Number(j.request?.count) || 0), 0);
  if (usedToday + r.count > DAILY_LIMIT) {
    return json(res, 429, { error: `Günlük soru üretim sınırına ulaşıldı (${usedToday}/${DAILY_LIMIT}). Yarın tekrar deneyin.` });
  }

  // 4) Bağlam: ders, tema (+ Maarif bileşenleri), öğrenme çıktıları, havuzdaki mevcut sorular
  const [{ data: subject }, { data: theme }, { data: outcomes }, { data: existing }] = await Promise.all([
    admin.from('subjects').select('id, name, grade_id').eq('id', r.subjectId).single(),
    admin.from('themes').select('id, name, meta, subject_id').eq('id', r.themeId).single(),
    admin.from('outcomes').select('code, text, process_components').eq('theme_id', r.themeId).order('sort_order'),
    admin.from('questions').select('stem').eq('theme_id', r.themeId).eq('owner_id', userId).neq('status', 'archived').limit(60),
  ]);
  if (!subject || !theme || theme.subject_id !== subject.id) return json(res, 400, { error: 'Ders ya da tema bulunamadı.' });
  const selectedOutcomes = (outcomes ?? [])
    .filter((o) => !r.outcomeCode || o.code === r.outcomeCode)
    .map((o) => ({ code: o.code, text: o.text, processComponents: o.process_components ?? [] }));
  if (!selectedOutcomes.length) return json(res, 400, { error: 'Bu tema için öğrenme çıktısı bulunamadı. Önce müfredatı içe aktarın.' });
  r.grade = subject.grade_id;

  const existingStems = (existing ?? []).map((q) => q.stem);
  const ctx = { subjectName: subject.name, theme, outcomes: selectedOutcomes, existingStems, similarTo };
  const userPrompt = buildUserPrompt(r, ctx, labelsFor(r, MAARIF_DIMENSIONS));

  const { data: job } = await admin.from('ai_jobs')
    .insert({ teacher_id: userId, request: { ...r, promptVersion: PROMPT_VERSION }, model: MODEL })
    .select('id').single();

  // 5) Claude çağrısı (yapılandırılmış JSON çıktı + güvenlik reddinde sunucu tarafı yedek model)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000, maxRetries: 1 });
  const params = {
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: QUESTIONS_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };
  let message;
  try {
    try {
      // Güvenlik reddinde sunucu tarafında otomatik yedek modele geçiş (beta özelliği)
      message = await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (err) {
      // Yedek model özelliği bu hesapta açık değilse istek onsuz tekrarlanır
      if (!(err instanceof Anthropic.BadRequestError) || !/fallback|beta/i.test(apiErrorMessage(err))) throw err;
      message = await anthropic.messages.create(params);
    }
  } catch (err) {
    await failJob(admin, job?.id, err);
    if (err instanceof Anthropic.APIConnectionError) return json(res, 503, { error: 'Yapay zeka servisine bağlanılamadı. Tekrar deneyin.' });
    if (err instanceof Anthropic.APIError) {
      const { status, message: text } = describeApiError(err);
      return json(res, status, { error: text });
    }
    throw err;
  }

  const usage = { inputTokens: message.usage?.input_tokens ?? null, outputTokens: message.usage?.output_tokens ?? null };
  if (message.stop_reason === 'refusal') {
    await failJob(admin, job?.id, new Error('refusal'), usage);
    return json(res, 422, { error: 'Yapay zeka bu isteği güvenlik nedeniyle yanıtlamadı. Ek yönergeyi değiştirip tekrar deneyin.' });
  }
  if (message.stop_reason === 'max_tokens') {
    await failJob(admin, job?.id, new Error('max_tokens'), usage);
    return json(res, 502, { error: 'Yanıt yarıda kesildi. Daha az soru isteyerek tekrar deneyin.' });
  }

  let parsed;
  try {
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    parsed = JSON.parse(text);
  } catch (err) {
    await failJob(admin, job?.id, err, usage);
    return json(res, 502, { error: 'Yapay zeka yanıtı okunamadı. Tekrar deneyin.' });
  }

  // 6) Denetim ve kayıt (her zaman TASLAK; öğretmen onaylamadan kullanılmaz)
  const allowed = {
    conceptual: MAARIF_DIMENSIONS.conceptual.options, values: MAARIF_DIMENSIONS.values.options,
    literacies: MAARIF_DIMENSIONS.literacies.options, sel: MAARIF_DIMENSIONS.sel.options,
  };
  const accepted = [];
  const rejected = [];
  const seenStems = [...existingStems];
  (parsed.questions ?? []).forEach((g, index) => {
    const result = convertGenerated(g, r, ctx, allowed);
    if (!result.ok) return rejected.push({ index, errors: result.errors, stem: g.stem });
    if (isDuplicate(result.question.stem, seenStems)) return rejected.push({ index, errors: ['Havuzdaki bir soruyla neredeyse aynı.'], stem: g.stem });
    seenStems.push(result.question.stem);
    accepted.push({
      ...questionToRow(result.question),
      owner_id: userId,
      ai_meta: { model: MODEL, promptVersion: PROMPT_VERSION, jobId: job?.id, selfCheck: String(g.self_check ?? '').slice(0, 500), similarToId: r.similarToId },
    });
  });

  let saved = [];
  if (accepted.length) {
    const { data, error } = await admin.from('questions').insert(accepted).select('*');
    if (error) {
      await failJob(admin, job?.id, error, usage);
      return json(res, 500, { error: 'Sorular kaydedilemedi.' });
    }
    saved = data;
  }
  await admin.from('ai_jobs').update({
    status: 'done', question_ids: saved.map((q) => q.id), input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    error: rejected.length ? `${rejected.length} soru denetimden geçmedi` : null,
  }).eq('id', job?.id);

  return json(res, 200, { questions: saved.map(questionFromRow), rejected, usage, model: message.model });
}

/** Claude API hata gövdesindeki açıklama (ör. "Your credit balance is too low ...") */
export function apiErrorMessage(err) {
  return String(err?.error?.error?.message ?? err?.error?.message ?? err?.message ?? '');
}

/** Claude API hatasını öğretmene gösterilecek, ne yapılacağını söyleyen Türkçe iletiye çevirir. */
export function describeApiError(err) {
  const detail = apiErrorMessage(err);
  if (/credit balance|billing|purchase credits/i.test(detail)) {
    return { status: 402, message: 'Claude API hesabında kredi yok. Yönetici console.anthropic.com → Billing bölümünden kredi yüklemeli.' };
  }
  if (err?.status === 401 || /api key|x-api-key|authentication/i.test(detail)) {
    return { status: 500, message: 'Claude API anahtarı geçersiz. Vercel\'deki ANTHROPIC_API_KEY değerini kontrol edin.' };
  }
  if (err?.status === 403 || /permission/i.test(detail)) {
    return { status: 500, message: `Claude API bu isteğe izin vermedi: ${detail}` };
  }
  if (err?.status === 404 || /model/i.test(detail) && /not found|does not exist|invalid/i.test(detail)) {
    return { status: 500, message: `Model bulunamadı. Vercel'deki AI_MODEL değerini kontrol edin (önerilen: claude-opus-5-5). Ayrıntı: ${detail}` };
  }
  if (err?.status === 429) return { status: 503, message: 'Yapay zeka servisi şu an yoğun ya da kullanım sınırına ulaşıldı. Biraz sonra tekrar deneyin.' };
  if (err?.status === 529 || err?.status >= 500) return { status: 503, message: 'Yapay zeka servisi geçici olarak yanıt vermiyor. Biraz sonra tekrar deneyin.' };
  return { status: 502, message: `Yapay zeka servisi isteği reddetti (${err?.status ?? '?'}): ${detail || 'ayrıntı yok'}` };
}

async function failJob(admin, jobId, err, usage = {}) {
  if (!jobId) return;
  await admin.from('ai_jobs').update({
    status: 'failed', error: String(err?.message ?? err).slice(0, 500), input_tokens: usage.inputTokens ?? null, output_tokens: usage.outputTokens ?? null,
  }).eq('id', jobId);
}
