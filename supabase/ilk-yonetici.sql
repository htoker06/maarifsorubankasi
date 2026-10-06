-- İLK YÖNETİCİ HESABI
-- 1) Sitede kendi e-posta adresinizle "Öğrenci kaydı" ya da "Öğretmen başvurusu" yapın.
-- 2) Aşağıdaki satırdaki e-posta adresini kendi adresinizle değiştirip Supabase SQL Editor'de çalıştırın.
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'BURAYA-KENDI-E-POSTANIZ@ornek.com');

-- Kontrol: aşağıdaki sorgu rolünüzü "admin" olarak göstermeli
select p.full_name, u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
