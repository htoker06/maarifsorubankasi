# SoruBankasıMatik: Adım 1, Sistem Mimarisi ve Veritabanı Tasarımı

> Durum: **Taslak (sürüm 2: GitHub + Supabase + Vercel), onay bekliyor.**
> Kurulum adımları için: [`docs/KURULUM.md`](KURULUM.md)

---

## 1. Altyapı: üç servis, üç görev

| Servis | Görevi | Bu projede ne yapacak |
|---|---|---|
| **GitHub** | Kodun saklandığı yer | Tüm kaynak kodu, veritabanı tanımları (SQL dosyaları) ve belgeler burada durur. Her değişiklik bir commit olarak kayıt altındadır. |
| **Supabase** | Veritabanı ve kullanıcı yönetimi | PostgreSQL veritabanı, giriş/kayıt (Auth), satır bazlı güvenlik (RLS), soru görselleri için dosya deposu (Storage). |
| **Vercel** | Web sitesine dönüştürme ve yayınlama | GitHub'a her gönderimde siteyi otomatik derler ve yayınlar. Gizli anahtar gerektiren işler (yapay zeka çağrısı) Vercel'in sunucu fonksiyonlarında çalışır. |

```
           git push                    otomatik derleme + yayın
Geliştirici ─────────► GitHub ─────────────────────────────► Vercel
                         │                                     │
                         │ supabase/migrations/*.sql           │  https://sorubankasimatik.vercel.app
                         ▼                                     ▼
                    Supabase  ◄──────── tarayıcı (anon anahtar + RLS) ────────┐
                    (Postgres, Auth,                                        │
                     Storage)  ◄──── /api/* fonksiyonları (gizli anahtar) ──┤
                                          │                                 │
                                          ▼                                 │
                                     Claude API                       Öğretmen / Öğrenci
```

## 2. Teknoloji yığını

| Katman | Teknoloji | Neden |
|---|---|---|
| Ön yüz | **Vite** + sade JavaScript (ES Modules) | Framework bağımlılığı yok. Vercel, Vite projelerini ayar gerektirmeden tanır. |
| Tasarım | **Tailwind CSS** | Mobil öncelikli, tutarlı, karanlık mod desteği |
| Sürükle-bırak | **SortableJS** | Yazılı kağıdında soru sıralama; dokunmatik ekran desteği |
| Grafik | **Chart.js** | Kazanım analizi (radar, çubuk, ısı haritası) |
| Formül | **KaTeX** | Matematik ve fen sorularında formül gösterimi |
| PDF / Word | **pdfmake** (Türkçe font gömülü) / **docx** | Tarayıcıda üretilir, sunucu maliyeti yok |
| Veritabanı istemcisi | **@supabase/supabase-js** | Tarayıcıdan güvenli sorgu (RLS ile) |
| Sunucu fonksiyonları | **Vercel Functions** (`/api` klasörü, Node.js) | Yapay zeka anahtarı burada gizli kalır |
| Veritabanı mantığı | **PostgreSQL fonksiyonları (RPC)** + tetikleyiciler | Sınavı kesinleştirme, puanlama, karantina gibi işler veritabanının içinde, tek işlem (transaction) olarak çalışır |
| Yapay zeka | **Claude API** (`@anthropic-ai/sdk`, varsayılan `claude-opus-5-5`) | JSON şemalı yapılandırılmış çıktı; adaptör katmanı ile sağlayıcı değiştirilebilir |
| Test | Vitest + Supabase CLI (yerel veritabanı) + Playwright | |

### Gizli bilgiler nerede durur?

| Anahtar | Nerede | Tarayıcı görür mü? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel ortam değişkeni | Evet (zararsız) |
| `VITE_SUPABASE_ANON_KEY` (yeni panelde "publishable key") | Vercel ortam değişkeni | Evet. **RLS kuralları korur**; bu anahtarla yalnızca izin verilen satırlar okunur. |
| `SUPABASE_SERVICE_ROLE_KEY` ("secret key") | Yalnızca Vercel ortam değişkeni | **Hayır, asla.** Tüm güvenliği atlar. |
| `ANTHROPIC_API_KEY` | Yalnızca Vercel ortam değişkeni | **Hayır, asla.** |

