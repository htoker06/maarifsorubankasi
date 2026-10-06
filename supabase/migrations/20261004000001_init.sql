-- =====================================================================
-- SoruBankasıMatik — Adım 3: temel şema, güvenlik kuralları (RLS) ve RPC fonksiyonları
-- Supabase SQL Editor'de tek seferde çalıştırılabilir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sabit değer listeleri
-- ---------------------------------------------------------------------
create type public.user_role       as enum ('teacher', 'student', 'admin', 'pending_teacher');
create type public.school_level    as enum ('ilkokul', 'ortaokul', 'lise');
create type public.question_type   as enum ('multiple_choice', 'open_ended', 'fill_blank', 'matching', 'true_false');
create type public.difficulty      as enum ('kolay', 'orta', 'zor');
create type public.bloom_level     as enum ('hatirlama', 'anlama', 'uygulama', 'analiz', 'degerlendirme', 'sentez');
create type public.question_status as enum ('draft', 'active', 'quarantined', 'archived');
create type public.exam_kind       as enum ('written', 'scan_unit', 'scan_topic', 'scan_general', 'online_trial');
create type public.exam_status     as enum ('draft', 'finalized', 'archived');

-- ---------------------------------------------------------------------
-- 2. Müfredat (referans veri; yazma yalnızca import_curriculum() ile)
-- ---------------------------------------------------------------------
create table public.grades (
  id smallint primary key check (id between 1 and 12),
  level public.school_level not null
);
insert into public.grades (id, level)
select g, case when g <= 4 then 'ilkokul' when g <= 8 then 'ortaokul' else 'lise' end::public.school_level
from generate_series(1, 12) g;

create table public.subjects (
  id text primary key,
  grade_id smallint not null references public.grades,
  name text not null,
  program_year int
);

create table public.themes (
  id text primary key,
  subject_id text not null references public.subjects on delete cascade,
  sort_order int not null,
  name text not null,
  meta jsonb not null default '{}'   -- ünitenin beceri/değer bilgileri (AI istemi için bağlam)
);
create index on public.themes (subject_id, sort_order);

-- Resmî programlarda aynı kod birden fazla temada geçebilir; benzersiz olan (tema, kod) ikilisidir.
create table public.outcomes (
  id bigserial primary key,
  theme_id text not null references public.themes on delete cascade,
  code text not null,
  text text not null,
  process_components jsonb not null default '[]',
  sort_order int,
  unique (theme_id, code)
);

-- ---------------------------------------------------------------------
-- 3. Kullanıcılar, öğretmen başvuruları, sınıflar
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null,
  school_name text,
  grade smallint,
  created_at timestamptz not null default now()
);

