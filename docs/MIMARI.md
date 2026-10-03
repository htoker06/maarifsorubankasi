# SoruBankasıMatik — Adım 1: Sistem Mimarisi ve Veritabanı Tasarımı

> Durum: **Taslak, onay bekliyor.** Bu belge onaylandıktan sonra Adım 2 (UI/UX + HTML/CSS/JS altyapısı) başlayacaktır.

---

## 1. Teknoloji Yığını

| Katman | Teknoloji | Neden |
|---|---|---|
| Derleme / geliştirme | **Vite** (Vanilla JS, ES Modules) | Framework bağımlılığı yok, hızlı, modüler; çıktı saf HTML/CSS/JS |
| Arayüz | **Tailwind CSS** + küçük bileşen kütüphanesi (kendi `ui/` modüllerimiz) | Mobil öncelikli, tutarlı tasarım, karanlık mod |
| Sürükle-bırak | **SortableJS** | Yazılı kağıdında soru sırası, bölümler arası taşıma; dokunmatik destekli |
| Grafik | **Chart.js** | Kazanım analizi (radar, bar, zaman serisi) |
| Matematik / formül | **KaTeX** | Fen ve matematik sorularında LaTeX gösterimi |
| PDF çıktı | **pdfmake** (Türkçe karakterli gömülü font ile) | Sayfa düzeni kontrollü, A4, iki sütun, barem sayfası |
| Word çıktı | **docx** (npm) | Gerçek `.docx` üretimi (HTML→doc hilesi değil) |
| Kimlik doğrulama | **Firebase Authentication** (E-posta/Şifre + Google) | Rol bilgisi *Custom Claims* ile |
| Veritabanı | **Cloud Firestore** | Gerçek zamanlı, ölçeklenebilir, güvenlik kuralları |
| Sunucu mantığı | **Cloud Functions for Firebase (2. nesil, TypeScript)** | AI anahtarının gizli tutulması, puanlama, kullanım kaydı |
| Dosya | **Cloud Storage** | Soru görselleri, grafik/şekil ekleri |
| Barındırma | **Firebase Hosting** | SPA + CDN |
| Güvenlik | **App Check** (reCAPTCHA Enterprise) + Firestore Rules | AI fonksiyonlarının kötüye kullanımını önleme |
| AI | **Claude API** (`@anthropic-ai/sdk`, varsayılan model `claude-opus-5-5`) — *sağlayıcı bağımsız adaptör* ile | JSON Şema ile **yapılandırılmış çıktı** → her zaman doğrulanabilir soru nesnesi |
| Test | Vitest (birim) + Firebase Emulator Suite (kurallar ve fonksiyonlar) + Playwright (E2E) | |

> **Kritik güvenlik kararı:** AI API anahtarı **asla** tarayıcıya gönderilmez. Tüm AI çağrıları Cloud Functions üzerinden yapılır; anahtar *Secret Manager*'da tutulur.

---

## 2. Genel Mimari