> `VITE_` ile başlayan değişkenler derleme sırasında koda gömülür ve herkes görebilir. Gizli anahtarların adı **asla** `VITE_` ile başlamamalıdır.

---

## 3. Klasör yapısı (planlanan)

```
/
├─ index.html
├─ package.json
├─ vite.config.js
├─ vercel.json                 # /api fonksiyon ayarları, SPA yönlendirmesi
├─ .env.example                # değişken adları (değerler YOK)
├─ src/                        # Ön yüz
│  ├─ main.js  router.js
│  ├─ lib/supabase.js          # Supabase istemcisi
│  ├─ services/                # Tüm veritabanı erişimi burada
│  │   ├─ questions.js  exams.js  usages.js  curriculum.js
│  │   └─ assignments.js  attempts.js  reports.js  analytics.js
│  ├─ features/
│  │   ├─ auth/  teacher/  student/
│  │   ├─ generator/  bank/  exam-builder/
│  │   ├─ test-player/  analytics/  export/
│  ├─ ui/                      # buton, modal, toast, rozet
│  └─ styles/
├─ api/                        # Vercel sunucu fonksiyonları
│  ├─ generate-questions.js    # Claude API çağrısı
│  ├─ similar-question.js
│  └─ _lib/ (auth doğrulama, ai adaptörü, JSON şemaları)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/              # Veritabanı şeması, sürümlü SQL dosyaları
│  │   ├─ 0001_curriculum.sql
│  │   ├─ 0002_users_classes.sql
│  │   ├─ 0003_questions.sql
│  │   ├─ 0004_exams_usages.sql
│  │   ├─ 0005_assignments_attempts.sql
│  │   ├─ 0006_reports_quarantine.sql
│  │   └─ 0007_rls_policies.sql
│  └─ seed.sql                 # örnek müfredat verisi
└─ docs/  MIMARI.md  KURULUM.md
```

Veritabanı şeması GitHub'da SQL dosyaları olarak durur. Supabase paneline elle tablo eklenmez; değişiklik her zaman yeni bir migration dosyasıyla yapılır. Böylece veritabanının geçmişi de kodla birlikte izlenir.

---

## 4. Müfredat ve sınıflandırma

Müfredat **referans veridir**: herkes okur, yalnızca yönetici yazar.

- `grades`: 1–12. sınıf, kademe (ilkokul / ortaokul / lise)
- `subjects`: sınıf + ders + öğretim programı yılı
- `themes`: tema / ünite, sıra numarası
- `outcomes`: öğrenme çıktısı (kazanım) kodu, metni, süreç bileşenleri

Her soru şu Maarif Modeli boyutlarıyla etiketlenir: alan becerileri, kavramsal beceriler, sosyal-duygusal öğrenme becerileri, değerler, okuryazarlıklar.

Bloom basamağı ve zorluk: `hatirlama · anlama · uygulama · analiz · degerlendirme · sentez` ve `kolay · orta · zor`. Son basamak ekranda **"Sentez/Yaratma"** olarak gösterilir.

> Resmî kazanım kodları MEB öğretim programlarından **CSV içe aktarma aracıyla** (Yönetici paneli → Müfredat) aktarılır. Biçim ve kurallar: [`docs/MUFREDAT-CSV.md`](MUFREDAT-CSV.md). Supabase'de içe aktarma, tek transaction içinde çalışan `import_curriculum(jsonb)` RPC fonksiyonuyla yapılacak (yalnızca yönetici).

---

## 5. Veritabanı şeması (PostgreSQL)

Aşağıdaki SQL bir taslaktır; onaydan sonra `supabase/migrations/` dosyalarına bölünecektir.

### 5.1 Sabit değer listeleri

