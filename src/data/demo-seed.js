// DEMO VERİSİ: Arayüzü denemek için hazırlanmış örnek kayıtlar.
// Öğrenme çıktısı kodları ÖRNEKTİR, resmî MEB kodları değildir. Gerçek liste
// öğretim programlarından içe aktarılacaktır (bkz. docs/MIMARI.md §4).

export const DEMO_TEACHER_ID = 'u_teacher_demo';
export const DEMO_STUDENT_ID = 'u_student_demo';
export const DEMO_ADMIN_ID = 'u_admin_demo';

const grades = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  level: i < 4 ? 'ilkokul' : i < 8 ? 'ortaokul' : 'lise',
}));

const subjects = [
  { id: 'g4-turkce', gradeId: 4, name: 'Türkçe', programYear: 2024 },
  { id: 'g6-matematik', gradeId: 6, name: 'Matematik', programYear: 2024 },
  { id: 'g6-fen-bilimleri', gradeId: 6, name: 'Fen Bilimleri', programYear: 2024 },
];

const themes = [
  { id: 'g4-turkce-t1', subjectId: 'g4-turkce', order: 1, name: 'Erdemler' },
  { id: 'g4-turkce-t2', subjectId: 'g4-turkce', order: 2, name: 'Millî Kültürümüz' },
  { id: 'g6-matematik-t1', subjectId: 'g6-matematik', order: 1, name: 'Sayılar ve Nicelikler (1)' },
  { id: 'g6-matematik-t2', subjectId: 'g6-matematik', order: 2, name: 'Sayılar ve Nicelikler (2)' },
  { id: 'g6-matematik-t3', subjectId: 'g6-matematik', order: 3, name: 'Geometrik Şekiller' },
  { id: 'g6-fen-bilimleri-t1', subjectId: 'g6-fen-bilimleri', order: 1, name: 'Güneş Sistemi ve Tutulmalar' },
  { id: 'g6-fen-bilimleri-t2', subjectId: 'g6-fen-bilimleri', order: 2, name: 'Vücudumuzdaki Sistemler' },
  { id: 'g6-fen-bilimleri-t3', subjectId: 'g6-fen-bilimleri', order: 3, name: 'Kuvvet ve Hareket' },
];

const outcomes = [
  { code: 'ÖRN.T4.1.1', themeId: 'g4-turkce-t1', text: 'Kelimelerin eş ve zıt anlamlılarını belirleyebilme' },
  { code: 'ÖRN.T4.1.2', themeId: 'g4-turkce-t1', text: 'Duygu ve düşüncelerini yazılı olarak ifade edebilme' },
  { code: 'ÖRN.T4.2.1', themeId: 'g4-turkce-t2', text: 'Cümlede eylem bildiren kelimeleri ayırt edebilme' },
  { code: 'ÖRN.T4.2.2', themeId: 'g4-turkce-t2', text: 'Noktalama işaretlerini işlevine uygun kullanabilme' },
  { code: 'ÖRN.M6.1.1', themeId: 'g6-matematik-t1', text: 'Asal sayıları ve bölünebilme kurallarını kullanarak çıkarım yapabilme' },
  { code: 'ÖRN.M6.1.2', themeId: 'g6-matematik-t1', text: 'EBOB ve EKOK ile ilgili problemleri çözebilme' },
  { code: 'ÖRN.M6.1.3', themeId: 'g6-matematik-t1', text: 'Üslü ifadelerin değerini hesaplayabilme' },
  { code: 'ÖRN.M6.2.1', themeId: 'g6-matematik-t2', text: 'Denk kesirleri belirleyebilme' },
  { code: 'ÖRN.M6.2.2', themeId: 'g6-matematik-t2', text: 'Bir çokluğun belirtilen kesir kadarını hesaplayabilme' },
  { code: 'ÖRN.M6.3.1', themeId: 'g6-matematik-t3', text: 'Dikdörtgenin alanını hesaplayabilme' },
  { code: 'ÖRN.F6.1.1', themeId: 'g6-fen-bilimleri-t1', text: 'Güneş sistemindeki gezegenleri Güneşe yakınlıklarına göre sıralayabilme' },
  { code: 'ÖRN.F6.1.2', themeId: 'g6-fen-bilimleri-t1', text: 'Ayın ışık kaynağı olmadığını gözlem ve kanıta dayalı açıklayabilme' },
  { code: 'ÖRN.F6.2.1', themeId: 'g6-fen-bilimleri-t2', text: 'Sindirim sistemini oluşturan yapı ve organların görevlerini açıklayabilme' },
  { code: 'ÖRN.F6.2.2', themeId: 'g6-fen-bilimleri-t2', text: 'Sindirim sistemi sağlığı için alınabilecek önlemleri değerlendirebilme' },
  { code: 'ÖRN.F6.3.1', themeId: 'g6-fen-bilimleri-t3', text: 'Kuvvetin ölçülmesinde kullanılan aracı tanıyabilme' },
  { code: 'ÖRN.F6.3.2', themeId: 'g6-fen-bilimleri-t3', text: 'Madde ile ilgili büyüklükleri (kütle, hacim, yoğunluk) ilişkilendirebilme' },
];

