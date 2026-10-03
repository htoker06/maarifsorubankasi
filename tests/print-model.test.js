import { describe, it, expect } from 'vitest';
import { fileName } from '../src/features/export/print-model.js';

describe('fileName', () => {
  it('Türkçe karakterleri ASCII yapar, geçersiz karakterleri atar', () => {
    expect(fileName({ title: '6-A Matematik 1. Dönem: Yazılı / Şube Ğ' }, '.pdf')).toBe('6-A_Matematik_1._Donem_Yazili_Sube_G.pdf');
  });
  it('boş başlıkta varsayılan ad kullanır', () => {
    expect(fileName({ title: '???' }, '.docx')).toBe('sinav.docx');
  });
});
