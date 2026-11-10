"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Mistake } from "@/lib/models";
import { generateVariant } from "@/lib/study-tools";
import { AnswerContent } from "./answer-content";
import { Busy, Button } from "./ui";

export function MistakeVariant({ mistake }: { mistake: Mistake }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof generateVariant>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSolution, setShowSolution] = useState(false);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const context = [
        "科目 " + mistake.subject,
        "知识点 " + mistake.topic,
        "原题难度 " + mistake.difficulty,
        mistake.question.trim() || "原题见题图。",
      ].join("\n");
      setResult(await generateVariant(context.slice(0, 20000), mistake.image));
      setShowSolution(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="study-tool ai-stack" aria-label="变式练习">
      <div className="study-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void generate()}>
          {busy ? <Busy /> : <Sparkles size={16} />}
          {busy ? "正在生成…" : result ? "再生成一道" : "AI 生成变式题"}
        </Button>
        <small className="muted">将这道错题发送给 DeepSeek，按账户用量计费。</small>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {result && (
        <div className="ai-answer">
          <h4>变式练习</h4>
          <AnswerContent answer={result.question} />
          <Button type="button" variant="ghost" aria-expanded={showSolution} onClick={() => setShowSolution(!showSolution)}>
            {showSolution ? "收起参考解析" : "做完后查看参考解析"}
          </Button>
          {showSolution && <AnswerContent answer={result.solution} />}
        </div>
      )}
    </section>
  );
}