const profiles = [
  { id: DEMO_TEACHER_ID, role: 'teacher', fullName: 'Demo Öğretmen', schoolName: 'Örnek Ortaokulu' },
  { id: DEMO_STUDENT_ID, role: 'student', fullName: 'Demo Öğrenci', schoolName: 'Örnek Ortaokulu', grade: 6 },
  { id: DEMO_ADMIN_ID, role: 'admin', fullName: 'Demo Yönetici', schoolName: 'SoruBankasıMatik' },
  // Öğretmen olarak kaydolan kullanıcılar, yönetici onaylayana kadar "pending_teacher" rolündedir.
  { id: 'u_pending_1', role: 'pending_teacher', fullName: 'Ayşe Yılmaz', schoolName: 'Atatürk Ortaokulu' },
  { id: 'u_pending_2', role: 'pending_teacher', fullName: 'Mehmet Kaya', schoolName: 'Cumhuriyet Lisesi' },
];

const teacherRequests = [
  { id: 'tr_1', userId: 'u_pending_1', fullName: 'Ayşe Yılmaz', email: 'ayse.yilmaz@example.com', schoolName: 'Atatürk Ortaokulu', branch: 'Matematik', note: '8 yıldır ortaokul matematik öğretmeniyim.', status: 'pending', createdAt: '2026-10-01T08:30:00.000Z' },
  { id: 'tr_2', userId: 'u_pending_2', fullName: 'Mehmet Kaya', email: 'mehmet.kaya@example.com', schoolName: 'Cumhuriyet Lisesi', branch: 'Fizik', note: '', status: 'pending', createdAt: '2026-10-02T14:10:00.000Z' },
];

const classes = [
  { id: 'c_6a_mat', teacherId: DEMO_TEACHER_ID, name: '6-A Matematik', grade: 6, subjectId: 'g6-matematik', joinCode: 'M6A2QX', studentIds: [DEMO_STUDENT_ID] },
  { id: 'c_6b_mat', teacherId: DEMO_TEACHER_ID, name: '6-B Matematik', grade: 6, subjectId: 'g6-matematik', joinCode: 'M6B7KP', studentIds: [] },
  { id: 'c_6a_fen', teacherId: DEMO_TEACHER_ID, name: '6-A Fen Bilimleri', grade: 6, subjectId: 'g6-fen-bilimleri', joinCode: 'F6A4RT', studentIds: [DEMO_STUDENT_ID] },
];

const T = '2026-09-01T09:00:00.000Z';
const base = { ownerId: DEMO_TEACHER_ID, status: 'active', visibility: 'private', source: 'manual', reportCount: 0, version: 1, context: '', createdAt: T, updatedAt: T };
const skills = (conceptual = [], values = [], literacies = [], sel = []) => ({ conceptual, values, literacies, sel });

