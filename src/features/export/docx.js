// Word (.docx) çıktısı. Öğretmen dosyayı Word'de açıp istediği gibi düzenleyebilir.
import {
  AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { buildPrintModel, downloadBlob, fileName } from './print-model.js';

const FONT = 'Calibri';
const p = (text, opts = {}) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 80, before: opts.before ?? 0 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 22, font: FONT, color: opts.color })],
  });

const cell = (children, width) =>
  new TableCell({ children: Array.isArray(children) ? children : [children], width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined });

function headerParagraphs(m) {
  return [
    ...m.headerLines.map((line) => p(line, { bold: true, align: AlignmentType.CENTER, size: 24, after: 40 })),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [cell(p('Adı Soyadı:', { after: 120, before: 120 }), 40), cell(p('Sınıfı / No:', { after: 120, before: 120 }), 35), cell(p('Puan:', { after: 120, before: 120 }), 25)] })],
    }),
    p(`Tarih: ${m.date}${m.durationMin ? `    Süre: ${m.durationMin} dakika` : ''}    Toplam: ${m.total} puan`, { size: 18, before: 120 }),
    ...(m.instructions ? [p(m.instructions, { italics: true, size: 18 })] : []),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } }, spacing: { after: 200 } }),
  ];
}

function questionParagraphs(r) {
  const out = [];
  if (r.context) out.push(p(r.context, { italics: true, indent: 360, size: 20 }));
  out.push(
    new Paragraph({
      spacing: { before: 160, after: 80 },
      keepNext: true,
      children: [
        new TextRun({ text: `${r.no}. `, bold: true, font: FONT, size: 22 }),
        new TextRun({ text: r.stem, font: FONT, size: 22 }),
        new TextRun({ text: `  (${r.points} puan)`, font: FONT, size: 18, color: '666666' }),
      ],
    }),
  );
  r.options?.forEach((o) => out.push(p(o, { indent: 480, after: 40 })));
  if (r.type === 'true_false') out.push(p('(   ) Doğru        (   ) Yanlış', { indent: 480 }));
  if (r.matching) {
    const rows = Math.max(r.matching.left.length, r.matching.right.length);
    out.push(
      new Table({
        width: { size: 90, type: WidthType.PERCENTAGE },
        rows: Array.from({ length: rows }, (_, i) =>
          new TableRow({
            children: [
              cell(p(r.matching.left[i] ? `${i + 1}. ${r.matching.left[i]}   ……` : ''), 50),
              cell(p(r.matching.right[i] ? `${r.matching.right[i].letter}) ${r.matching.right[i].text}` : ''), 50),
            ],
          }),
        ),
      }),
    );
  }
  if (r.type === 'open_ended') {
    for (let i = 0; i < 5; i++) out.push(new Paragraph({ border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: 'AAAAAA', space: 1 } }, spacing: { after: 240 } }));
  }
  return out;
}

function examChildren(m) {
  return [
    ...headerParagraphs(m),
    ...m.sections.flatMap((s) => [...(m.showSectionTitles ? [p(s.title, { bold: true, before: 200 })] : []), ...s.rows.flatMap(questionParagraphs)]),
    p('Başarılar dileriz.', { italics: true, align: AlignmentType.RIGHT, before: 240, size: 18 }),
  ];
}

function answerKeyChildren(m) {
  return [
    p(`${m.title} — Cevap Anahtarı ve Puanlama Baremi`, { bold: true, size: 26, after: 200 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [cell(p('No', { bold: true }), 8), cell(p('Cevap / Ölçütler', { bold: true }), 80), cell(p('Puan', { bold: true }), 12)] }),
        ...m.answerKey.map(
          (row) =>
            new TableRow({
              children: [
                cell(p(String(row.no), { bold: true }), 8),
                cell([
                  p(row.answer),
                  ...(row.rubric ?? []).map((c) => p(`• ${c.criterion}: ${c.points} p`, { size: 18 })),
                  ...(row.solution ? [p(`Çözüm: ${row.solution}`, { size: 16, color: '666666' })] : []),
                ], 80),
                cell(p(String(row.points)), 12),
              ],
            }),
        ),
        new TableRow({ children: [cell(p(''), 8), cell(p('Toplam', { bold: true, align: AlignmentType.RIGHT }), 80), cell(p(String(m.total), { bold: true }), 12)] }),
      ],
    }),
  ];
}

export async function exportExam({ exam, questionsById, lookup, variant }) {
  const m = buildPrintModel({ exam, questionsById, lookup });
  const doc = new Document({
    creator: 'SoruBankasıMatik',
    title: m.title,
    sections: [
      {
        properties: { page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, font: FONT })] })],
          }),
        },
        children: variant === 'key' ? answerKeyChildren(m) : examChildren(m),
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, fileName(exam, variant === 'key' ? '_cevap_anahtari.docx' : '.docx'));
}
