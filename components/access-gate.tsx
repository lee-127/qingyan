"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Link2, ShieldCheck } from "lucide-react";
import Workspace from "@/app/workspace";
import { Button, Busy } from "./ui";
export default function AccessGate() {
  const [state, setState] = useState<"checking" | "ready" | "locked">(
    "checking",
  );
  const [message, setMessage] = useState("");
  const started = useRef(false);
  async function initialize() {
    setState("checking");
    try {
      const fragment = new URLSearchParams(location.hash.slice(1));
      const key = fragment.get("access");
      if (key)
        history.replaceState(null, "", location.pathname + location.search);
      const response = await fetch(
        "/api/v1/access",
        key
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key }),
            }
          : { cache: "no-store" },
      );
      const result = (await response.json()) as {
        authorized?: boolean;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "连接暂时不可用，请稍后重试。");
      if (!result.authorized) {
        setMessage("");
        setState("locked");
        return;
      }
      setState("ready");
    } catch (e) {
      setMessage((e as Error).message);
      setState("locked");
    }
  }
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void initialize();
    }
    const onHash = () => {
      if (new URLSearchParams(location.hash.slice(1)).has("access"))
        void initialize();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (state === "ready") return <Workspace />;
  return (
    <main className="access-page">
      <section className="access-card">
        <span className="brand-mark">
          <BookOpen size={28} />
        </span>
        <span className="eyebrow">QINGYAN · YOUR STUDY SPACE</span>
        <h1>
          {state === "checking"
            ? "正在打开你的复习空间"
            : "从专属入口，继续积累"}
        </h1>
        {state === "checking" ? (
          <>
            <Busy />
            <p>免登录进入，资料与错题依然妥善保存。</p>
          </>
        ) : (
          <>
            <p>
              请点击桌面的「清研考研复习」快捷方式，
              <br />
              或使用你的专属链接进入，无需注册或登录。
            </p>
            {message && (
              <div role="alert" className="form-error">
                {message}
              </div>
            )}
            <Button variant="secondary" onClick={initialize}>
              <Link2 size={16} />
              重新检查访问权限
            </Button>
            <small>
              <ShieldCheck size={14} />
              只有持有专属入口的人，才能访问你的记录。
            </small>
          </>
        )}
      </section>
    </main>
  );
}