create table public.teacher_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  full_name text not null,
  email text,
  school_name text not null default '',
  branch text not null default '',
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  reviewed_by uuid references public.profiles,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.teacher_requests (status, created_at desc);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles on delete cascade,
  name text not null,
  grade smallint references public.grades,
  subject_id text references public.subjects,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.class_members (
  class_id uuid not null references public.classes on delete cascade,
  student_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- ---------------------------------------------------------------------
-- 4. Soru havuzu
-- ---------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  grade smallint not null references public.grades,
  subject_id text not null references public.subjects,
  theme_id text references public.themes,
  outcome_codes text[] not null default '{}',     -- theme_id ile birlikte outcomes(theme_id, code)'a karşılık gelir
  type public.question_type not null,
  difficulty public.difficulty not null,
  bloom public.bloom_level not null,
  skills jsonb not null default '{}',
  stem text not null check (length(stem) between 1 and 5000),
  context text not null default '',
  media jsonb not null default '[]',
  body jsonb not null default '{}',
  answer jsonb,
  solution text not null default '',
  default_points numeric not null default 5 check (default_points >= 0),
  status public.question_status not null default 'draft',
  visibility text not null default 'private' check (visibility in ('private', 'school', 'public')),
  source text not null default 'manual' check (source in ('ai', 'manual', 'imported')),
  ai_meta jsonb,
  report_count int not null default 0,
  version int not null default 1,
  search tsvector generated always as (to_tsvector('turkish', coalesce(stem, '') || ' ' || coalesce(context, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.questions (owner_id, status, updated_at desc);
create index on public.questions (subject_id, theme_id, difficulty, type, status);
create index on public.questions using gin (search);

create table public.question_revisions (
  id bigserial primary key,
  question_id uuid not null references public.questions on delete cascade,
  version int not null,
  data jsonb not null,
  edited_by uuid references public.profiles,
  edited_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Sınavlar ve kullanılmış soru kayıtları
-- ---------------------------------------------------------------------
-- sections: [{ id, title, items: [{ questionId, points, snapshot? }] }]
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  kind public.exam_kind not null default 'written',
  title text not null check (length(title) between 1 and 300),
  grade smallint references public.grades,
  subject_id text references public.subjects,
  class_ids uuid[] not null default '{}',
  exam_date date,
  status public.exam_status not null default 'draft',
  header jsonb not null default '{}',
  sections jsonb not null default '[]',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.exams (owner_id, updated_at desc);

-- KULLANILMIŞ SORU KAYDI: yalnızca finalize_exam() yazar
create table public.question_usages (
  id bigserial primary key,
  teacher_id uuid not null references public.profiles on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  exam_title text not null,
  exam_kind public.exam_kind not null,
  exam_date date not null,
  class_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (exam_id, question_id)
);
create index on public.question_usages (teacher_id, question_id, exam_date desc);

-- ---------------------------------------------------------------------
-- 6. Yapay zeka işleri (kota ve maliyet takibi; yalnızca sunucu yazar)
-- ---------------------------------------------------------------------
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles on delete cascade,
  request jsonb not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  question_ids uuid[] not null default '{}',
  model text,
  input_tokens int,
  output_tokens int,
  error text,
  created_at timestamptz not null default now()
);
create index on public.ai_jobs (teacher_id, created_at desc);

-- =====================================================================
-- YARDIMCI FONKSİYONLAR
-- =====================================================================
create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('teacher', 'admin') from public.profiles where id = auth.uid()), false)
$$;

-- Öğretmen, sınıfındaki öğrencinin profilini görebilir mi?
create or replace function public.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_members m join public.classes c on c.id = m.class_id
    where m.student_id = p_student and c.teacher_id = auth.uid()
  )
$$;

-- RLS kurallarında tablolar birbirine atıf yapınca sonsuz döngü oluşmasın diye üyelik kontrolleri fonksiyonda
create or replace function public.is_class_member(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members where class_id = p_class and student_id = auth.uid())
$$;

create or replace function public.is_class_teacher(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid())
$$;

create or replace function public.gen_join_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- karışabilecek 0/O, 1/I yok
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = code);
  end loop;
  return code;
end $$;
alter table public.classes alter column join_code set default public.gen_join_code();

-- =====================================================================
-- TETİKLEYİCİLER
-- =====================================================================

-- Yeni kullanıcı → profil (+ öğretmen başvurusu). Kayıt formundaki bilgiler raw_user_meta_data'dan gelir.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  wants_teacher boolean := meta->>'requested_role' = 'teacher';
  name text := coalesce(nullif(trim(meta->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'Kullanıcı');
begin
  insert into public.profiles (id, role, full_name, school_name, grade)
  values (
    new.id,
    (case when wants_teacher then 'pending_teacher' else 'student' end)::public.user_role,
    left(name, 120),
    left(nullif(trim(meta->>'school_name'), ''), 200),
    case when (meta->>'grade') ~ '^\d{1,2}$' and (meta->>'grade')::int between 1 and 12 then (meta->>'grade')::smallint end
  );
  if wants_teacher then
    insert into public.teacher_requests (user_id, full_name, email, school_name, branch, note)
    values (new.id, left(name, 120), new.email, left(coalesce(meta->>'school_name', ''), 200),
            left(coalesce(meta->>'branch', ''), 100), left(meta->>'note', 1000));
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kullanıcı kendi rolünü değiştiremez (yalnızca yönetici fonksiyonları ya da sunucu anahtarı)
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'Rol değiştirme yetkiniz yok.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_profile_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Soru düzenlenince önceki hali revizyon olarak saklanır, sürüm artar
create or replace function public.question_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) - array['status', 'updated_at', 'report_count', 'search', 'version'])
     is distinct from (to_jsonb(old) - array['status', 'updated_at', 'report_count', 'search', 'version']) then
    insert into public.question_revisions (question_id, version, data, edited_by)
    values (old.id, old.version, to_jsonb(old) - 'search', auth.uid());
    new.version := old.version + 1;
  end if;
  new.owner_id := old.owner_id;  -- sahiplik devredilemez
  new.updated_at := now();
  return new;
end $$;
create trigger question_before_update before update on public.questions
  for each row execute function public.question_before_update();

