import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  Packer,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  Footer,
  PageNumber,
} from "docx";
import type { Paper, Asset } from "./models";
import { assetUrl, download } from "./client";

function textParagraphs(text: string) {
  return (text || "")
    .split("\n")
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun(line || " ")],
          spacing: { after: 100, line: 340 },
        }),
    );
}
async function imageRun(asset: Asset): Promise<ImageRun> {
  const response = await fetch(assetUrl(asset));
  if (!response.ok) throw new Error(`无法读取题图「${asset.name}」，请重试。`);
  const blob = await response.blob();
  const imageUrl = URL.createObjectURL(blob);
  const bitmap = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      bitmap.onload = () => resolve();
      bitmap.onerror = () => reject(new Error(`题图「${asset.name}」无法读取，请重新上传图片。`));
      bitmap.src = imageUrl;
    });
  } finally { URL.revokeObjectURL(imageUrl); }
  const scale = Math.min(1, 560 / bitmap.width, 720 / bitmap.height);
  const width = Math.round(bitmap.width * scale),
    height = Math.round(bitmap.height * scale);
  // Normalize all uploaded image formats to PNG so Word and WPS can render them.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器暂不支持题图导出");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (x) => (x ? resolve(x) : reject(new Error("题图转换失败"))),
      "image/png",
    ),
  );
  return new ImageRun({
    type: "png",
    data: new Uint8Array(await png.arrayBuffer()),
    transformation: { width, height },
    altText: { title: "题目图片", description: asset.name, name: asset.name },
  });
}
export async function createPaperDocument(paper: Paper) {
  const children: Paragraph[] = [
    new Paragraph({
      text: "清研 · 专项练习",
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
    }),
    new Paragraph({
      text: paper.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
    }),
    new Paragraph({
      text: `共 ${paper.questions.length} 题　满分 ${paper.points.reduce((a, b) => a + b, 0)} 分`,
      alignment: AlignmentType.CENTER,
      spacing: { after: 250 },
    }),
    new Paragraph({
      text: "姓名：____________　日期：____________　得分：____________",
      alignment: AlignmentType.CENTER,
      spacing: { after: 340 },
    }),
  ];
  if (paper.note) children.push(...textParagraphs(paper.note));
  for (let i = 0; i < paper.questions.length; i++) {
    const q = paper.questions[i];
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${i + 1}. ${q.title}（${paper.points[i]} 分）`,
            bold: true,
          }),
        ],
        spacing: { before: 200, after: 160 },
        keepNext: true,
      }),
    );
    children.push(...textParagraphs(q.question));
    if (q.image)
      children.push(
        new Paragraph({
          children: [await imageRun(q.image)],
          spacing: { after: 160 },
        }),
      );
    for (let j = 0; j < paper.space; j++)
      children.push(
        new Paragraph({ text: " ", spacing: { line: 360, after: 0 } }),
      );
  }
  if (paper.includeAnswers) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        text: "参考答案与解析",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
      }),
    );
    paper.questions.forEach((q, i) => {
      children.push(
        new Paragraph({
          text: `${i + 1}. ${q.title}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 150 },
          keepNext: true,
        }),
        ...textParagraphs(q.answer || "未填写参考答案"),
      );
      if (q.reflection)
        children.push(...textParagraphs(`复盘：${q.reflection}`));
    });
  }
  return new Document({
    creator: "清研",
    title: paper.title,
    description: "错题专项练习",
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: 22, color: "263323" },
          paragraph: { spacing: { line: 340 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          run: { size: 38, bold: true, color: "263323" },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          run: { size: 30, bold: true, color: "263323" },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          run: { size: 24, bold: true, color: "263323" },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "清研 · ", size: 18, color: "889380" }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: "889380",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}
export async function exportDocx(paper: Paper) {
  const doc = await createPaperDocument(paper);
  await download(await Packer.toBlob(doc), `${paper.title}.docx`);
}