```
┌──────────────────────────── Tarayıcı (SPA, Vite) ────────────────────────────┐
│  Öğretmen Paneli                         Öğrenci Paneli                       │
│  ├─ Soru Üret (AI)                       ├─ Atanan Testlerim                  │
│  ├─ Soru Havuzu (filtre/düzenle)         ├─ Online Test Oynatıcı (süre, gezinme)│
│  ├─ Yazılı Oluşturucu (sürükle-bırak)    ├─ Sonuç & Doğru/Yanlış ekranı        │
│  ├─ Tarama Testleri / Atamalar           ├─ Kazanım Karnem (Chart.js)          │
│  ├─ Sınıflarım & Analiz                  └─ Hatalı Soru Bildir                 │
│  └─ Karantina / Revizyon                                                       │
│         │  Firebase JS SDK (Auth, Firestore, Storage, Functions callable)      │
└─────────┼──────────────────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────── Firebase ─────────────────────────────────────────┐
│ Auth (custom claims: role=teacher|student|admin)                              │
│ Firestore  ◄──── Security Rules (rol + sahiplik kontrolü)                      │
│ Cloud Functions (callable / trigger):                                          │
│   generateQuestions   → Claude API → şema doğrulama → questions (status=draft) │
│   finalizeExam        → sınavı kilitler + questionUsages kayıtlarını yazar     │
│   startAttempt        → öğrenciye CEVAPSIZ soru kopyası verir, süre başlatır   │
│   submitAttempt       → sunucuda puanlar, kazanım istatistiklerini günceller   │
│   onReportCreated     → eşik aşılırsa soruyu karantinaya alır                  │
│   setUserRole         → admin / sınıf kodu ile rol atama                       │
│ Storage (soru görselleri)                                                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Klasör yapısı (planlanan)

```
/
├─ index.html
├─ src/
│  ├─ main.js                 # uygulama girişi, router başlatma
│  ├─ router.js               # hash tabanlı, rol korumalı rotalar
│  ├─ firebase.js             # SDK başlatma, emulator bağlantısı
│  ├─ state/store.js          # küçük reaktif store (oturum, filtreler)
│  ├─ services/               # Firestore erişim katmanı (tek yer)
│  │   ├─ questions.js  exams.js  usages.js  curriculum.js
│  │   ├─ assignments.js  attempts.js  reports.js  analytics.js
│  ├─ features/
│  │   ├─ auth/  teacher/  student/
│  │   ├─ generator/          # AI soru üretim sihirbazı
│  │   ├─ bank/               # havuz, filtre, editör
│  │   ├─ exam-builder/       # yazılı oluşturucu + uyarı sistemi
│  │   ├─ test-player/        # online test arayüzü
│  │   ├─ analytics/          # Chart.js raporları
│  │   └─ export/             # pdf.js, docx.js
│  ├─ ui/                     # buton, modal, toast, tablo, rozet bileşenleri
│  └─ styles/tailwind.css
├─ functions/                 # Cloud Functions (TypeScript)
│  └─ src/ ai/ exams/ attempts/ reports/ schemas/
├─ data/curriculum/           # müfredat tohum (seed) JSON dosyaları
├─ firestore.rules  firestore.indexes.json  storage.rules  firebase.json
└─ docs/MIMARI.md
```

---

## 3. Müfredat Modeli (Türkiye Yüzyılı Maarif Modeli)

Müfredat, soruların bağlandığı **referans veridir**; yalnızca admin yazabilir, herkes okuyabilir.

```
curriculum/{gradeId}                          # "g1" … "g12"
  ├─ level: "ilkokul" | "ortaokul" | "lise"
  ├─ grade: 5
  └─ subjects/{subjectId}                     # "g5-matematik"
       ├─ name: "Matematik"
       ├─ programYear: 2024                   # öğretim programı sürümü
       └─ themes/{themeId}                    # Tema / Ünite
            ├─ order: 1
            ├─ name: "Sayılar ve Nicelikler"
            └─ outcomes: [                    # Öğrenme çıktıları (kazanımlar)
                 { code: "MAT.5.1.1", text: "...", 
                   processComponents: ["a) ...", "b) ..."] }
               ]