```sql
create type user_role       as enum ('teacher','student','admin','pending_teacher');
create type school_level    as enum ('ilkokul','ortaokul','lise');
create type question_type   as enum ('multiple_choice','open_ended','fill_blank','matching','true_false');
create type difficulty      as enum ('kolay','orta','zor');
create type bloom_level     as enum ('hatirlama','anlama','uygulama','analiz','degerlendirme','sentez');
create type question_status as enum ('draft','active','quarantined','archived');
create type exam_kind       as enum ('written','scan_unit','scan_topic','scan_general','online_trial');
create type exam_status     as enum ('draft','finalized','archived');
create type attempt_status  as enum ('in_progress','submitted','expired');
create type report_reason   as enum ('wrong_answer','multiple_correct','typo','out_of_curriculum','unclear','other');
create type report_status   as enum ('open','accepted','rejected');
```

### 5.2 Müfredat

```sql
create table grades   (id smallint primary key check (id between 1 and 12), level school_level not null);
create table subjects (id text primary key, grade_id smallint references grades, name text not null, program_year int);
create table themes   (id text primary key, subject_id text references subjects on delete cascade,
                       sort_order int, name text not null);
-- Resmî programlarda aynı kod birden fazla temada geçebilir (ör. Türkçe'de beceriler temalar boyunca
-- tekrarlanır), bu yüzden benzersiz olan (tema, kod) ikilisidir.
create table outcomes (id bigserial primary key, theme_id text not null references themes on delete cascade,
                       code text not null, text text not null, process_components jsonb default '[]',
                       sort_order int, unique (theme_id, code));
-- Ünitenin Maarif Modeli bileşenleri (alan becerileri, değerler, okuryazarlıklar…): AI istemine bağlam olarak verilir
alter table themes add column meta jsonb default '{}';
```

### 5.3 Kullanıcılar ve sınıflar

```sql
-- Supabase Auth'taki her kullanıcı için bir profil (kayıt olunca tetikleyiciyle oluşur)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'student',   -- kullanıcı kendi rolünü DEĞİŞTİREMEZ
  full_name text not null,
  school_name text,
  grade smallint,                               -- öğrenciler için
  created_at timestamptz default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles,
  name text not null,                           -- "6-A Matematik"
  grade smallint, subject_id text references subjects,
  join_code text unique not null,               -- öğrenci bu kodla katılır
  created_at timestamptz default now()
);

create table class_members (
  class_id uuid references classes on delete cascade,
  student_id uuid references profiles on delete cascade,
  joined_at timestamptz default now(),
  primary key (class_id, student_id)
);
```

```sql
-- Öğretmen başvuruları: "Öğretmenim" seçeneğiyle kaydolan kullanıcı 'pending_teacher' rolünü alır,
-- yönetici onaylayınca review_teacher_request() RPC'si rolü 'teacher' yapar.
create table teacher_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  school_name text not null, branch text not null, note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,                                   -- ret gerekçesi (kullanıcıya gösterilir)
  reviewed_by uuid references profiles, reviewed_at timestamptz,
  created_at timestamptz default now()
);
```

**Kayıt ve rol akışı (onaylanan kararlar):**
- **Öğrenci:** E-posta ve şifreyle kaydolur (`student`), öğretmenin verdiği **sınıf koduyla** sınıfa katılır.
- **Öğretmen:** Kayıtta "Öğretmenim" seçer ve okul/branş bilgisini girer → `pending_teacher` rolü alır. Yalnızca "başvurunuz inceleniyor" ekranını görür.
- **Yönetici:** Başvuruyu Yönetici panelinden onaylar → rol `teacher` olur. Reddederse gerekçe kullanıcıya gösterilir.
- İlk yönetici hesabı, Supabase panelinden bir kez elle atanır (`update profiles set role='admin' where id=…`).

> KVKK: Öğrenciler için yalnızca ad-soyad, sınıf ve okul bilgisi tutulur; T.C. kimlik numarası tutulmaz.