const questions = [
  // ---------- 6. sınıf Matematik ----------
  {
    ...base, id: 'q_m6_01', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t2', outcomeCodes: ['ÖRN.M6.2.1'],
    type: 'multiple_choice', difficulty: 'kolay', bloom: 'anlama', defaultPoints: 5,
    skills: skills(['Karşılaştırma']),
    stem: 'Aşağıdakilerden hangisi 3/4 kesrine denktir?',
    body: { options: [
      { key: 'A', text: '6/8', rationale: null },
      { key: 'B', text: '4/3', rationale: 'Pay ile paydanın yerini değiştirme yanılgısı' },
      { key: 'C', text: '3/8', rationale: 'Yalnızca paydayı genişletme yanılgısı' },
      { key: 'D', text: '7/8', rationale: 'Pay ve paydaya aynı sayıyı ekleme yanılgısı' },
    ] },
    answer: 'A',
    solution: '3/4 kesrinin payı ve paydası 2 ile genişletilirse 6/8 elde edilir.',
  },
  {
    ...base, id: 'q_m6_02', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t2', outcomeCodes: ['ÖRN.M6.2.2'],
    type: 'multiple_choice', difficulty: 'orta', bloom: 'uygulama', defaultPoints: 5,
    skills: skills(['Problem çözme'], [], ['Veri okuryazarlığı']),
    stem: 'Bir sınıftaki 30 öğrencinin 2/5\'i gözlük kullanmaktadır. Bu sınıfta gözlük kullanmayan kaç öğrenci vardır?',
    body: { options: [
      { key: 'A', text: '12', rationale: 'Gözlük kullananların sayısını bulup soruyu tamamlamama' },
      { key: 'B', text: '18', rationale: null },
      { key: 'C', text: '20', rationale: 'Kesri 1/3 gibi işleme' },
      { key: 'D', text: '15', rationale: 'Bütünün yarısını alma' },
    ] },
    answer: 'B',
    solution: '30 · 2/5 = 12 öğrenci gözlük kullanır. 30 − 12 = 18 öğrenci gözlük kullanmaz.',
  },
  {
    ...base, id: 'q_m6_03', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t1', outcomeCodes: ['ÖRN.M6.1.1'],
    type: 'fill_blank', difficulty: 'kolay', bloom: 'hatirlama', defaultPoints: 4,
    skills: skills(['Çıkarım yapma']),
    stem: 'Bir doğal sayının 3 ile kalansız bölünebilmesi için rakamlarının toplamının ____ ile kalansız bölünebilmesi gerekir.',
    body: {},
    answer: ['3', 'üç'],
    solution: '3 ile bölünebilme kuralı: Rakamlar toplamı 3\'ün katı olmalıdır.',
  },
  {
    ...base, id: 'q_m6_04', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t1', outcomeCodes: ['ÖRN.M6.1.1'],
    type: 'true_false', difficulty: 'kolay', bloom: 'anlama', defaultPoints: 3,
    skills: skills(['Sorgulama']),
    stem: 'Her asal sayı tek sayıdır.',
    body: {},
    answer: false,
    solution: '2 hem asal hem de çift sayıdır. Bu nedenle ifade yanlıştır.',
  },
  {
    ...base, id: 'q_m6_05', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t1', outcomeCodes: ['ÖRN.M6.1.2'],
    type: 'open_ended', difficulty: 'zor', bloom: 'analiz', defaultPoints: 10,
    skills: skills(['Problem çözme', 'Çıkarım yapma'], ['Tasarruf'], [], ['Sorumlu karar verme']),
    stem: 'Ayşe, 48 cm ve 36 cm uzunluğundaki iki kurdeleyi hiç artmayacak şekilde, birbirine eşit ve olabildiğince uzun parçalara ayırmak istiyor. Her bir parça kaç cm olur ve toplam kaç parça elde edilir? Çözümünüzü açıklayınız.',
    body: { rubric: [
      { criterion: 'Problemin EBOB ile çözüleceğini belirleme', points: 3 },
      { criterion: 'EBOB(48, 36) = 12 hesaplama', points: 4 },
      { criterion: 'Parça sayısını (4 + 3 = 7) bulma', points: 3 },
    ] },
    answer: 'Her parça 12 cm olur; 48 ÷ 12 = 4 ve 36 ÷ 12 = 3 olmak üzere toplam 7 parça elde edilir.',
    solution: 'En uzun eşit parça uzunluğu iki sayının EBOB\'udur. 48 = 2⁴ · 3, 36 = 2² · 3² → EBOB = 2² · 3 = 12.',
  },
  {
    ...base, id: 'q_m6_06', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t1', outcomeCodes: ['ÖRN.M6.1.2', 'ÖRN.M6.1.3'],
    type: 'multiple_choice', difficulty: 'orta', bloom: 'analiz', defaultPoints: 5,
    skills: skills(['Çıkarım yapma']),
    stem: 'a = 2³ · 3 ve b = 2² · 3² olduğuna göre EKOK(a, b) kaçtır?',
    body: { options: [
      { key: 'A', text: '12', rationale: 'EBOB ile EKOK\'u karıştırma' },
      { key: 'B', text: '72', rationale: null },
      { key: 'C', text: '144', rationale: 'Ortak çarpanları iki kez sayma' },
      { key: 'D', text: '36', rationale: 'Yalnızca b sayısını alma' },
    ] },
    answer: 'B',
    solution: 'EKOK için her asal çarpanın en büyük üssü alınır: 2³ · 3² = 8 · 9 = 72.',
  },
  {
    ...base, id: 'q_m6_07', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t1', outcomeCodes: ['ÖRN.M6.1.3'],
    type: 'matching', difficulty: 'kolay', bloom: 'uygulama', defaultPoints: 8,
    skills: skills(['Sınıflandırma']),
    stem: 'Aşağıdaki üslü ifadeleri değerleriyle eşleştiriniz.',
    body: { pairs: [
      { left: '2³', right: '8' },
      { left: '3²', right: '9' },
      { left: '5²', right: '25' },
      { left: '10³', right: '1000' },
    ] },
    answer: null,
    solution: '2³ = 2·2·2 = 8, 3² = 3·3 = 9, 5² = 5·5 = 25, 10³ = 10·10·10 = 1000.',
  },
  {
    ...base, id: 'q_m6_08', grade: 6, subjectId: 'g6-matematik', themeId: 'g6-matematik-t3', outcomeCodes: ['ÖRN.M6.3.1'],
    type: 'multiple_choice', difficulty: 'kolay', bloom: 'uygulama', defaultPoints: 5,
    skills: skills(['Problem çözme'], [], ['Görsel okuryazarlık']),
    stem: 'Kısa kenarı 4 cm, uzun kenarı 7 cm olan bir dikdörtgenin alanı kaç cm²\'dir?',
    body: { options: [
      { key: 'A', text: '11', rationale: 'Kenarları toplama' },
      { key: 'B', text: '22', rationale: 'Çevre ile alanı karıştırma' },
      { key: 'C', text: '28', rationale: null },
      { key: 'D', text: '32', rationale: 'İşlem hatası' },
    ] },
    answer: 'C',
    solution: 'Dikdörtgenin alanı = kısa kenar · uzun kenar = 4 · 7 = 28 cm².',
  },
  // ---------- 6. sınıf Fen Bilimleri ----------
  {
    ...base, id: 'q_f6_01', grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t1', outcomeCodes: ['ÖRN.F6.1.1'],
    type: 'multiple_choice', difficulty: 'kolay', bloom: 'hatirlama', defaultPoints: 5,
    skills: skills(['Sınıflandırma']),
    stem: 'Güneş sistemindeki gezegenlerden Güneş\'e en yakın olanı hangisidir?',
    body: { options: [
      { key: 'A', text: 'Venüs', rationale: 'En sıcak gezegen ile en yakın gezegeni karıştırma' },
      { key: 'B', text: 'Merkür', rationale: null },
      { key: 'C', text: 'Mars', rationale: null },
      { key: 'D', text: 'Dünya', rationale: null },
    ] },
    answer: 'B',
    solution: 'Güneş\'e yakınlık sırası: Merkür, Venüs, Dünya, Mars, Jüpiter, Satürn, Uranüs, Neptün.',
  },
  {
    ...base, id: 'q_f6_02', grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t1', outcomeCodes: ['ÖRN.F6.1.2'],
    type: 'true_false', difficulty: 'kolay', bloom: 'anlama', defaultPoints: 3,
    skills: skills(['Sorgulama']),
    stem: 'Ay, kendi ışığını üreten bir gök cismidir.',
    body: {},
    answer: false,
    solution: 'Ay ışık kaynağı değildir; Güneş\'ten aldığı ışığı yansıtır.',
  },
  {
    ...base, id: 'q_f6_03', grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t2', outcomeCodes: ['ÖRN.F6.2.1'],
    type: 'multiple_choice', difficulty: 'orta', bloom: 'anlama', defaultPoints: 5,
    skills: skills(['Yorumlama'], ['Sağlıklı yaşam']),
    stem: 'Sindirim sisteminde besinlerin kimyasal sindiriminin tamamlandığı organ hangisidir?',
    body: { options: [
      { key: 'A', text: 'Mide', rationale: 'Protein sindiriminin başladığı yer ile tamamlandığı yeri karıştırma' },
      { key: 'B', text: 'Yemek borusu', rationale: 'Yemek borusunda sindirim olmaz' },
      { key: 'C', text: 'İnce bağırsak', rationale: null },
      { key: 'D', text: 'Kalın bağırsak', rationale: 'Su emilimi ile sindirimi karıştırma' },
    ] },
    answer: 'C',
    solution: 'Karbonhidrat, protein ve yağların kimyasal sindirimi ince bağırsakta tamamlanır.',
  },
  {
    ...base, id: 'q_f6_04', grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t2', outcomeCodes: ['ÖRN.F6.2.2'],
    type: 'open_ended', difficulty: 'zor', bloom: 'degerlendirme', defaultPoints: 10,
    skills: skills(['Eleştirel düşünme', 'Karar verme'], ['Sağlıklı yaşam', 'Sorumluluk']),
    stem: 'Sindirim sistemi sağlığını korumak için alınabilecek iki önlemi yazınız ve her birinin neden önemli olduğunu açıklayınız.',
    body: { rubric: [
      { criterion: 'Geçerli iki önlem yazma (lifli beslenme, yeterli su, iyi çiğneme, hijyen vb.)', points: 4 },
      { criterion: 'Her önlemin sindirim sistemine etkisini doğru açıklama', points: 6 },
    ] },
    answer: 'Örnek: Lifli besinler tüketmek bağırsak hareketlerini düzenler; besinleri iyi çiğnemek mekanik sindirimi kolaylaştırır.',
    solution: 'Önlem ve gerekçe birlikte değerlendirilir.',
  },
  {
    ...base, id: 'q_f6_05', grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t3', outcomeCodes: ['ÖRN.F6.3.1'],
    type: 'multiple_choice', difficulty: 'kolay', bloom: 'hatirlama', defaultPoints: 5, status: 'draft',
    skills: skills(['Gözlemleme']),
    stem: 'Dinamometre ile aşağıdakilerden hangisi ölçülür?',
    body: { options: [
      { key: 'A', text: 'Kütle', rationale: 'Kütle ile ağırlığı (kuvveti) karıştırma' },
      { key: 'B', text: 'Kuvvet', rationale: null },
      { key: 'C', text: 'Hacim', rationale: null },
      { key: 'D', text: 'Sıcaklık', rationale: null },
    ] },
    answer: 'B',
    solution: 'Dinamometre kuvvet ölçer; birimi newton (N)\'dur.',
  },
  {
    ...base, id: 'q_f6_06', grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t3', outcomeCodes: ['ÖRN.F6.3.2'],
    type: 'fill_blank', difficulty: 'orta', bloom: 'hatirlama', defaultPoints: 4,
    skills: skills(['Yorumlama']),
    stem: 'Bir maddenin birim hacminin kütlesine ____ denir.',
    body: {},
    answer: ['yoğunluk', 'özkütle', 'öz kütle'],
    solution: 'Yoğunluk = kütle / hacim.',
  },
  // ---------- 4. sınıf Türkçe ----------
  {
    ...base, id: 'q_t4_01', grade: 4, subjectId: 'g4-turkce', themeId: 'g4-turkce-t1', outcomeCodes: ['ÖRN.T4.1.1'],
    type: 'multiple_choice', difficulty: 'kolay', bloom: 'hatirlama', defaultPoints: 5,
    skills: skills(['Karşılaştırma']),
    stem: '"Büyük" kelimesinin zıt anlamlısı aşağıdakilerden hangisidir?',
    body: { options: [
      { key: 'A', text: 'küçük', rationale: null },
      { key: 'B', text: 'iri', rationale: 'Eş anlamlı kelimeyi seçme' },
      { key: 'C', text: 'kocaman', rationale: 'Eş anlamlı kelimeyi seçme' },
    ] },
    answer: 'A',
    solution: '"Büyük" kelimesinin zıt anlamlısı "küçük"tür.',
  },
  {
    ...base, id: 'q_t4_02', grade: 4, subjectId: 'g4-turkce', themeId: 'g4-turkce-t2', outcomeCodes: ['ÖRN.T4.2.1'],
    type: 'multiple_choice', difficulty: 'orta', bloom: 'analiz', defaultPoints: 5,
    skills: skills(['Sınıflandırma']),
    stem: '"Ali sabah erkenden kalktı, kahvaltısını yaptı ve okula gitti." cümlesinde kaç tane eylem (fiil) vardır?',
    body: { options: [
      { key: 'A', text: '2', rationale: 'Bir eylemi gözden kaçırma' },
      { key: 'B', text: '3', rationale: null },
      { key: 'C', text: '4', rationale: '"erkenden" kelimesini eylem sanma' },
    ] },
    answer: 'B',
    solution: 'Cümledeki eylemler: kalktı, yaptı, gitti → 3 eylem.',
  },
  {
    ...base, id: 'q_t4_03', grade: 4, subjectId: 'g4-turkce', themeId: 'g4-turkce-t2', outcomeCodes: ['ÖRN.T4.2.2'],
    type: 'fill_blank', difficulty: 'kolay', bloom: 'hatirlama', defaultPoints: 4,
    skills: skills([]),
    stem: 'Soru bildiren cümlelerin sonuna ____ konur.',
    body: {},
    answer: ['soru işareti', '?'],
    solution: 'Soru cümlelerinin sonuna soru işareti (?) konur.',
  },
  {
    ...base, id: 'q_t4_04', grade: 4, subjectId: 'g4-turkce', themeId: 'g4-turkce-t1', outcomeCodes: ['ÖRN.T4.1.2'],
    type: 'open_ended', difficulty: 'orta', bloom: 'sentez', defaultPoints: 10,
    skills: skills(['Yaratıcı düşünme'], ['Yardımseverlik', 'Arkadaşlık'], [], ['İletişim']),
    stem: 'Okulunuzda ya da çevrenizde yardımlaşma ile ilgili yaşadığınız bir olayı 3-4 cümleyle anlatınız.',
    body: { rubric: [
      { criterion: 'Olayın konuya (yardımlaşma) uygun olması', points: 4 },
      { criterion: 'Cümlelerin anlamlı ve sıralı olması', points: 4 },
      { criterion: 'Yazım ve noktalama kurallarına uyma', points: 2 },
    ] },
    answer: 'Öğrencinin kendi deneyimine dayalı özgün anlatım beklenir.',
    solution: 'Dereceli puanlama anahtarına göre değerlendirilir.',
  },
];

