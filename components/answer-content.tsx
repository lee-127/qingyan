import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const sectionLabel = /^[ \t]{0,3}\*\*(题目|考点|推导步骤|解题步骤|最终答案|答案)[：:]?\*\*[ \t]*$/gm;
const codeSpanOrFence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[ \t]*$|(?![\s\S]))|(`+)[^\n]*?\2/gm;

function normalizeText(text: string) {
  return text
    .replace(sectionLabel, "### $1")
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_, math: string) => `$${math.trim()}$`);
}

function normalizeAnswer(answer: string) {
  let result = "", start = 0;
  for (const match of answer.matchAll(codeSpanOrFence)) {
    result += normalizeText(answer.slice(start, match.index)) + match[0];
    start = match.index + match[0].length;
  }
  return result + normalizeText(answer.slice(start));
}

export function AnswerContent({ answer }: { answer: string }) {
  return (
    <div className="answer-content">
      <Markdown
        skipHtml
        disallowedElements={["a", "img"]}
        unwrapDisallowed
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { output: "mathml", trust: false, strict: "ignore", maxSize: 20, maxExpand: 200 }]]}
      >
        {normalizeAnswer(answer)}
      </Markdown>
    </div>
  );
}