```

Her soru şu Maarif Modeli boyutlarıyla etiketlenebilir (AI da bu etiketleri önerir):

| Alan | Örnek değerler |
|---|---|
| `fieldSkills` (alan becerileri) | Matematiksel muhakeme, bilimsel sorgulama… |
| `conceptualSkills` (kavramsal beceriler) | Karşılaştırma, çıkarım yapma, sorgulama, sınıflandırma… |
| `sel` (sosyal-duygusal öğrenme) | Öz düzenleme, iş birliği, empati… |
| `values` (değerler/erdemler) | Adalet, saygı, sorumluluk, merhamet, sabır… |
| `literacies` (okuryazarlıklar) | Bilgi, dijital, finansal, görsel, kültürel… |

> **Not:** Resmî öğrenme çıktısı kodları ve metinleri MEB'in yayımladığı öğretim programlarından alınmalıdır. Uydurma kod üretmemek için Adım 2'de örnek bir tohum veri seti ve **JSON/CSV içe aktarma aracı** hazırlayacağım; tam liste resmî programlardan aktarılacak.

### Bloom Taksonomisi ve zorluk

`bloomLevel`: `hatirlama` · `anlama` · `uygulama` · `analiz` · `degerlendirme` · `sentez` (yenilenmiş taksonomide "Yaratma")

`difficulty`: `kolay` · `orta` · `zor`

Varsayılan eşleme (öğretmen değiştirebilir): Hatırlama/Anlama → Kolay, Uygulama/Analiz → Orta, Değerlendirme/Sentez → Zor.

---

## 4. Firestore Veritabanı Şeması

Gösterim: `koleksiyon/{belgeId}` — alanlar tip ile.

### 4.1 `users/{uid}`
```js
{
  role: "teacher" | "student" | "admin",   // asıl yetki custom claim'de, burada aynası
  displayName: "Ayşe Yılmaz",
  email: "…",
  schoolId: "okul_123",                    // opsiyonel
  // öğretmen
  branches: ["g5-matematik", "g6-matematik"],
  // öğrenci
  grade: 6, classIds: ["class_abc"],
  createdAt: Timestamp
}
```
> KVKK: Öğrenciler çoğunlukla reşit değil → yalnızca ad-soyad, sınıf ve okul bilgisi tutulur; T.C. kimlik no vb. **tutulmaz**.

### 4.2 `classes/{classId}` — Öğretmenin sınıf/şubesi
```js
{
  teacherId: "uid_t", name: "6-A Matematik", grade: 6, subjectId: "g6-matematik",
  joinCode: "K7P2QX",            // öğrenci bu kodla katılır
  studentIds: ["uid_s1", "uid_s2"],
  createdAt
}
```

### 4.3 `questions/{questionId}` — Soru Havuzu (ana koleksiyon)
```js
{
  // Konumlandırma
  grade: 6, subjectId: "g6-matematik", themeId: "g6-mat-t1",
  outcomeCodes: ["MAT.6.1.2"],
  // Sınıflandırma
  type: "multiple_choice" | "open_ended" | "fill_blank" | "matching" | "true_false",
  difficulty: "orta", bloomLevel: "uygulama",
  fieldSkills: [...], conceptualSkills: [...], values: [...], literacies: [...],
  // İçerik
  stem: "Soru kökü (Markdown + KaTeX)",
  context: "Bağlam/okuma metni (ops.)",
  media: [{ url, alt }],
  // Tipe göre gövde (yalnızca biri dolu)
  options:   [{ key: "A", text: "...", isCorrect: false, distractorRationale: "Öğrencinin X kavram yanılgısı" }],
  blanks:    [{ index: 1, acceptedAnswers: ["kesir", "kesirler"] }],
  pairs:     [{ left: "...", right: "..." }],
  rubric:    [{ criterion: "İşlem doğruluğu", points: 4, description: "..." }], // açık uçlu
  answer: "B" | "metin" ,         // kanonik doğru cevap
  solution: "Adım adım çözüm",
  defaultPoints: 5,
  // Yaşam döngüsü
  status: "draft" | "active" | "quarantined" | "archived",
  source: "ai" | "manual" | "imported",
  aiMeta: { model, promptVersion, generatedAt, requestId },
  ownerId: "uid_t", visibility: "private" | "school" | "public",
  reportCount: 0,
  usageCount: 0,                   // tüm öğretmenler genelinde toplam (istatistik)
  stats: { attempts: 0, correct: 0, pValue: null },   // madde güçlük indeksi
  version: 3, createdAt, updatedAt
}
```
Alt koleksiyon: `questions/{id}/revisions/{revId}` — her düzenlemenin önceki hali (karantina sürecinde kim neyi değiştirdi izlenir).

### 4.4 `exams/{examId}` — Yazılı / Tarama Testi
```js
{
  ownerId: "uid_t",
  kind: "written" | "scan_unit" | "scan_topic" | "scan_general" | "online_trial",
  title: "6-A 1. Dönem 1. Yazılı",
  grade: 6, subjectId: "g6-matematik", classIds: ["class_abc"],
  examDate: Timestamp,              // sınavın uygulanacağı/uygulandığı tarih
  status: "draft" | "finalized" | "archived",
  finalizedAt: Timestamp | null,
  header: { school, academicYear, term, durationMin, instructions },
  sections: [                       // sürükle-bırak ile sıralanır
    { id: "s1", title: "A. Çoktan Seçmeli", items: [
        { questionId: "q1", points: 5, order: 1, snapshotVersion: 3 } ] }
  ],
  totalPoints: 100,
  answerKey: [{ no: 1, questionId: "q1", answer: "B", points: 5 }],   // otomatik
  rubric:    [{ no: 7, questionId: "q7", criteria: [...] }],          // otomatik barem
  createdAt, updatedAt
}
```
> Sınav **kesinleştirildiğinde** soruların o anki sürümü `exams/{id}/snapshots/{questionId}` altına kopyalanır; böylece soru sonradan düzenlense de eski yazılı ve cevap anahtarı bozulmaz.

### 4.5 ⭐ `questionUsages/{teacherId}_{questionId}` — Kullanılmış Soru Kontrol Mekanizması

Her **öğretmen + soru** çifti için **tek belge**. Belge kimliği deterministik olduğu için kontrol, sorgu yerine doğrudan okuma ile yapılır (hızlı ve ucuz).

```js
{
  teacherId: "uid_t",
  questionId: "q1",
  usageCount: 2,
  lastUsedAt: Timestamp,
  usages: [                          // en yeni başta, son 20 kayıt
    { examId: "e9", examTitle: "6-A 1. Dönem 1. Yazılı",
      examKind: "written", examDate: Timestamp("2026-11-12"), classIds: ["class_abc"] },
    { examId: "e4", examTitle: "Ünite 1 Tarama Testi",
      examKind: "scan_unit", examDate: Timestamp("2026-10-01"), classIds: ["class_abc"] }
  ]
}
```

**Akış:**

1. **Yazma — `finalizeExam` Cloud Function (transaction):**
   sınav `draft → finalized` olurken içindeki her soru için `questionUsages/{uid}_{qid}` belgesine kayıt eklenir, `questions/{qid}.usageCount` artırılır. İstemci bu koleksiyona **doğrudan yazamaz** (kurallar engeller) → kayıtlar güvenilirdir. Sınav kesinleşmeden geri çekilirse (`unfinalize`) ilgili kayıt aynı mantıkla geri alınır.
2. **Okuma — Yazılı Oluşturucu açıldığında:**
   öğretmenin tüm kullanım belgeleri tek sorguyla (`where("teacherId","==",uid)`) dinlenir ve bellekte `Map<questionId, usage>` tutulur. Bir öğretmenin kullandığı soru sayısı makul büyüklükte olduğundan bu tek dinleyici yeterlidir; havuz listelenirken her kart anında işaretlenir.
3. **Uyarı katmanları:**
   - Havuz kartında rozet: `🔁 2 kez kullanıldı`
   - Soru yazılıya eklenirken (tıklama veya sürükle-bırak) **belirgin uyarı modalı**:
     > ⚠️ **Bu soruyu 12.11.2026 tarihli "6-A 1. Dönem 1. Yazılı" sınavında kullandınız!**
     > [Yine de ekle] [Benzer yeni soru üret (AI)] [Vazgeç]
   - Aynı sınıfa (`classIds` kesişimi) uygulanmışsa uyarı **kırmızı**, farklı sınıfa uygulanmışsa **turuncu** gösterilir.
   - Henüz kesinleşmemiş *başka bir taslak* sınavda bulunan sorular için yumuşak bilgi: "Bu soru 'X' taslağında da var."
   - Filtre seçeneği: **"Daha önce kullanmadıklarımı göster"**.
   - Otomatik yazılı oluşturmada kullanılmış sorular varsayılan olarak **hariç tutulur**.
4. **"Benzer yeni soru üret"**: kullanılmış sorunun kazanım/zorluk/tip bilgisi ile AI'dan *aynı ölçmeyi yapan farklı* bir soru istenir (bkz. §5).

### 4.6 `assignments/{assignmentId}` — Online test ataması
```js
{
  examId: "e4", teacherId: "uid_t", classIds: ["class_abc"],
  title: "Ünite 1 Tarama", startsAt, endsAt, durationMin: 40,
  settings: { shuffleQuestions: true, shuffleOptions: true,
              showResultsImmediately: true, allowReview: true, maxAttempts: 1 },
  status: "scheduled" | "open" | "closed"
}
```
Öğrenciye gösterilen **cevapsız** kopya: `assignments/{id}/publicQuestions/{qid}` (yalnızca kök, seçenekler, medya). Cevaplar burada **yoktur** — öğrenci tarayıcıda cevap anahtarını göremez.

### 4.7 `attempts/{attemptId}` — Öğrencinin test denemesi
```js
{
  assignmentId, examId, studentId, classId,
  startedAt, deadlineAt,            // sunucu zamanı; süre sunucuda doğrulanır
  submittedAt: null,
  status: "in_progress" | "submitted" | "expired",
  answers: { "q1": "B", "q2": null /* boş */, "q3": ["1-c","2-a"] },
  flagged: ["q5"],                  // "sonra dönerim" işareti
  // submitAttempt sonrası sunucu yazar:
  result: {
    score: 72, maxScore: 100, correct: 14, wrong: 4, blank: 2, net: 13,
    perQuestion: { "q1": { correct: true, points: 5 } },
    perOutcome:  { "MAT.6.1.2": { correct: 3, total: 4 } },
    perTheme:    { "g6-mat-t1": { correct: 7, total: 10 } }
  }
}
```
Öğrenci yalnızca `answers` ve `flagged` alanlarını, yalnızca `in_progress` iken yazabilir; `result` alanına yalnızca Cloud Function yazar.

### 4.8 `outcomeStats/{studentId}_{subjectId}` — Kazanım karnesi (toplu)
```js
{
  studentId, subjectId, classIds,
  outcomes: { "MAT.6.1.2": { correct: 11, total: 15, lastAt } },
  themes:   { "g6-mat-t1": { correct: 30, total: 41 } },
  updatedAt
}
```
`submitAttempt` her teslimde bunu artırır → grafikler tek belge okumasıyla çizilir. Sınıf düzeyinde `classStats/{classId}_{subjectId}` aynı yapıyla tutulur (öğretmen paneli).

### 4.9 `reports/{reportId}` — Hatalı soru bildirimi
```js
{
  questionId, reporterId, reporterRole: "student" | "teacher",
  reason: "wrong_answer" | "multiple_correct" | "typo" | "out_of_curriculum" | "unclear" | "other",
  note: "B şıkkı da doğru görünüyor",
  status: "open" | "accepted" | "rejected",
  resolvedBy, resolvedAt, createdAt
}
```
**Karantina kuralı (`onReportCreated`):**
- Bir **öğretmen** bildirimi **veya** 3 farklı **öğrenci** bildirimi → `questions.status = "quarantined"`.
- Karantinadaki soru; havuz aramasında, otomatik yazılıda ve yeni online atamalarda **kullanılamaz**; sahibine bildirim düşer.
- Sahibi düzenler (yeni `revision`) → "Yeniden aktifleştir" ya da "Arşivle". Devam eden online testlerde soru puanlamadan çıkarılabilir (iptal sorusu).

### 4.10 `aiJobs/{jobId}` — AI üretim kayıtları (maliyet / kota / denetim)
```js
{ teacherId, request: { grade, subjectId, themeId, outcomeCodes, type, difficulty, bloomLevel, count },
  status: "running" | "done" | "failed", questionIds: [...],
  usage: { inputTokens, outputTokens }, error, createdAt }