// Daha önce kesinleşmiş iki sınav: kullanılmış soru uyarısını denemek için.
const exams = [
  {
    id: 'e_demo_1', ownerId: DEMO_TEACHER_ID, kind: 'written', title: '6-A Matematik 2. Dönem 1. Yazılı',
    grade: 6, subjectId: 'g6-matematik', classIds: ['c_6a_mat'], examDate: '2026-03-18', status: 'finalized',
    header: { schoolName: 'Örnek Ortaokulu', academicYear: '2025-2026', term: '2. Dönem', durationMin: 40, instructions: 'Her sorunun puanı yanında belirtilmiştir. Başarılar!' },
    sections: [{ id: 's1', title: 'Sorular', items: [
      { questionId: 'q_m6_01', points: 30 }, { questionId: 'q_m6_02', points: 30 }, { questionId: 'q_m6_05', points: 40 },
    ] }],
    finalizedAt: '2026-03-17T15:00:00.000Z', createdAt: '2026-03-10T10:00:00.000Z', updatedAt: '2026-03-17T15:00:00.000Z',
  },
  {
    id: 'e_demo_2', ownerId: DEMO_TEACHER_ID, kind: 'scan_unit', title: 'Sayılar ve Nicelikler Ünite Tarama Testi',
    grade: 6, subjectId: 'g6-matematik', classIds: ['c_6b_mat'], examDate: '2026-09-29', status: 'finalized',
    header: { schoolName: 'Örnek Ortaokulu', academicYear: '2026-2027', term: '1. Dönem', durationMin: 20, instructions: '' },
    sections: [{ id: 's1', title: 'Sorular', items: [
      { questionId: 'q_m6_02', points: 50 }, { questionId: 'q_m6_06', points: 50 },
    ] }],
    finalizedAt: '2026-09-28T15:00:00.000Z', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-28T15:00:00.000Z',
  },
];

const usages = exams.flatMap((exam) =>
  exam.sections.flatMap((section) =>
    section.items.map((item) => ({
      teacherId: exam.ownerId,
      questionId: item.questionId,
      examId: exam.id,
      examTitle: exam.title,
      examKind: exam.kind,
      examDate: exam.examDate,
      classIds: exam.classIds,
      createdAt: exam.finalizedAt,
    })),
  ),
);

export function createSeed() {
  return structuredClone({ version: 1, grades, subjects, themes, outcomes, profiles, teacherRequests, classes, questions, exams, usages, revisions: [], reports: [] });
}
