// /api/generate-questions sunucu fonksiyonunun akış testi: Supabase ve Claude sahte (mock) nesnelerle değiştirilir.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------- sahte Supabase
const db = {};
const inserts = [];
const updates = [];
function table(name) {
  let rows = [...(db[name] ?? [])];
  const q = {
    select: () => q,
    eq: (col, val) => ((rows = rows.filter((r) => r[col] === val)), q),
    neq: (col, val) => ((rows = rows.filter((r) => r[col] !== val)), q),
    gte: () => q,
    order: () => q,
    limit: (n) => ((rows = rows.slice(0, n)), q),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }),
    insert: (payload) => {
      inserts.push({ table: name, payload });
      const arr = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ id: `${name}-${inserts.length}-${i}`, ...r }));
      rows = arr;
      return q;
    },
    update: (payload) => (updates.push({ table: name, payload }), q),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return q;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async (token) => (token === 'iyi-token' ? { data: { user: { id: 'u1' } }, error: null } : { data: null, error: { message: 'bad' } }) },
    from: (name) => table(name),
  }),
}));

// ---------------------------------------------------------------- sahte Claude
const anthropicCalls = [];
let nextResponse;
let betaError = null; // beta çağrısında fırlatılacak hata
let plainError = null; // beta olmayan çağrıda fırlatılacak hata
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor(status, body) {
      super(body?.error?.message ?? 'api error');
      this.status = status;
      this.error = body;
    }
  }
  class BadRequestError extends APIError {}
  class Anthropic {
    constructor() {
      this.beta = { messages: { create: async (params) => { anthropicCalls.push({ beta: true, ...params }); if (betaError) throw betaError; return nextResponse; } } };
      this.messages = { create: async (params) => { anthropicCalls.push({ beta: false, ...params }); if (plainError) throw plainError; return nextResponse; } };
    }
  }
  Object.assign(Anthropic, { APIError, BadRequestError, RateLimitError: class extends APIError {}, AuthenticationError: class extends APIError {}, APIConnectionError: class extends APIError {} });
  return { default: Anthropic };
});
const AnthropicMock = (await import('@anthropic-ai/sdk')).default;

const { default: handler } = await import('../api/generate-questions.js');

function call(body, token = 'iyi-token') {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res).then(() => res);
}

const goodQuestion = (stem, correct = 1) => ({
  outcome_code: 'FB.6.1.1', context: 'Ece gökyüzü gözlemi yapıyor.', stem,
  options: ['Merkür', 'Venüs', 'Mars', 'Jüpiter'].map((t, i) => ({ text: t, is_correct: i === correct, rationale: i === correct ? '' : 'yanılgı' })),
  true_false_answer: false, blank_answers: [], pairs: [], rubric: [], model_answer: '', solution: 'Çünkü...',
  skills: { conceptual: ['Sınıflandırma'], values: [], literacies: [], sel: [] }, self_check: 'tek doğru',
});

beforeEach(() => {
  Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', ANTHROPIC_API_KEY: 'a', AI_DAILY_LIMIT: '10' });
  Object.keys(db).forEach((k) => delete db[k]);
  inserts.length = 0;
  updates.length = 0;
  anthropicCalls.length = 0;
  betaError = null;
  plainError = null;
  Object.assign(db, {
    profiles: [{ id: 'u1', role: 'teacher' }],
    subjects: [{ id: 'g6-fen-bilimleri', name: 'Fen Bilimleri', grade_id: 6 }],
    themes: [{ id: 'g6-fen-bilimleri-t1', name: 'Güneş Sistemi ve Tutulmalar', subject_id: 'g6-fen-bilimleri', meta: { keyConcepts: ['gezegen'] } }],
    outcomes: [{ theme_id: 'g6-fen-bilimleri-t1', code: 'FB.6.1.1', text: 'Gezegenleri sınıflandırabilme', process_components: ['a) Belirler.'] }],
    questions: [{ theme_id: 'g6-fen-bilimleri-t1', owner_id: 'u1', status: 'active', stem: 'Güneşe en yakın gezegen hangisidir?' }],
    ai_jobs: [],
  });
  nextResponse = {
    stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 900 },
    content: [{ type: 'text', text: JSON.stringify({ questions: [goodQuestion('Hangi gezegen en sıcaktır?'), goodQuestion('Güneşe en yakın gezegen hangisidir?', 0), { ...goodQuestion('İki doğrulu soru?'), options: goodQuestion('x').options.map((o) => ({ ...o, is_correct: true })) }] }) }],
  };
});