-- Bir sınavda kullanılmış ya da taslakta bulunan soru silinemez (arşivlenebilir)
create or replace function public.question_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.question_usages where question_id = old.id)
     or exists (
       select 1 from public.exams e, jsonb_array_elements(e.sections) s, jsonb_array_elements(s->'items') i
       where i->>'questionId' = old.id::text
     ) then
    raise exception 'Bu soru bir sınavda yer aldığı için silinemez. Arşivleyebilirsiniz.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger question_before_delete before delete on public.questions
  for each row execute function public.question_before_delete();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger exams_touch before update on public.exams
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RPC FONKSİYONLARI
-- =====================================================================

-- Yönetici: öğretmen başvurusunu sonuçlandırır
create or replace function public.review_teacher_request(p_request_id uuid, p_approve boolean, p_reason text default null)
returns public.teacher_requests
language plpgsql security definer set search_path = public as $$
declare
  req public.teacher_requests;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yönetici yetkisi gerekir.' using errcode = '42501';
  end if;
  update public.teacher_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reason = nullif(trim(p_reason), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id and status = 'pending'
  returning * into req;
  if req.id is null then
    raise exception 'Başvuru bulunamadı ya da zaten sonuçlandı.' using errcode = 'P0002';
  end if;
  update public.profiles set role = case when p_approve then 'teacher' else 'pending_teacher' end::public.user_role
   where id = req.user_id;
  return req;
end $$;

-- Öğrenci: sınıf koduyla sınıfa katılır
create or replace function public.join_class(p_code text) returns public.classes
language plpgsql security definer set search_path = public as $$
declare
  c public.classes;
begin
  if public.auth_role() is distinct from 'student' then
    raise exception 'Sınıfa yalnızca öğrenci hesapları katılabilir.' using errcode = '42501';
  end if;
  select * into c from public.classes where join_code = upper(trim(p_code));
  if c.id is null then
    raise exception 'Bu sınıf kodu bulunamadı.' using errcode = 'P0002';
  end if;
  insert into public.class_members (class_id, student_id) values (c.id, auth.uid()) on conflict do nothing;
  return c;
end $$;

-- Yönetici: müfredat içe aktarma (ekle/güncelle, silmez). Girdi: { subjects:[], themes:[], outcomes:[] }
create or replace function public.import_curriculum(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s_added int; s_updated int; t_added int; t_updated int; o_added int; o_updated int;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yönetici yetkisi gerekir.' using errcode = '42501';
  end if;

  with up as (
    insert into public.subjects (id, grade_id, name, program_year)
    select x->>'id', (x->>'gradeId')::smallint, x->>'name', nullif(x->>'programYear', '')::int
    from jsonb_array_elements(coalesce(p_payload->'subjects', '[]')) x
    on conflict (id) do update set name = excluded.name, program_year = coalesce(excluded.program_year, subjects.program_year)
      where (subjects.name, subjects.program_year) is distinct from (excluded.name, coalesce(excluded.program_year, subjects.program_year))
    returning (xmax = 0) as inserted
  ) select count(*) filter (where inserted), count(*) filter (where not inserted) into s_added, s_updated from up;

  with up as (
    insert into public.themes (id, subject_id, sort_order, name, meta)
    select x->>'id', x->>'subjectId', (x->>'order')::int, x->>'name', coalesce(x->'meta', '{}')
    from jsonb_array_elements(coalesce(p_payload->'themes', '[]')) x
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order,
      meta = case when excluded.meta = '{}'::jsonb then themes.meta else excluded.meta end
      where (themes.name, themes.sort_order) is distinct from (excluded.name, excluded.sort_order) or excluded.meta <> '{}'::jsonb
    returning (xmax = 0) as inserted
  ) select count(*) filter (where inserted), count(*) filter (where not inserted) into t_added, t_updated from up;

  with up as (
    insert into public.outcomes (theme_id, code, text, process_components, sort_order)
    select x->>'themeId', x->>'code', x->>'text', coalesce(x->'processComponents', '[]'), (ord)::int
    from jsonb_array_elements(coalesce(p_payload->'outcomes', '[]')) with ordinality as t(x, ord)
    on conflict (theme_id, code) do update set text = excluded.text, process_components = excluded.process_components, sort_order = excluded.sort_order
      where (outcomes.text, outcomes.process_components) is distinct from (excluded.text, excluded.process_components)
    returning (xmax = 0) as inserted
  ) select count(*) filter (where inserted), count(*) filter (where not inserted) into o_added, o_updated from up;

  return jsonb_build_object(
    'subjects', jsonb_build_object('added', s_added, 'updated', s_updated),
    'themes', jsonb_build_object('added', t_added, 'updated', t_updated),
    'outcomes', jsonb_build_object('added', o_added, 'updated', o_updated)
  );
end $$;

-- ⭐ Sınavı kesinleştirir: soru anlık görüntülerini saklar ve KULLANILMIŞ SORU kayıtlarını yazar (tek transaction)
create or replace function public.finalize_exam(p_exam_id uuid) returns public.exams
language plpgsql security definer set search_path = public as $$
declare
  e public.exams;
  item_ids uuid[];
  new_sections jsonb;
begin
  select * into e from public.exams where id = p_exam_id for update;
  if e.id is null or e.owner_id <> auth.uid() then
    raise exception 'Sınav bulunamadı.' using errcode = 'P0002';
  end if;
  if e.status <> 'draft' then
    raise exception 'Sınav zaten kesinleşmiş.' using errcode = 'P0001';
  end if;
  if e.exam_date is null then
    raise exception 'Sınav tarihi girilmelidir.' using errcode = 'P0001';
  end if;

  select array_agg(distinct (i->>'questionId')::uuid) into item_ids
  from jsonb_array_elements(e.sections) s, jsonb_array_elements(s->'items') i;
  if item_ids is null then
    raise exception 'Sınavda hiç soru yok.' using errcode = 'P0001';
  end if;
  if exists (select unnest(item_ids) except select id from public.questions) then
    raise exception 'Sınavdaki bir soru bulunamadı.' using errcode = 'P0002';
  end if;

  -- Her maddeye sorunun o anki tam halini ekle (camelCase, istemcideki soru modeliyle aynı)
  select jsonb_agg(
           jsonb_set(s, '{items}', coalesce((
             select jsonb_agg(i || jsonb_build_object('snapshot', public.question_to_json(q)) order by ord)
             from jsonb_array_elements(s->'items') with ordinality as it(i, ord)
             join public.questions q on q.id = (i->>'questionId')::uuid
           ), '[]'))
           order by sord)
    into new_sections
  from jsonb_array_elements(e.sections) with ordinality as st(s, sord);

  insert into public.question_usages (teacher_id, question_id, exam_id, exam_title, exam_kind, exam_date, class_ids)
  select e.owner_id, qid, e.id, e.title, e.kind, e.exam_date, e.class_ids
  from unnest(item_ids) qid
  on conflict (exam_id, question_id) do update
    set exam_title = excluded.exam_title, exam_date = excluded.exam_date, class_ids = excluded.class_ids;

  update public.exams set status = 'finalized', finalized_at = now(), sections = new_sections
   where id = e.id
  returning * into e;
  return e;
end $$;

create or replace function public.unfinalize_exam(p_exam_id uuid) returns public.exams
language plpgsql security definer set search_path = public as $$
declare
  e public.exams;
begin
  select * into e from public.exams where id = p_exam_id for update;
  if e.id is null or e.owner_id <> auth.uid() then
    raise exception 'Sınav bulunamadı.' using errcode = 'P0002';
  end if;
  if e.status <> 'finalized' then
    raise exception 'Sınav kesinleşmiş değil.' using errcode = 'P0001';
  end if;
  delete from public.question_usages where exam_id = e.id;
  update public.exams
     set status = 'draft', finalized_at = null,
         sections = (select coalesce(jsonb_agg(jsonb_set(s, '{items}', coalesce((
                       select jsonb_agg(i - 'snapshot' order by ord) from jsonb_array_elements(s->'items') with ordinality as it(i, ord)
                     ), '[]')) order by sord), '[]') from jsonb_array_elements(e.sections) with ordinality as st(s, sord))
   where id = e.id
  returning * into e;
  return e;
end $$;

-- Müfredat özeti: ders başına tema ve öğrenme çıktısı sayıları (yönetici ekranı için hafif sorgu)
create or replace function public.curriculum_summary()
returns table (subject_id text, grade_id smallint, name text, theme_count bigint, outcome_count bigint)
language sql stable security invoker set search_path = public as $$
  select s.id, s.grade_id, s.name,
         (select count(*) from public.themes t where t.subject_id = s.id),
         (select count(*) from public.outcomes o join public.themes t on t.id = o.theme_id where t.subject_id = s.id)
  from public.subjects s
  order by s.grade_id, s.name
$$;

-- Soru satırını istemcinin kullandığı camelCase JSON'a çevirir (anlık görüntüler için)
create or replace function public.question_to_json(q public.questions) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', q.id, 'ownerId', q.owner_id, 'grade', q.grade, 'subjectId', q.subject_id, 'themeId', q.theme_id,
    'outcomeCodes', to_jsonb(q.outcome_codes), 'type', q.type, 'difficulty', q.difficulty, 'bloom', q.bloom,
    'skills', q.skills, 'stem', q.stem, 'context', q.context, 'media', q.media, 'body', q.body, 'answer', q.answer,
    'solution', q.solution, 'defaultPoints', q.default_points, 'status', q.status, 'version', q.version
  )
$$;

-- =====================================================================
-- SATIR BAZLI GÜVENLİK (RLS)
-- =====================================================================
alter table public.grades            enable row level security;
alter table public.subjects          enable row level security;
alter table public.themes            enable row level security;
alter table public.outcomes          enable row level security;
alter table public.profiles          enable row level security;
alter table public.teacher_requests  enable row level security;
alter table public.classes           enable row level security;
alter table public.class_members     enable row level security;
alter table public.questions         enable row level security;
alter table public.question_revisions enable row level security;
alter table public.exams             enable row level security;
alter table public.question_usages   enable row level security;
alter table public.ai_jobs           enable row level security;

-- Müfredat: oturum açmış herkes okur
create policy "müfredat okunur" on public.grades   for select to authenticated using (true);
create policy "müfredat okunur" on public.subjects for select to authenticated using (true);
create policy "müfredat okunur" on public.themes   for select to authenticated using (true);
create policy "müfredat okunur" on public.outcomes for select to authenticated using (true);

-- Profiller
create policy "kendi profilini okur" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.teaches_student(id));
create policy "kendi profilini günceller" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Öğretmen başvuruları
create policy "kendi başvurusunu okur" on public.teacher_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Sınıflar
create policy "öğretmen kendi sınıfları" on public.classes for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid() and public.is_teacher());
create policy "öğrenci katıldığı sınıfı görür" on public.classes for select to authenticated
  using (public.is_class_member(id));
