-- Veritabanı davranış testleri. Çalıştırma: npm run test:db  (yerel PostgreSQL gerekir)
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'BAŞARISIZ: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- Hata beklenen ifadeyi çalıştırır
create or replace function pg_temp.throws(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (beklenen hata: %)', label, sqlerrm;
    return;
  end;
  raise exception 'BAŞARISIZ (hata bekleniyordu): %', label;
end $$;

-- ------------------------------------------------------------------ kayıt tetikleyicisi
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.tr', '{"full_name":"Yönetici"}'),
  ('00000000-0000-0000-0000-00000000000b', 'ogretmen@test.tr', '{"full_name":"Ayşe Öğretmen","requested_role":"teacher","school_name":"Atatürk Ortaokulu","branch":"Matematik"}'),
  ('00000000-0000-0000-0000-00000000000c', 'ogrenci@test.tr', '{"full_name":"Ali Öğrenci","grade":"6"}'),
  ('00000000-0000-0000-0000-00000000000d', 'ogretmen2@test.tr', '{"full_name":"Mehmet Öğretmen","requested_role":"teacher"}');

select pg_temp.ok((select role from profiles where id = '00000000-0000-0000-0000-00000000000c') = 'student', 'öğrenci kaydı student rolü alır');
select pg_temp.ok((select grade from profiles where id = '00000000-0000-0000-0000-00000000000c') = 6, 'öğrencinin sınıfı kaydedilir');
select pg_temp.ok((select role from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'pending_teacher', 'öğretmen kaydı onay bekler');
select pg_temp.ok((select count(*) from teacher_requests where status = 'pending') = 2, 'öğretmen başvuruları oluşur');

-- İlk yönetici Supabase panelinden elle atanır
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

-- ------------------------------------------------------------------ rol koruması
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.throws($$update profiles set role = 'teacher' where id = auth.uid()$$, 'kullanıcı kendi rolünü yükseltemez');
select pg_temp.throws($$select review_teacher_request((select id from teacher_requests limit 1), true)$$, 'öğretmen adayı başvuru onaylayamaz');
select pg_temp.throws($$insert into questions (owner_id, grade, subject_id, type, difficulty, bloom, stem) values (auth.uid(), 6, 'x', 'true_false', 'kolay', 'anlama', 'x')$$, 'onaysız öğretmen soru ekleyemez');
select pg_temp.ok((select count(*) from teacher_requests) = 1, 'aday yalnızca kendi başvurusunu görür');
update profiles set full_name = 'Ayşe Yılmaz' where id = auth.uid();
select pg_temp.ok((select full_name from profiles where id = auth.uid()) = 'Ayşe Yılmaz', 'kullanıcı adını güncelleyebilir');
commit;

-- ------------------------------------------------------------------ müfredat içe aktarma (yönetici)
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(
  import_curriculum('{"subjects":[{"id":"g6-matematik","gradeId":6,"name":"Matematik","programYear":2024}],
    "themes":[{"id":"g6-matematik-t1","subjectId":"g6-matematik","order":1,"name":"Sayılar ve Nicelikler (1)"},
              {"id":"g6-matematik-t2","subjectId":"g6-matematik","order":2,"name":"Sayılar ve Nicelikler (2)"}],
    "outcomes":[{"themeId":"g6-matematik-t1","code":"MAT.6.1.2","text":"Bölünebilme","processComponents":["a) x"]},
                {"themeId":"g6-matematik-t1","code":"MAT.6.1.3","text":"Asal sayılar"},
                {"themeId":"g6-matematik-t2","code":"MAT.6.1.3","text":"Aynı kod başka temada"}]}'::jsonb)
  = '{"themes":{"added":2,"updated":0},"outcomes":{"added":3,"updated":0},"subjects":{"added":1,"updated":0}}'::jsonb,
  'müfredat eklenir; aynı kod farklı temada ayrı kayıt olur');
select pg_temp.ok(
  (import_curriculum('{"outcomes":[{"themeId":"g6-matematik-t1","code":"MAT.6.1.2","text":"Bölünebilme kuralları"},{"themeId":"g6-matematik-t1","code":"MAT.6.1.3","text":"Asal sayılar"}]}'::jsonb)
   ->'outcomes') = '{"added":0,"updated":1}'::jsonb,
  'tekrar içe aktarma yalnızca değişeni günceller');
-- başvuruları sonuçlandır
select review_teacher_request((select id from teacher_requests where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select review_teacher_request((select id from teacher_requests where user_id = '00000000-0000-0000-0000-00000000000d'), false, 'Bilgiler doğrulanamadı');
commit;
select pg_temp.ok((select role from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'teacher', 'onaylanan aday öğretmen olur');
select pg_temp.ok((select role from profiles where id = '00000000-0000-0000-0000-00000000000d') = 'pending_teacher', 'reddedilen aday öğretmen olamaz');
select pg_temp.ok((select reason from teacher_requests where user_id = '00000000-0000-0000-0000-00000000000d') = 'Bilgiler doğrulanamadı', 'ret gerekçesi kaydedilir');

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.throws($$select import_curriculum('{"subjects":[]}')$$, 'öğrenci müfredat içe aktaramaz');
select pg_temp.ok((select count(*) from outcomes) = 3, 'öğrenci müfredatı okuyabilir');
commit;

-- ------------------------------------------------------------------ sınıflar
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into classes (id, teacher_id, name, grade, subject_id) values ('10000000-0000-0000-0000-000000000001', auth.uid(), '6-A Matematik', 6, 'g6-matematik');
select pg_temp.ok((select join_code from classes) ~ '^[A-HJ-NP-Z2-9]{6}$', 'sınıf kodu otomatik üretilir');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from classes) = 0, 'öğrenci katılmadığı sınıfı göremez');
select pg_temp.throws($$select join_class('YANLIS')$$, 'geçersiz sınıf kodu reddedilir');
commit;
-- Sınıf kodunu öğretmen öğrenciye söyler; burada yönetici yetkisiyle okunup öğrenci adına kullanılır
do $$ declare code text := (select join_code from classes limit 1); begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
  perform join_class(lower(code));
end $$;
select pg_temp.ok((select count(*) from class_members) = 1, 'öğrenci sınıf koduyla katılır (büyük/küçük harf duyarsız)');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from profiles where id = '00000000-0000-0000-0000-00000000000c') = 1, 'öğretmen sınıfındaki öğrencinin profilini görür');
select pg_temp.ok((select count(*) from profiles where id = '00000000-0000-0000-0000-00000000000d') = 0, 'öğretmen başka kullanıcıların profilini göremez');
commit;

-- ------------------------------------------------------------------ sorular
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into questions (id, owner_id, grade, subject_id, theme_id, outcome_codes, type, difficulty, bloom, stem, body, answer, status) values
  ('20000000-0000-0000-0000-000000000001', auth.uid(), 6, 'g6-matematik', 'g6-matematik-t1', '{MAT.6.1.3}', 'true_false', 'kolay', 'anlama', 'Her asal sayı tek sayıdır.', '{}', 'false', 'active'),
  ('20000000-0000-0000-0000-000000000002', auth.uid(), 6, 'g6-matematik', 'g6-matematik-t1', '{MAT.6.1.2}', 'fill_blank', 'kolay', 'hatirlama', 'Rakamlar toplamı ____ ile bölünür.', '{}', '["3"]', 'active'),
  ('20000000-0000-0000-0000-000000000003', auth.uid(), 6, 'g6-matematik', 'g6-matematik-t1', '{}', 'true_false', 'kolay', 'anlama', 'Silinecek soru', '{}', 'true', 'draft');
update questions set stem = 'Her asal sayı tektir.' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.ok((select version from questions where id = '20000000-0000-0000-0000-000000000001') = 2, 'içerik düzenlenince sürüm artar');
select pg_temp.ok((select count(*) from question_revisions) = 1, 'önceki hal revizyon olarak saklanır');
update questions set status = 'archived' where id = '20000000-0000-0000-0000-000000000002';
update questions set status = 'active' where id = '20000000-0000-0000-0000-000000000002';
select pg_temp.ok((select version from questions where id = '20000000-0000-0000-0000-000000000002') = 1, 'yalnızca durum değişince sürüm artmaz');
select pg_temp.ok((select count(*) from questions where search @@ plainto_tsquery('turkish', 'asal')) = 1, 'Türkçe tam metin arama çalışır');
delete from questions where id = '20000000-0000-0000-0000-000000000003';
select pg_temp.ok((select count(*) from questions) = 2, 'kullanılmamış soru silinebilir');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from questions) = 0, 'öğrenci soruları (ve cevapları) göremez');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from questions) = 0, 'başka öğretmenin özel sorusu görünmez');
commit;