### 5.4 Soru havuzu

```sql
create table questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles,
  grade smallint not null, subject_id text not null references subjects, theme_id text references themes,
  type question_type not null, difficulty difficulty not null, bloom bloom_level not null,
  skills jsonb default '{}',          -- {field:[], conceptual:[], sel:[], values:[], literacies:[]}
  stem text not null,                 -- soru kökü (Markdown + KaTeX)
  context text,                       -- okuma metni / bağlam
  media jsonb default '[]',           -- [{path, alt}] → Supabase Storage
  body jsonb not null,                -- tipe göre: options / blanks / pairs / rubric
  answer jsonb not null,              -- doğru cevap
  solution text,                      -- çözüm yolu
  default_points numeric default 5,
  status question_status not null default 'draft',
  visibility text not null default 'private' check (visibility in ('private','school','public')),
  source text not null default 'manual' check (source in ('ai','manual','imported')),
  ai_meta jsonb,                      -- {model, prompt_version, job_id}
  report_count int default 0,
  version int default 1,
  search tsvector generated always as (to_tsvector('turkish', coalesce(stem,'') || ' ' || coalesce(context,''))) stored,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table question_outcomes (question_id uuid references questions on delete cascade,
                                outcome_id bigint references outcomes, primary key (question_id, outcome_id));
create table question_revisions (id bigserial primary key, question_id uuid references questions on delete cascade,
                                 version int, data jsonb, edited_by uuid references profiles, edited_at timestamptz default now());

create index on questions (subject_id, theme_id, difficulty, type, status);
create index on questions using gin (search);          -- Türkçe tam metin arama
```

Örnek `body` (çoktan seçmeli):
```json
{"options":[
  {"key":"A","text":"3/4","rationale":"Pay ile paydayı karıştırma yanılgısı"},
  {"key":"B","text":"4/3","rationale":null}
]}
```

### 5.5 Sınavlar ve ⭐ kullanılmış soru kaydı

```sql
create table exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles,
  kind exam_kind not null, title text not null,
  grade smallint, subject_id text references subjects,
  exam_date date,                      -- uygulanacağı / uygulandığı tarih
  status exam_status not null default 'draft',
  header jsonb default '{}',           -- okul, dönem, süre, yönerge
  sections jsonb default '[]',         -- [{id, title}] bölüm başlıkları
  finalized_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table exam_classes (exam_id uuid references exams on delete cascade,
                           class_id uuid references classes, primary key (exam_id, class_id));

create table exam_items (
  exam_id uuid references exams on delete cascade,
  question_id uuid references questions,
  section_id text, position int not null,   -- sürükle-bırak sırası
  points numeric not null,
  snapshot jsonb,                           -- kesinleşince sorunun o anki tam hali
  primary key (exam_id, question_id)
);

-- KULLANILMIŞ SORU KAYDI: yalnızca finalize_exam() yazar
create table question_usages (
  id bigserial primary key,
  teacher_id uuid not null references profiles,
  question_id uuid not null references questions,
  exam_id uuid not null references exams,
  exam_title text not null,                 -- sınav silinse/yeniden adlandırılsa bile kayıt korunur
  exam_kind exam_kind not null,
  exam_date date not null,
  class_ids uuid[] default '{}',
  created_at timestamptz default now(),
  unique (exam_id, question_id)
);
create index on question_usages (teacher_id, question_id, exam_date desc);
```

**Kullanılmış soru mekanizması nasıl çalışır?**

1. **Kayıt.** Öğretmen "Sınavı Kesinleştir" dediğinde `finalize_exam(exam_id)` fonksiyonu çalışır. Bu fonksiyon tek bir işlem içinde:
   - sınavın sahibini ve taslak olduğunu doğrular,
   - her sorunun o anki halini `exam_items.snapshot` alanına kopyalar (soru sonradan düzenlense de eski yazılı ve cevap anahtarı bozulmaz),
   - her soru için `question_usages` tablosuna bir satır ekler,
   - sınavın durumunu `finalized` yapar.

   Tarayıcının bu tabloya doğrudan yazma izni yoktur (RLS). Bu yüzden kayıtlar güvenilirdir.

