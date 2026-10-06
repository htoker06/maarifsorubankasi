export const SCHOOL_LEVELS = {
  ilkokul: { label: 'İlkokul', grades: [1, 2, 3, 4] },
  ortaokul: { label: 'Ortaokul', grades: [5, 6, 7, 8] },
  lise: { label: 'Lise', grades: [9, 10, 11, 12] },
};

export const levelOfGrade = (grade) =>
  Object.keys(SCHOOL_LEVELS).find((key) => SCHOOL_LEVELS[key].grades.includes(Number(grade)));

export const QUESTION_TYPES = {
  multiple_choice: { label: 'Çoktan Seçmeli', short: 'ÇS', icon: '◉' },
  true_false: { label: 'Doğru / Yanlış', short: 'D/Y', icon: '✓✗' },
  fill_blank: { label: 'Boşluk Doldurma', short: 'BD', icon: '___' },
  matching: { label: 'Eşleştirme', short: 'EŞ', icon: '⇄' },
  open_ended: { label: 'Açık Uçlu', short: 'AU', icon: '✎' },
};

export const DIFFICULTIES = {
  kolay: { label: 'Kolay', color: 'emerald' },
  orta: { label: 'Orta', color: 'amber' },
  zor: { label: 'Zor', color: 'rose' },
};

export const BLOOM_LEVELS = {
  hatirlama: { label: 'Hatırlama', order: 1, defaultDifficulty: 'kolay' },
  anlama: { label: 'Anlama', order: 2, defaultDifficulty: 'kolay' },
  uygulama: { label: 'Uygulama', order: 3, defaultDifficulty: 'orta' },
  analiz: { label: 'Analiz', order: 4, defaultDifficulty: 'orta' },
  degerlendirme: { label: 'Değerlendirme', order: 5, defaultDifficulty: 'zor' },
  sentez: { label: 'Sentez/Yaratma', order: 6, defaultDifficulty: 'zor' },
};

export const QUESTION_STATUSES = {
  draft: { label: 'Taslak', color: 'slate' },
  active: { label: 'Aktif', color: 'emerald' },
  quarantined: { label: 'Karantinada', color: 'rose' },
  archived: { label: 'Arşivde', color: 'zinc' },
};

export const EXAM_KINDS = {
  written: { label: 'Yazılı Sınav' },
  scan_unit: { label: 'Ünite Tarama Testi' },
  scan_topic: { label: 'Konu Tarama Testi' },
  scan_general: { label: 'Genel Tarama Testi' },
  online_trial: { label: 'Online Deneme' },
};

export const EXAM_STATUSES = {
  draft: { label: 'Taslak', color: 'slate' },
  finalized: { label: 'Kesinleşti', color: 'indigo' },
  archived: { label: 'Arşivde', color: 'zinc' },
};

/** Türkiye Yüzyılı Maarif Modeli beceri çerçevesi (etiketleme için seçenekler). */
export const MAARIF_DIMENSIONS = {
  conceptual: {
    label: 'Kavramsal Beceriler',
    options: ['Karşılaştırma', 'Sınıflandırma', 'Çıkarım yapma', 'Sorgulama', 'Yorumlama', 'Problem çözme', 'Karar verme', 'Eleştirel düşünme', 'Yaratıcı düşünme', 'Gözlemleme', 'Tahmin etme', 'Özetleme'],
  },
  sel: {
    label: 'Sosyal-Duygusal Öğrenme',
    options: ['Öz farkındalık', 'Öz düzenleme', 'Öz yansıtma', 'İletişim', 'İş birliği', 'Sosyal farkındalık', 'Uyum', 'Esneklik', 'Sorumlu karar verme'],
  },
  values: {
    label: 'Değerler',
    options: ['Adalet', 'Aile bütünlüğü', 'Arkadaşlık', 'Bağımsızlık', 'Çalışkanlık', 'Duyarlılık', 'Dürüstlük', 'Estetik', 'Mahremiyet', 'Merhamet', 'Mütevazılık', 'Özgürlük', 'Sabır', 'Sağlıklı yaşam', 'Saygı', 'Sevgi', 'Sorumluluk', 'Tasarruf', 'Vatanseverlik', 'Yardımseverlik'],
  },
  literacies: {
    label: 'Okuryazarlık Becerileri',
    options: ['Bilgi okuryazarlığı', 'Dijital okuryazarlık', 'Finansal okuryazarlık', 'Görsel okuryazarlık', 'Kültürel okuryazarlık', 'Vatandaşlık okuryazarlığı', 'Veri okuryazarlığı', 'Sürdürülebilirlik okuryazarlığı', 'Sanat okuryazarlığı'],
  },
};

/** İlkokulda 3, ortaokul ve lisede 4 şık (lise için 5 şık seçilebilir). */
export const optionCountForGrade = (grade) => (Number(grade) <= 4 ? 3 : 4);

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Öğrenme çıktısı kimliği. Resmî programlarda aynı kod birden fazla temada geçebilir
 * (ör. Türkçe'de beceriler temalar boyunca tekrarlanır), bu yüzden benzersiz olan tema + kod ikilisidir.
 */
export const outcomeKey = (themeId, code) => `${themeId}|${code}`;
