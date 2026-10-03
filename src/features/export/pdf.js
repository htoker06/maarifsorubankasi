// PDF çıktısı (pdfmake). Roboto fontu Türkçe karakterleri (ç, ğ, ı, İ, ö, ş, ü) destekler.
import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import { buildPrintModel, fileName } from './print-model.js';

pdfMake.addVirtualFileSystem(vfs);
pdfMake.addFonts({
  Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
});

function headerBlock(m) {
  return [
    ...m.headerLines.map((line, i) => ({ text: line, alignment: 'center', bold: true, fontSize: i === m.headerLines.length - 1 ? 12 : 11, margin: [0, 0, 0, 2] })),
    {
      margin: [0, 8, 0, 6],
      table: {
        widths: ['*', '*', 'auto'],
        body: [[
          { text: 'Adı Soyadı:', margin: [0, 6, 0, 6] },
          { text: 'Sınıfı / No:', margin: [0, 6, 0, 6] },
          { text: 'Puan:            ', margin: [0, 6, 0, 6] },
        ]],
      },
    },
    {
      columns: [
        { text: `Tarih: ${m.date}`, fontSize: 9 },
        { text: m.durationMin ? `Süre: ${m.durationMin} dakika` : '', alignment: 'center', fontSize: 9 },
        { text: `Toplam: ${m.total} puan`, alignment: 'right', fontSize: 9 },
      ],
      margin: [0, 0, 0, 4],
    },
    m.instructions ? { text: m.instructions, italics: true, fontSize: 9, margin: [0, 0, 0, 8] } : null,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8 }], margin: [0, 0, 0, 10] },
  ].filter(Boolean);
}

function questionBlock(r) {
  const block = [];
  if (r.context) block.push({ text: r.context, italics: true, fontSize: 10, margin: [16, 0, 0, 4] });
  block.push({
    columns: [
      { text: `${r.no}.`, width: 18, bold: true },
      { text: r.stem, width: '*' },
      { text: `(${r.points} p)`, width: 'auto', fontSize: 9, color: '#555', noWrap: true },
    ],
    columnGap: 4,
  });
  if (r.options) {
    const twoCol = r.options.every((o) => o.length <= 38);
    block.push(
      twoCol
        ? { columns: [r.options.filter((_, i) => i % 2 === 0), r.options.filter((_, i) => i % 2 === 1)].map((col) => ({ stack: col, width: '*' })), margin: [22, 4, 0, 0] }
        : { stack: r.options, margin: [22, 4, 0, 0] },
    );
  }
  if (r.type === 'true_false') block.push({ text: '(   ) Doğru        (   ) Yanlış', margin: [22, 4, 0, 0] });
  if (r.matching) {
    block.push({
      columns: [
        { stack: r.matching.left.map((l, i) => `${i + 1}. ${l}   ……`), width: '*' },
        { stack: r.matching.right.map((x) => `${x.letter}) ${x.text}`), width: '*' },
      ],
      margin: [22, 4, 0, 0],
    });
  }
  if (r.type === 'open_ended') {
    block.push({ canvas: Array.from({ length: 5 }, (_, i) => ({ type: 'line', x1: 22, y1: 18 + i * 20, x2: 515, y2: 18 + i * 20, lineWidth: 0.3, lineColor: '#bbb' })), margin: [0, 0, 0, 6] });
  }
  return { stack: block, margin: [0, 0, 0, 12], unbreakable: true };
}

function examContent(m) {
  return [
    ...headerBlock(m),
    ...m.sections.flatMap((s) => [m.showSectionTitles ? { text: s.title, bold: true, fontSize: 11, margin: [0, 4, 0, 6] } : null, ...s.rows.map(questionBlock)].filter(Boolean)),
    { text: 'Başarılar dileriz.', alignment: 'right', italics: true, fontSize: 9, margin: [0, 12, 0, 0] },
  ];
}

function answerKeyContent(m) {
  return [
    { text: `${m.title} — Cevap Anahtarı ve Puanlama Baremi`, bold: true, fontSize: 13, margin: [0, 0, 0, 10] },
    {
      table: {
        headerRows: 1,
        widths: [24, '*', 40],
        body: [
          [{ text: 'No', bold: true }, { text: 'Cevap / Ölçütler', bold: true }, { text: 'Puan', bold: true, alignment: 'right' }],
          ...m.answerKey.map((row) => [
            { text: String(row.no), bold: true },
            {
              stack: [
                { text: row.answer },
                ...(row.rubric ?? []).map((c) => ({ text: `• ${c.criterion}: ${c.points} p`, fontSize: 9, color: '#444' })),
                row.solution ? { text: `Çözüm: ${row.solution}`, fontSize: 8, color: '#666', margin: [0, 2, 0, 0] } : null,
              ].filter(Boolean),
            },
            { text: String(row.points), alignment: 'right' },
          ]),
          [{ text: '' }, { text: 'Toplam', bold: true, alignment: 'right' }, { text: String(m.total), bold: true, alignment: 'right' }],
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
}

export async function exportExam({ exam, questionsById, lookup, variant }) {
  const m = buildPrintModel({ exam, questionsById, lookup });
  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.2 },
    info: { title: m.title, creator: 'SoruBankasıMatik' },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'center', fontSize: 8, color: '#888', margin: [0, 20, 0, 0] }),
    content: variant === 'key' ? answerKeyContent(m) : examContent(m),
  };
  await pdfMake.createPdf(doc).download(fileName(exam, variant === 'key' ? '_cevap_anahtari.pdf' : '.pdf'));
}