2. **Sorgulama.** Yazılı oluşturucu açılınca tek bir çağrı yapılır:
   ```sql
   create function my_question_usage_summary()
   returns table (question_id uuid, usage_count int, last_exam_title text,
                  last_exam_date date, last_class_ids uuid[])
   language sql stable security invoker as $$
     select distinct on (question_id)
            question_id,
            count(*) over (partition by question_id)::int,
            exam_title, exam_date, class_ids
     from question_usages
     where teacher_id = auth.uid()
     order by question_id, exam_date desc;
   $$;
   ```
   Sonuç tarayıcıda bir sözlükte tutulur, böylece havuzdaki her soru kartı anında işaretlenir.

3. **Uyarı.** Kullanılmış bir soru yazılıya eklenirken (tıklama ya da sürükle-bırak):
   > ⚠️ **Bu soruyu 12.11.2026 tarihli "6-A 1. Dönem 1. Yazılı" sınavında kullandınız!**
   > [Yine de ekle] [Benzer yeni soru üret] [Vazgeç]

   - Aynı sınıfta kullanıldıysa uyarı **kırmızı**, farklı sınıfta kullanıldıysa **turuncu** olur.
   - Havuz kartlarında rozet görünür: `🔁 2 kez kullanıldı`.
   - Filtre: **"Daha önce kullanmadıklarımı göster"**.
   - Otomatik yazılı oluşturucu kullanılmış soruları varsayılan olarak almaz.
   - Soru henüz kesinleşmemiş başka bir taslakta da varsa yumuşak bir bilgi notu çıkar.

4. **Geri alma.** Kesinleşmiş bir sınav yanlışlıkla kesinleştirildiyse `unfinalize_exam()` ilgili kullanım kayıtlarını siler (sınav uygulanmadan önce).

### 5.6 Online testler

```sql
create table assignments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams, teacher_id uuid not null references profiles,
  title text not null, starts_at timestamptz, ends_at timestamptz,
  duration_min int not null,
  settings jsonb default '{"shuffle_questions":true,"shuffle_options":true,"show_results":true,"max_attempts":1}'
);
create table assignment_classes (assignment_id uuid references assignments on delete cascade,
                                 class_id uuid references classes, primary key (assignment_id, class_id));

create table attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments, student_id uuid not null references profiles,
  started_at timestamptz default now(), deadline_at timestamptz not null,   -- sunucu saatiyle
  submitted_at timestamptz, status attempt_status default 'in_progress',
  score numeric, max_score numeric, correct int, wrong int, blank int
);
create table attempt_answers (
  attempt_id uuid references attempts on delete cascade,
  question_id uuid references questions,
  answer jsonb,                         -- null = boş bırakıldı
  flagged boolean default false,        -- "sonra dönerim"
  is_correct boolean, points numeric,   -- yalnızca submit_attempt() doldurur
  primary key (attempt_id, question_id)
);
```

**Cevap anahtarı öğrenciye gitmez.** Öğrencinin `questions` tablosunu okuma izni yoktur. Bunun yerine:

- `start_attempt(assignment_id)`: süreyi sunucu saatiyle başlatır, soruları **cevapsız** olarak döndürür (kök, şıklar, görsel).
- `save_answer(...)`: her cevap değişikliğini kaydeder. Sayfa yenilense ya da bağlantı kopsa da test kaldığı yerden devam eder.
- `submit_attempt(attempt_id)`: sunucuda puanlar, sonucu döndürür. Süre dolduysa geç cevapları kabul etmez.

### 5.7 Kazanım analizi (görünümler)

Ayrı bir istatistik tablosu gerekmez; PostgreSQL bunu cevaplardan hesaplar:

```sql
create view student_outcome_stats as
select a.student_id, o.code as outcome_code, o.theme_id,
       count(*) filter (where aa.is_correct) as correct,
       count(*) as total
from attempt_answers aa
join attempts a           on a.id = aa.attempt_id and a.status = 'submitted'
join question_outcomes qo on qo.question_id = aa.question_id
join outcomes o           on o.id = qo.outcome_id
group by 1,2,3;
```

- Öğrenci, yalnızca kendi satırlarını görür.
- Öğretmen, sınıfındaki öğrencilerin satırlarını görür.
- Aynı mantıkla `class_outcome_stats` (sınıf ısı haritası) ve `question_item_stats` (madde analizi: soru başına doğru yüzdesi, hatalı ya da çok zor soruları yakalamak için) görünümleri hazırlanır.
- Veri büyüdüğünde bunlar "materialized view"a çevrilip gece yenilenebilir.

### 5.8 Hatalı soru bildirimi ve karantina

```sql
create table reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions, reporter_id uuid not null references profiles,
  reason report_reason not null, note text,
  status report_status default 'open',
  resolved_by uuid references profiles, resolved_at timestamptz,
  created_at timestamptz default now(),
  unique (question_id, reporter_id)          -- aynı kişi aynı soruyu bir kez bildirir
);
```

`reports` tablosuna satır eklenince bir tetikleyici çalışır:

- Bir **öğretmen** bildirimi ya da **3 farklı öğrencinin** bildirimi → soru `quarantined` olur.
- Karantinadaki soru havuz aramasında, otomatik yazılıda ve yeni testlerde kullanılamaz.
- Soru sahibi düzeltir (önceki hali `question_revisions` tablosuna yazılır), sonra yeniden aktifleştirir ya da arşivler.

### 5.9 Yapay zeka işleri (kota ve maliyet takibi)

```sql
create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles,
  request jsonb not null, status text default 'running',
  question_ids uuid[], input_tokens int, output_tokens int, error text,
  created_at timestamptz default now()
);
```

Öğretmen başına günlük üretim sınırı bu tablodan hesaplanır.

---

### 5.10 Uygulamada yapılan sadeleştirmeler (Adım 3)

Gerçek şema `supabase/migrations/20261004000001_init.sql` dosyasındadır. Taslaktan farklar:
- **Sınav maddeleri** ayrı `exam_items` tablosu yerine `exams.sections` JSONB alanında tutulur (`[{id, title, items:[{questionId, points, snapshot?}]}]`). Sürükle-bırak sıralaması tek güncellemeyle kaydedilir. Kullanılmış soru kaydı yine ayrı ve ilişkisel `question_usages` tablosundadır.
- **Sınıflar** `exams.class_ids uuid[]` alanıyla tutulur.
- **Soru–kazanım bağı** `questions.theme_id` + `questions.outcome_codes text[]` ile kurulur. Kazanımın kimliği tema + kod olduğu için bu ikili birlikte okunur.
- **Doğrulama:** Şema ve kurallar yerel PostgreSQL'de 43 davranış testiyle doğrulanır (`npm run test:db`).

## 6. Güvenlik: Satır Bazlı Güvenlik (RLS)

Her tabloda RLS **açık** olacak. Kurallar şöyle özetlenir:

| Tablo | Öğretmen | Öğrenci |
|---|---|---|
| müfredat tabloları | okur (yazma yalnızca yönetici) | okur |
| `profiles` | kendini + sınıfındaki öğrencileri okur; `role` alanını değiştiremez | kendini okur |
| `questions` | kendi sorularını yazar; `public` olanları okur | **erişemez** |
| `question_usages` | kendi kayıtlarını okur, **yazamaz** | erişemez |
| `exams`, `exam_items` | kendi sınavları | erişemez |
| `assignments` | kendi atamaları | sınıfına atananları okur |
| `attempts`, `attempt_answers` | sınıfındakileri okur | kendininkini okur; yazma yalnızca RPC ile |
| `reports` | ekler; kendi sorusuna geleni yönetir | ekler |
| `teacher_requests` | kendi başvurusunu okur (yönetici: tümünü okur ve sonuçlandırır) | — |

