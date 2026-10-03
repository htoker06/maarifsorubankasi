import { describe, it, expect } from 'vitest';
import { html, raw } from '../src/lib/html.js';
import { normalizeTr } from '../src/lib/format.js';

describe('html şablonu', () => {
  it('kullanıcı verisini kaçışlar (XSS koruması)', () => {
    expect(String(html`<p>${'<img src=x onerror=alert(1)>'}</p>`)).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
  it('iç içe şablonları ve raw değerleri olduğu gibi bırakır', () => {
    expect(String(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`)).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(String(html`${raw('<b>x</b>')}`)).toBe('<b>x</b>');
  });
  it('false/null/undefined değerleri boş yazar', () => {
    expect(String(html`${false}${null}${undefined}${0}`)).toBe('0');
  });
});

describe('normalizeTr', () => {
  it('Türkçe büyük/küçük harf ve aksan duyarsızdır', () => {
    expect(normalizeTr('IŞIK İnce Bağırsak')).toBe(normalizeTr('ışık ince bagirsak'));
  });
});