create policy "yönetici sınıfları görür" on public.classes for select to authenticated using (public.is_admin());

create policy "üyelikleri görür" on public.class_members for select to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(class_id));
create policy "öğretmen öğrenciyi çıkarır" on public.class_members for delete to authenticated
  using (public.is_class_teacher(class_id));

-- Sorular: öğrenciler erişemez (cevaplar burada)
create policy "öğretmen soruları okur" on public.questions for select to authenticated
  using (public.is_teacher() and (owner_id = auth.uid() or visibility = 'public'));
create policy "öğretmen soru ekler" on public.questions for insert to authenticated
  with check (owner_id = auth.uid() and public.is_teacher());
create policy "öğretmen kendi sorusunu günceller" on public.questions for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "öğretmen kendi sorusunu siler" on public.questions for delete to authenticated
  using (owner_id = auth.uid());

create policy "soru revizyonlarını sahibi okur" on public.question_revisions for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()));

-- Sınavlar: yalnızca sahibi; kesinleşmiş sınav güncellenemez/silinemez (finalize/unfinalize RPC ile)
create policy "öğretmen kendi sınavlarını okur" on public.exams for select to authenticated using (owner_id = auth.uid());
create policy "öğretmen sınav oluşturur" on public.exams for insert to authenticated
  with check (owner_id = auth.uid() and public.is_teacher() and status = 'draft');