Rol kontrolü için yardımcı fonksiyon: `create function auth_role() returns user_role ... select role from profiles where id = auth.uid()`.

---

## 7. Yapay zeka soru üretim hattı (Vercel Function)

```
Tarayıcı ──POST /api/generate-questions (Authorization: Bearer <Supabase oturum anahtarı>)──►
  1. Oturum anahtarını Supabase ile doğrula, rol = teacher mı?
  2. Günlük kota kontrolü (ai_jobs)
  3. Seçilen tema ve kazanım metinlerini veritabanından çek
  4. Claude API çağrısı: Maarif Modeli ilkeleri, sınıf düzeyi, Bloom tanımı,
     çeldirici kuralları; JSON şemasıyla yapılandırılmış çıktı
  5. Doğrulama: tek doğru şık, şık sayısı, cevap ile çözüm tutarlı mı,
     benzer soru var mı (pg_trgm benzerlik araması)
  6. Soruları status='draft' olarak kaydet → öğretmen önizler, düzenler, onaylar
```

- Yapay zekanın ürettiği sorular **öğretmen onayı olmadan** aktif olmaz.
- Uzun süren üretimler için fonksiyonun süre sınırı (`maxDuration`) `vercel.json` içinde ayarlanır; gerekirse sorular tek tek akış (streaming) halinde gönderilir.
- Model adı ortam değişkeninden okunur (`AI_MODEL`), kod değiştirmeden değiştirilebilir.

---

## 8. Yazılı oluşturucu, online test, analiz

Firebase planındaki işlevler aynen korunuyor:

- **Yazılı oluşturucu:** manuel (sürükle-bırak) ve otomatik (tema dağılımı + zorluk oranı) mod. Cevap anahtarı ve barem otomatik oluşur. PDF ve Word çıktısı alınır, A/B kitapçık seçeneği vardır.
- **Online test:** sayaç, soru paleti, boş bırakma, işaretleme, "Sınavı Bitir", süre dolunca otomatik teslim, anında sonuç ekranı.
- **Analiz:** öğrenci için tema radarı ve kazanım çubuk grafiği; öğretmen için sınıf ısı haritası ve madde analizi.

---

## 9. Ücretsiz planların sınırları

| Servis | Dikkat edilecek nokta |
|---|---|
| Supabase Free | 500 MB veritabanı, 1 GB dosya deposu. **7 gün hiç kullanılmayan proje duraklatılır**; panelden tek tıkla yeniden açılır. Gerçek kullanımda Pro plan önerilir. |
| Vercel Hobby | Kişisel ve **ticari olmayan** kullanım içindir. Okul ya da ücretli kullanımda Pro plan gerekir. Fonksiyon süre sınırları plana göre değişir. |
| Claude API | Kullandıkça ödenir. Günlük kota ile maliyet kontrol altında tutulur. |

---

## 10. Yol haritası

| Adım | Kapsam |
|---|---|
| **1** | Mimari ve şema (bu belge) + kurulum rehberi ✅ |
| **2** | Vite + Tailwind iskeleti, rol bazlı paneller (Demo Modu), soru havuzu ve düzenleyici, sürükle-bırak yazılı oluşturucu, kullanılmış soru uyarısı, otomatik oluşturma, cevap anahtarı, PDF/Word çıktısı, Yönetici paneli (öğretmen onayı, müfredat CSV içe aktarma) ✅ |
| **3** | Migration dosyaları, RLS kuralları, RPC fonksiyonları (`finalize_exam` vb.), Supabase giriş/kayıt (profil tablosuna bağlı olduğu için bu adıma alındı), Demo deposunun Supabase deposuyla değiştirilmesi, `/api/generate-questions` ile yapay zeka entegrasyonu |
| **4** | Online test oynatıcı, puanlama, kazanım analizi grafikleri, hatalı soru bildirimi ve karantina |