const request = { grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t1', type: 'multiple_choice', bloom: 'analiz', difficulty: 'orta', count: 3 };

describe('POST /api/generate-questions', () => {
  it('oturumsuz isteği reddeder', async () => {
    expect((await call(request, 'kotu')).statusCode).toBe(401);
  });

  it('öğretmen olmayanı reddeder', async () => {
    db.profiles[0].role = 'student';
    expect((await call(request)).statusCode).toBe(403);
  });

  it('günlük kotayı uygular', async () => {
    db.ai_jobs = [{ teacher_id: 'u1', status: 'done', request: { count: 9 } }];
    const res = await call(request);
    expect(res.statusCode).toBe(429);
    expect(anthropicCalls).toHaveLength(0);
  });

  it('soruları üretir, denetler, kopyayı ve hatalıyı eler, kalanı taslak kaydeder', async () => {
    const res = await call(request);
    expect(res.statusCode).toBe(200);
    // Claude çağrısı: yapılandırılmış çıktı, yedek model, kazanım ve mevcut sorular istemde
    const p = anthropicCalls[0];
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toContain('server-side-fallback-2026-07-01');
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p.messages[0].content).toContain('FB.6.1.1: Gezegenleri sınıflandırabilme');
    expect(p.messages[0].content).toContain('Güneşe en yakın gezegen hangisidir?');
    // Sonuç
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.rejected).toHaveLength(2);
    const saved = inserts.find((i) => i.table === 'questions').payload;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ owner_id: 'u1', status: 'draft', source: 'ai', type: 'multiple_choice', answer: 'B', outcome_codes: ['FB.6.1.1'] });
    expect(updates.find((u) => u.table === 'ai_jobs').payload.status).toBe('done');
  });

  it('güvenlik reddini ve yarıda kesilen yanıtı anlaşılır hatayla döner', async () => {
    nextResponse = { ...nextResponse, stop_reason: 'refusal', content: [] };
    expect((await call(request)).statusCode).toBe(422);
    nextResponse = { ...nextResponse, stop_reason: 'max_tokens', content: [] };
    expect((await call(request)).statusCode).toBe(502);
    expect(updates.filter((u) => u.payload.status === 'failed')).toHaveLength(2);
  });

  it('yedek model özelliği reddedilirse isteği onsuz tekrarlar', async () => {
    betaError = new AnthropicMock.BadRequestError(400, { error: { type: 'invalid_request_error', message: 'fallbacks: not available for this organization' } });
    const res = await call(request);
    expect(res.statusCode).toBe(200);
    expect(anthropicCalls.map((c) => c.beta)).toEqual([true, false]);
    expect(anthropicCalls[1].fallbacks).toBeUndefined();
    expect(anthropicCalls[1].output_config.format.type).toBe('json_schema');
  });

  it('kredi bitmişse ne yapılacağını söyleyen ileti döner', async () => {
    betaError = new AnthropicMock.BadRequestError(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
    const res = await call(request);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Billing');
    expect(anthropicCalls).toHaveLength(1); // kredi hatası tekrar denenmez
  });

  it('diğer 400 hatalarında Claude\'un açıklamasını gösterir', async () => {
    betaError = new AnthropicMock.BadRequestError(400, { error: { type: 'invalid_request_error', message: 'max_tokens: too large' } });
    const res = await call(request);
    expect(res.body.error).toContain('max_tokens: too large');
  });

  it('eksik sunucu yapılandırmasını bildirir', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await call(request)).statusCode).toBe(500);
  });
});