```
Öğretmen başına günlük kota bu koleksiyondan hesaplanır.

### 4.11 İndeksler (ilk set)
- `questions`: `subjectId + themeId + difficulty + type + status`
- `questions`: `ownerId + status + updatedAt desc`
- `questionUsages`: `teacherId + lastUsedAt desc`
- `attempts`: `studentId + submittedAt desc`, `assignmentId + status`
- `reports`: `status + createdAt`

---

## 5. AI Soru Üretim Hattı

```
Öğretmen formu ─► generateQuestions (callable, App Check + kota)
   1. Müfredattan tema & öğrenme çıktısı metinlerini çek (bağlam)
   2. Sistem istemi: Maarif Modeli ilkeleri, sınıf düzeyine uygun dil,
      Bloom basamağı tanımı, çeldirici kuralları (her çeldirici bir
      kavram yanılgısına dayanmalı), Türkçe yazım kuralları
   3. Claude API çağrısı — output_config.format ile JSON Şema
      (soru tipine göre şema: options / blanks / pairs / rubric)
   4. Sunucuda doğrulama: tek doğru şık, şık sayısı (ilkokul 3, diğer 4–5),
      cevap–çözüm tutarlılığı, yinelenen soru kontrolü (normalize metin hash'i)
   5. questions'a status="draft" olarak yaz → öğretmen önizler, düzenler, onaylar → "active"
```

- **Model:** varsayılan `claude-opus-5-5` (en iyi kalite); model adı ortam değişkeninden okunur, gerekirse değiştirilebilir. Yanıt ret (`refusal`) durumları için sunucu tarafı yedek model (fallback) açık olacak.
- **Sağlayıcı adaptörü:** `functions/src/ai/provider.ts` arayüzü sayesinde ileride başka bir sağlayıcı eklenebilir; uygulama kodu değişmez.
- **Kalite güvencesi:** AI soruları hiçbir zaman doğrudan "active" olmaz; **öğretmen onayı zorunlu.**
- **Benzer soru üretimi:** mevcut soru örnek olarak verilir, "aynı öğrenme çıktısını aynı Bloom basamağında, farklı bağlam ve sayılarla ölç" talimatıyla yeni soru istenir.

---

## 6. Yazılı Oluşturucu ve Dışa Aktarım

- **Manuel mod:** solda filtrelenmiş havuz, sağda yazılı kağıdı; SortableJS ile havuzdan sürükle, bölümler arası taşı, sırala. Her eklemede §4.5 uyarı kontrolü çalışır.
- **Otomatik mod:** "Tema dağılımı + zorluk oranı (%30 kolay / %50 orta / %20 zor) + soru tipi + toplam puan" girilir; algoritma kullanılmamış ve aktif sorulardan dengeli seçim yapar, eksik kalırsa "AI ile tamamla" önerir.
- **Cevap anahtarı & barem:** sınav her değiştiğinde otomatik yeniden hesaplanır; açık uçlu sorular için ölçüt bazlı dereceli puanlama anahtarı (rubric) eklenir.
- **Dışa aktarım:** PDF (pdfmake: başlık bloğu, ad-soyad/numara alanı, iki sütun seçeneği, A/B kitapçık — şık karıştırma) ve Word (`docx`). Cevap anahtarı + barem ayrı sayfa/ayrı dosya.

---

## 7. Online Test ve Analiz

- `startAttempt` → sunucu `deadlineAt` belirler; istemci sayacı yalnızca gösterim içindir, **süre sunucuda doğrulanır**.
- Cevaplar her değişimde (debounce) Firestore'a yazılır → sayfa yenilense/bağlantı kopsa bile devam edilir.
- Arayüz: soru paleti (cevaplandı / boş / işaretli), önceki-sonraki, boş bırak, "Sınavı Bitir" onayı, süre bitince otomatik teslim.
- `submitAttempt` → sunucuda puanlama → sonuç ekranı (doğru/yanlış, doğru cevap, çözüm) + `outcomeStats` güncellemesi.
- **Grafikler (Chart.js):** öğrenci için tema radar grafiği ve kazanım çubuk grafiği (%50 altı kırmızı), öğretmen için sınıf ısı haritası (öğrenci × kazanım) ve madde analizi (soru başına doğru yüzdesi → hatalı/çok zor soru tespiti).

---

## 8. Güvenlik Kuralları (özet)

| Koleksiyon | Öğretmen | Öğrenci |
|---|---|---|
| `curriculum` | okur | okur |
| `questions` | kendi sorusunu yazar; `public/school` olanları okur | **erişemez** (cevaplar burada) |
| `questionUsages` | kendi belgelerini okur, **yazamaz** (yalnız Function) | erişemez |
| `exams` | kendi sınavları | erişemez |
| `assignments` + `publicQuestions` | kendi atamaları | sınıfına atananları okur |
| `attempts` | kendi sınıflarınınkini okur | kendi denemesini okur; `in_progress` iken yalnız `answers/flagged` yazar |
| `outcomeStats` | sınıfındaki öğrencilerinkini okur | kendisininkini okur |
| `reports` | oluşturur; kendi sorularına geleni yönetir | oluşturur |

Rol, Firebase Auth **custom claim** (`request.auth.token.role`) ile kontrol edilir; istemcinin `users` belgesindeki rolü değiştirmesi yetki kazandırmaz.

---

## 9. Yol Haritası

| Adım | Kapsam |
|---|---|
| **1** | Bu belge — mimari, şema, kullanılmış soru mekanizması ✅ |
| **2** | Vite + Tailwind iskeleti, router, rol bazlı giriş ekranları, öğretmen/öğrenci panel düzenleri, havuz ve yazılı oluşturucu arayüzleri (önce sahte veriyle), sürükle-bırak, uyarı modalı, PDF/Word dışa aktarım |
| **3** | Firebase entegrasyonu (Auth, Firestore servis katmanı, kurallar, emülatör), Cloud Functions, Claude ile soru üretimi, `finalizeExam` + `questionUsages` |
| **4** | Online test oynatıcı, `startAttempt/submitAttempt`, kazanım analizi grafikleri, hatalı soru bildirimi ve karantina akışı |