create policy "öğretmen taslak sınavı günceller" on public.exams for update to authenticated
  using (owner_id = auth.uid() and status = 'draft') with check (owner_id = auth.uid() and status = 'draft');
create policy "öğretmen taslak sınavı siler" on public.exams for delete to authenticated
  using (owner_id = auth.uid() and status = 'draft');

-- Kullanım kayıtları: yalnızca okunur
create policy "öğretmen kendi kullanım kayıtlarını okur" on public.question_usages for select to authenticated
  using (teacher_id = auth.uid());

-- AI işleri: öğretmen kendi kayıtlarını okur; yazma yalnızca sunucu (service_role) ile
create policy "öğretmen kendi AI işlerini okur" on public.ai_jobs for select to authenticated using (teacher_id = auth.uid());

-- RPC yetkileri
revoke execute on function public.review_teacher_request(uuid, boolean, text) from public, anon;
revoke execute on function public.join_class(text) from public, anon;
revoke execute on function public.import_curriculum(jsonb) from public, anon;
revoke execute on function public.finalize_exam(uuid) from public, anon;
revoke execute on function public.unfinalize_exam(uuid) from public, anon;
grant execute on function public.review_teacher_request(uuid, boolean, text) to authenticated;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.import_curriculum(jsonb) to authenticated;
grant execute on function public.finalize_exam(uuid) to authenticated;
grant execute on function public.unfinalize_exam(uuid) to authenticated;
