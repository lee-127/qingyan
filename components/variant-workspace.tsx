"use client";
import type { Entry, Mistake } from "@/lib/models";
import { assetUrl } from "@/lib/client";
import { AnswerContent } from "./answer-content";
import { MistakeVariant } from "./mistake-variant";
import { Button, Field, Select } from "./ui";

export function VariantWorkspace({ mistakes, selectedId, onSelect, onSettings }: {
  mistakes: Entry<Mistake>[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSettings: () => void;
}) {
  const selected = mistakes.find(mistake => mistake.id === selectedId);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRACTICE WITH DEEPSEEK</span>
          <h1>AI 变式练习</h1>
          <p>选一道已归档的错题，练习相同考点的新题目。</p>
        </div>
      </div>
      <div className="variant-workspace panel">
        <div className="settings-content ai-stack">
          <Field label="选择原错题">
            <Select value={selected?.id || ""} onChange={event => onSelect(event.target.value)}
              options={[{ value: "", label: "请选择一道错题" }, ...mistakes.map(mistake => ({
                value: mistake.id, label: mistake.subject + " · " + mistake.title,
              }))]} />
          </Field>
          {selected ? (
            <>
              <details className="answer-details">
                <summary>查看原题 · {selected.topic}</summary>
                <AnswerContent answer={selected.question} />
                {selected.image && <img className="question-image" src={assetUrl(selected.image)} alt="变式练习的原题" />}
              </details>
              <MistakeVariant key={selected.id} mistake={selected} />
            </>
          ) : (
            <p className="muted">{mistakes.length ? "选择原题后，可以生成变式题并查看参考解析。" : "先在错题本录入一道题，再到这里生成变式练习。"}</p>
          )}
          <Button type="button" variant="ghost" onClick={onSettings}>DeepSeek 设置</Button>
        </div>
      </div>
    </>
  );
}