-- ------------------------------------------------------------------ ⭐ sınav kesinleştirme ve kullanılmış soru kaydı
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into exams (id, owner_id, title, subject_id, grade, class_ids, exam_date, sections) values (
  '30000000-0000-0000-0000-000000000001', auth.uid(), '6-A 1. Yazılı', 'g6-matematik', 6, '{10000000-0000-0000-0000-000000000001}', '2026-11-12',
  '[{"id":"s1","title":"Sorular","items":[{"questionId":"20000000-0000-0000-0000-000000000001","points":40},{"questionId":"20000000-0000-0000-0000-000000000002","points":60}]}]');
select pg_temp.throws($$delete from questions where id = '20000000-0000-0000-0000-000000000001'$$, 'taslak sınavdaki soru silinemez');
select finalize_exam('30000000-0000-0000-0000-000000000001');
select pg_temp.ok((select status from exams) = 'finalized', 'sınav kesinleşir');
select pg_temp.ok((select count(*) from question_usages where exam_date = '2026-11-12' and exam_title = '6-A 1. Yazılı') = 2, 'her soru için kullanım kaydı yazılır');
select pg_temp.ok((select sections->0->'items'->0->'snapshot'->>'stem' from exams) = 'Her asal sayı tektir.', 'sorunun anlık görüntüsü saklanır');
select pg_temp.ok((select sections->0->'items'->1->>'points' from exams) = '60', 'madde sırası ve puanlar korunur');
update questions set stem = 'Değiştirilmiş kök' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.ok((select sections->0->'items'->0->'snapshot'->>'stem' from exams) = 'Her asal sayı tektir.', 'soru sonradan düzenlense de sınavdaki hali değişmez');
update exams set title = 'Değiştirme denemesi';
select pg_temp.ok((select title from exams) = '6-A 1. Yazılı', 'kesinleşmiş sınav güncellenemez (RLS)');
select pg_temp.throws($$select finalize_exam('30000000-0000-0000-0000-000000000001')$$, 'sınav iki kez kesinleştirilemez');
select pg_temp.throws($$insert into question_usages (teacher_id, question_id, exam_id, exam_title, exam_kind, exam_date) values (auth.uid(), '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'sahte', 'written', '2020-01-01')$$, 'istemci kullanım kaydı yazamaz');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.throws($$select unfinalize_exam('30000000-0000-0000-0000-000000000001')$$, 'başka öğretmen sınavı geri alamaz');
select pg_temp.ok((select count(*) from question_usages) = 0, 'başka öğretmenin kullanım kayıtları görünmez');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select unfinalize_exam('30000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from question_usages) = 0, 'geri alınca kullanım kayıtları silinir');
select pg_temp.ok((select sections->0->'items'->0 ? 'snapshot' from exams) = false, 'geri alınca anlık görüntüler kaldırılır');
insert into exams (owner_id, title, exam_date) values (auth.uid(), 'Boş sınav', '2026-12-01');
select pg_temp.throws($$select finalize_exam((select id from exams where title = 'Boş sınav'))$$, 'boş sınav kesinleştirilemez');
commit;

\o
\echo TÜM VERİTABANI TESTLERİ GEÇTİ
