import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUnitPage, parseUnitTitle, cleanSubjectName, contentToLines, splitInlineComponents } from '../scripts/lib/meb-parse.mjs';

const html = readFileSync(new URL('./fixtures/meb-unite-fen6-1.html', import.meta.url), 'utf8');

describe('parseUnitPage (tymm.meb.gov.tr ünite sayfası)', () => {
  const { outcomes, meta } = parseUnitPage(html);

  it('öğrenme çıktılarını kod, metin ve süreç bileşenleriyle çıkarır', () => {
    expect(outcomes.map((o) => o.code)).toEqual(['FB.6.1.1', 'FB.6.1.2', 'FB.6.1.3', 'FB.6.1.4']);
    expect(outcomes[0].text).toBe('Güneş sistemindeki gezegenleri niteliklerine göre sınıflandırabilme');
    expect(outcomes[0].components).toHaveLength(4);
    expect(outcomes[0].components[3]).toMatch(/^ç\) /);
  });

  it('ünitenin Maarif Modeli bileşenlerini okur, menüdeki aynı adlı bağlantılara takılmaz', () => {
    expect(meta.hours).toBe(12);
    expect(meta.fieldSkills[0]).toBe('FBAB2. Sınıflandırma');
    expect(meta.values).toContain('D16. Sorumluluk');
    expect(meta.content).toEqual(['Güneş Sistemi', 'Güneş ve Ay Tutulmaları']);
  });
});

describe('yardımcılar', () => {
  it('ünite başlığından sıra ve ad çıkarır', () => {
    expect(parseUnitTitle('1. Ünite: Güneş Sistemi Ve Tutulmalar')).toEqual({ order: 1, name: 'Güneş Sistemi ve Tutulmalar' });
    expect(parseUnitTitle('3. Tema: Millî Kültürümüz').order).toBe(3);
  });
  it('ders adını sadeleştirir', () => {
    expect(cleanSubjectName('Ortaokul Matematik Dersi')).toBe('Matematik');
    expect(cleanSubjectName('Fen Bilimleri Dersi')).toBe('Fen Bilimleri');
    expect(cleanSubjectName('Yaşayan Dil ve Lehçeler Dersi (Lazca)')).toBe('Yaşayan Dil ve Lehçeler (Lazca)');
    expect(cleanSubjectName('İnsan Hakları,Vatandaşlık Ve Demokrasi Dersi')).toBe('İnsan Hakları, Vatandaşlık ve Demokrasi');
  });
  it('satır içi etiketleri satır sonu saymaz', () => {
    expect(contentToLines('<p><strong>KOD.1.</strong> metin <em>devam</em><br>a) bir</p>')).toEqual(['KOD.1. metin devam', 'a) bir']);
  });
});

describe('alt başlıklı ve farklı kod biçimli programlar (Türk Dili ve Edebiyatı)', () => {
  const tde = readFileSync(new URL('./fixtures/meb-unite-tde9-1.html', import.meta.url), 'utf8');
  const { outcomes } = parseUnitPage(tde);

  it('TDE1.1 biçimindeki kodları okur, alt başlıkları kazanım metnine eklemez', () => {
    expect(outcomes.map((o) => o.code)).toEqual(['TDE1.1', 'TDE1.2', 'TDE2.1', 'TDE2.2', 'TDE3.1', 'TDE3.2', 'TDE3.3', 'TDE3.4', 'TDE4.1', 'TDE4.2', 'TDE4.3', 'TDE4.4']);
    expect(outcomes[1].text).toBe('“Sözün İnceliği” temasında ele alınan metinlerde anlam oluşturabilme');
  });
});

describe('kaynakta boşluklu yazılmış kodlar', () => {
  it('MAT. 1.3.3. ve TT 7.9.1. biçimlerini standart koda çevirir', () => {
    const page = `<div class="col-md-3 bg-light p-2 title">Öğrenme Çıktıları ve Süreç Bileşenleri</div><div class="col-md-9 p-2 content"><p>MAT. 1.3.3. Nesneleri ayırt edebilme<br>a) Belirler.<br>TT 7.9.1. Yapay zekâyı sorgulayabilme</p></div>`;
    expect(parseUnitPage(page).outcomes.map((o) => o.code)).toEqual(['MAT.1.3.3', 'TT.7.9.1']);
  });
});

describe('splitInlineComponents', () => {
  it('aynı satırdaki süreç bileşenlerini ayırır', () => {
    expect(splitInlineComponents('Pupils can reorganise information. a) Pupils use it. b) Pupils share it.')).toEqual(['Pupils can reorganise information.', 'a) Pupils use it.', 'b) Pupils share it.']);
  });
  it('alfabetik sıra bozuksa ya da a) ile başlamıyorsa bölmez', () => {
    expect(splitInlineComponents('Metin c) burada geçiyor')).toEqual(['Metin c) burada geçiyor']);
    expect(splitInlineComponents('Metin b) bir a) iki')).toEqual(['Metin b) bir a) iki']);
  });
  it('yalnızca bileşenlerden oluşan satırı da böler', () => {
    expect(splitInlineComponents('a) Bir. b) İki.')).toEqual(['a) Bir.', 'b) İki.']);
  });
});
