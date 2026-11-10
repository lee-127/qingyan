"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Asset } from "@/lib/models";
import { aiConfigured, setAIKey, solveProblem } from "@/lib/study-tools";
import { Busy, Button, Field } from "./ui";
import { AnswerContent } from "./answer-content";

export function DeepSeekSettings() {
  const [configured, setConfigured] = useState<boolean>();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    aiConfigured().then(setConfigured).catch(error => setMessage(error.message));
  }, []);
  async function save(next: string) {
    setBusy(true);
    setMessage("");
    try {
      await setAIKey(next);
      setKey("");
      setConfigured(!!next);
      setMessage(next ? "API Key 已保存到本机钥匙串。" : "API Key 已移除。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading"><h2>DeepSeek 解题</h2><Sparkles size={18} /></div>
      <div className="settings-content ai-stack">
        <p>纯文本使用 V4 Pro，含题图使用 Flash。密钥仅保存在本机钥匙串。</p>
        <Field label={configured ? "更新 API Key" : "DeepSeek API Key"}>
          <input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={key} maxLength={512} placeholder={configured ? "已配置" : "输入你的 DeepSeek API Key"}
            onChange={event => setKey(event.target.value)} />
        </Field>
        <div className="study-actions">
          <Button type="button" disabled={busy || !key.trim()} onClick={() => void save(key.trim())}>保存密钥</Button>
          {configured && <Button type="button" variant="secondary" disabled={busy} onClick={() => void save("")}>移除密钥</Button>}
        </div>
        {message && <small role="status">{message}</small>}
      </div>
    </section>
  );
}

export function AISolver({ question, image, onUse, photoSearch = false, blocked = false }: {
  question: string;
  image?: File | Asset;
  onUse?: (answer: string) => void;
  photoSearch?: boolean;
  blocked?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof solveProblem>>>();
  const [error, setError] = useState("");
  const [solvedInput, setSolvedInput] = useState<{ question: string; image?: File | Asset }>();
  const currentResult = solvedInput?.question === question && solvedInput.image === image ? result : undefined;
  async function solve(continuing = false) {
    setPending(true);
    setError("");
    const previous = continuing ? completeParagraphs(currentResult?.answer ?? "") : undefined;
    if (!continuing) setResult(undefined);
    try {
      const next = await solveProblem(question.trim(), image, previous);
      if (continuing && !next.answer) throw new Error("这次没有生成新的解析，可继续重试或按小问解答。");
      setResult({ ...next, answer: [previous, next.answer].filter(Boolean).join("\n\n") });
      setSolvedInput({ question, image });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="study-tool ai-stack">
      <div className="study-actions">
        <Button type="button" variant={photoSearch ? "primary" : "secondary"}
          disabled={pending || blocked || (!image && (photoSearch || !question.trim()))} onClick={() => void solve()}>
          {pending ? <Busy /> : <Sparkles size={16} />} {pending ? "正在解题…" : photoSearch ? "开始搜题" : "用 DeepSeek 解题"}
        </Button>
        <small className="muted">{photoSearch ? "点击后将题图和补充说明发送给 DeepSeek，按账户用量计费。" : "点击后将题干和题图发送给 DeepSeek，按账户用量计费。"}</small>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {currentResult && (
        <>
          <div className="study-actions ai-result-heading">
            <small className="muted">{currentResult.model}{currentResult.truncated ? " · 解析已达到输出上限" : ""}</small>
            {onUse && currentResult.answer && (
              <Button type="button" variant="secondary" onClick={() => onUse(currentResult.answer.slice(0, 20000))}>
                {currentResult.answer.length > 20000 ? "填入前 2 万字" : "填入参考答案"}
              </Button>
            )}
          </div>
          {currentResult.answer && <div className="ai-answer"><AnswerContent answer={currentResult.answer} /></div>}
          {currentResult.truncated && (
            <div className="study-actions">
              <Button type="button" variant="secondary" disabled={pending || blocked} onClick={() => void solve(true)}>
                {pending ? "正在继续…" : "继续生成"}
              </Button>
              <small className="muted">从最近的完整段落接着解答。</small>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function completeParagraphs(answer: string) {
  const lines = answer.trimEnd().split(/\r?\n/);
  let end = 0;
  let closing = "";
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    if (closing) {
      if (text.startsWith(closing)) closing = "";
    } else if (!text) {
      end = index;
    } else if (text.startsWith("\\[") && !text.endsWith("\\]")) {
      closing = "\\]";
    } else if (text.startsWith("$$") && (text === "$$" || !text.endsWith("$$"))) {
      closing = "$$";
    } else if (text.startsWith("~~~")) {
      closing = "~~~";
    } else if (text.startsWith("\x60\x60\x60")) {
      closing = "\x60\x60\x60";
    }
  }
  return lines.slice(0, end).join("\n").trimEnd();
}
