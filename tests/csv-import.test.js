import { describe, it, expect } from 'vitest';
import { parseCsv, parseCurriculumCsv, buildTemplateCsv, curriculumToCsv, slugTr } from '../src/features/curriculum/csv-import.js';

const HEADER = 'sinif;ders;program_yili;tema_sira;tema;kazanim_kodu;kazanim;surec_bilesenleri';

describe('parseCsv', () => {
  it('tırnak içindeki ayraç, satır sonu ve "" kaçışını çözer', () => {
    const { rows } = parseCsv('a;b\r\n"x;y";"satır\nsonu ""alıntı"""\n');
    expect(rows).toEqual([['a', 'b'], ['x;y', 'satır\nsonu "alıntı"']]);
  });
  it('BOM ve virgül ayracını tanır', () => {
    const { rows, delimiter } = parseCsv('﻿sinif,ders\n6,Matematik');
    expect(delimiter).toBe(',');
    expect(rows[1]).toEqual(['6', 'Matematik']);
  });
});

describe('parseCurriculumCsv', () => {
  it('geçerli dosyayı ders, tema ve kazanıma çevirir', () => {
    const csv = [
      HEADER,
      '6;Fen Bilimleri;2024;1;Güneş Sistemi;FB.6.1.1;Gezegenleri sıralar;a) Birinci|b) İkinci',
      '6;Fen Bilimleri;2024;1;Güneş Sistemi;FB.6.1.2;Ay evrelerini açıklar;',
      '6;Fen Bilimleri;2024;2;Vücudumuz;FB.6.2.1;Sindirim sistemini açıklar;',
    ].join('\n');
    const r = parseCurriculumCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.subjects).toEqual([{ id: 'g6-fen-bilimleri', gradeId: 6, name: 'Fen Bilimleri', programYear: 2024 }]);
    expect(r.themes.map((t) => t.id)).toEqual(['g6-fen-bilimleri-t1', 'g6-fen-bilimleri-t2']);
    expect(r.outcomes[0]).toEqual({ code: 'FB.6.1.1', themeId: 'g6-fen-bilimleri-t1', text: 'Gezegenleri sıralar', processComponents: ['a) Birinci', 'b) İkinci'] });
  });

  it('farklı yazılmış başlıkları kabul eder', () => {
    const r = parseCurriculumCsv('Sınıf;Ders Adı;Ünite No;Ünite Adı;Öğrenme Çıktısı Kodu;Öğrenme Çıktısı\n4;Türkçe;1;Erdemler;T.4.1.1;Okur');
    expect(r.errors).toEqual([]);
    expect(r.outcomes).toHaveLength(1);
  });

  it('eksik sütunu bildirir', () => {
    const r = parseCurriculumCsv('sinif;ders\n6;Matematik');
    expect(r.errors[0].message).toContain('Eksik sütun');
  });

  it('satır hatalarını satır numarasıyla bildirir', () => {
    const r = parseCurriculumCsv([HEADER, '13;Matematik;;1;Sayılar;M.1;Metin;', '6;Matematik;;x;Sayılar;M.2;Metin;', '6;Matematik;;1;Sayılar;;Metin;'].join('\n'));
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.outcomes).toHaveLength(0);
  });

  it('aynı temada tekrarlanan kodu ve tutarsız tema adını yakalar', () => {
    const r = parseCurriculumCsv([HEADER, '6;Matematik;;1;Sayılar;M.1;A;', '6;Matematik;;1;Sayılar;M.1;B;', '6;Matematik;;1;Kesirler;M.2;C;'].join('\n'));
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].message).toContain('aynı temada');
    expect(r.errors[1].message).toContain('farklı adlar');
  });

  it('aynı kodun farklı temalarda geçmesine izin verir (ör. Türkçe)', () => {
    const r = parseCurriculumCsv([HEADER, '6;Türkçe;;1;Birinci Tema;T.D.6.1;Dinler;', '6;Türkçe;;2;İkinci Tema;T.D.6.1;Dinler;'].join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.outcomes.map((o) => o.themeId)).toEqual(['g6-turkce-t1', 'g6-turkce-t2']);
  });

  it('örnek (ÖRN.) kodlar için uyarı verir', () => {
    const r = parseCurriculumCsv([HEADER, '6;Matematik;;1;Sayılar;ÖRN.M.1;A;'].join('\n'));
    expect(r.warnings).toHaveLength(1);
  });

  it('şablon ve dışa aktarım aynı biçimde geri okunabilir', () => {
    expect(parseCurriculumCsv(buildTemplateCsv()).errors).toEqual([]);
    const r = parseCurriculumCsv([HEADER, '6;Matematik;2024;1;Sayılar; "x" ;"Virgül, noktalı; virgül";a|b'].join('\n'));
    const again = parseCurriculumCsv(curriculumToCsv(r));
    expect(again.outcomes).toEqual(r.outcomes);
    expect(again.subjects).toEqual(r.subjects);
  });
});

describe('slugTr', () => {
  it('Türkçe ders adlarından kimlik üretir', () => {
    expect(slugTr('Türk Dili ve Edebiyatı')).toBe('turk-dili-ve-edebiyati');
    expect(slugTr('Fen Bilimleri')).toBe('fen-bilimleri');
  });
});
