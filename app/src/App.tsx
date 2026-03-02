import { useEffect, useMemo, useRef, useState } from "react";

type NoteItem = {
  id: string;
  title: string;
  html: string;
  bg: string;
  fg: string;
  updatedAt: number;
};

const NOTE_BG = [
  { name: "Cinza", value: "#F7F7F7" }, // padrão
  { name: "Creme", value: "#F7E7CD" },
  { name: "Coral", value: "#FAD0C4" },
  { name: "Menta", value: "#D4EFDF" },
  { name: "Névoa", value: "#D6EAF8" },
] as const;

const TEXT_FG = [
  { name: "Chumbo", value: "#333333" }, // padrão
  { name: "Magenta", value: "#C71585" },
  { name: "Azul", value: "#0047AB" },
  { name: "Laranja", value: "#FF8C00" },
  { name: "Verde", value: "#228B22" },
] as const;

const LS_CURRENT = "folha-unica:current";
const LS_HISTORY = "folha-unica:history";

function nowTimeLabel(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function safeTextFromHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").trim();
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function App() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState("");
  const [titleShake, setTitleShake] = useState(false);

  const [bg, setBg] = useState<string>(NOTE_BG[0].value);
  const [fg, setFg] = useState<string>(TEXT_FG[0].value);

  const [savedAt, setSavedAt] = useState<number>(Date.now());
  const [showFormat, setShowFormat] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [history, setHistory] = useState<NoteItem[]>([]);

  // === LOAD ===
  useEffect(() => {
    try {
      const rawH = localStorage.getItem(LS_HISTORY);
      if (rawH) setHistory(JSON.parse(rawH));

      const rawC = localStorage.getItem(LS_CURRENT);
      if (rawC) {
        const cur = JSON.parse(rawC) as NoteItem;
        setTitle(cur.title || "");
        setBg(cur.bg || NOTE_BG[0].value);
        setFg(cur.fg || TEXT_FG[0].value);
        setSavedAt(cur.updatedAt || Date.now());
        queueMicrotask(() => {
          if (editorRef.current) editorRef.current.innerHTML = cur.html || "";
        });
      } else {
        queueMicrotask(() => {
          if (editorRef.current) editorRef.current.innerHTML = "";
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // === SAVE (debounce) ===
  const saveTimer = useRef<number | null>(null);
  const saveCurrent = (force?: boolean) => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML ?? "";

    const cur: NoteItem = {
      id: "current",
      title: title.slice(0, 20),
      html,
      bg,
      fg,
      updatedAt: Date.now(),
    };

    const doSave = () => {
      try {
        localStorage.setItem(LS_CURRENT, JSON.stringify(cur));
        setSavedAt(cur.updatedAt);
      } catch {
        // ignore
      }
    };

    if (force) {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      doSave();
      return;
    }

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(doSave, 350);
  };

  // Save when colors change too
  useEffect(() => {
    saveCurrent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg, fg]);

  const pushToHistory = () => {
    if (!editorRef.current) return;

    const html = editorRef.current.innerHTML ?? "";
    const text = safeTextFromHtml(html);

    // evita salvar “nota vazia”
    if (!title.trim() && !text) {
      // só limpa
      setTitle("");
      editorRef.current.innerHTML = "";
      saveCurrent(true);
      return;
    }

    const item: NoteItem = {
      id: uid(),
      title: (title.trim() || text.slice(0, 20) || "Sem título").slice(0, 20),
      html,
      bg,
      fg,
      updatedAt: Date.now(),
    };

    const next = [item, ...history].slice(0, 200);
    setHistory(next);
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(next));
    } catch {
      // ignore
    }

    // nova nota
    setTitle("");
    editorRef.current.innerHTML = "";
    saveCurrent(true);
  };

  const loadFromHistory = (item: NoteItem) => {
    setTitle(item.title || "");
    setBg(item.bg || NOTE_BG[0].value);
    setFg(item.fg || TEXT_FG[0].value);
    setSavedAt(item.updatedAt || Date.now());
    if (editorRef.current) editorRef.current.innerHTML = item.html || "";
    setShowHistory(false);
    setShowFormat(false);
    saveCurrent(true);
  };

  const clearAll = () => {
    if (!editorRef.current) return;
    setTitle("");
    editorRef.current.innerHTML = "";
    setBg(NOTE_BG[0].value);
    setFg(TEXT_FG[0].value);
    setShowFormat(false);
    setShowHistory(false);
    saveCurrent(true);
  };

  // === Rich Text Commands ===
  const cmd = (command: "bold" | "italic" | "underline") => {
    editorRef.current?.focus();
    document.execCommand(command);
    saveCurrent();
  };

  // === List behavior helpers ===
  const placeCaretAtEnd = (el: HTMLElement) => {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const ensureListFromTypedPrefix = () => {
    const el = editorRef.current;
    if (!el) return;

    // pega texto simples do começo (funciona bem quando está “no começo da linha”)
    const plain = el.innerText.replace(/\r/g, "");
    // se o usuário começou a nota com "* " ou "- " -> cria lista
    if (plain.startsWith("* ") || plain.startsWith("- ")) {
      // remove prefixo e cria UL
      const content = plain.slice(2);
      el.innerHTML = `<ul><li>${content || "<br>"}</li></ul>`;
      placeCaretAtEnd(el);
      return true;
    }
    return false;
  };

  // Tab / Enter list rules
  const lastEnterAt = useRef<number>(0);

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = editorRef.current;
    if (!el) return;

    // atalhos
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        cmd("bold");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        cmd("italic");
        return;
      }
      if (k === "u") {
        e.preventDefault();
        cmd("underline");
        return;
      }
    }

    // Tab indent / outdent (especialmente em lista)
    if (e.key === "Tab") {
      e.preventDefault();
      editorRef.current?.focus();
      document.execCommand(e.shiftKey ? "outdent" : "indent");
      saveCurrent();
      return;
    }

    // Enter duplo sai da lista (sem pular linha extra)
    if (e.key === "Enter") {
      const now = Date.now();
      const isDouble = now - lastEnterAt.current < 450;
      lastEnterAt.current = now;

      // se estiver em lista e for enter duplo => sair
      const sel = window.getSelection();
      const anchor = sel?.anchorNode as Node | null;
      const li = anchor ? (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement)?.closest("li") : null;

      if (li && isDouble) {
        e.preventDefault();
        // encerra lista inserindo parágrafo após ul
        const ul = li.closest("ul");
        if (ul) {
          const p = document.createElement("p");
          p.innerHTML = "<br>";
          ul.insertAdjacentElement("afterend", p);
          // remove li vazio se necessário
          if (li.textContent?.trim() === "") li.remove();
          // se ul ficou vazio, remove
          if (ul.querySelectorAll("li").length === 0) ul.remove();
          placeCaretAtEnd(p);
          saveCurrent();
          return;
        }
      }
    }
  };

  const onEditorInput = () => {
    // converte prefixo em lista se detectado
    const did = ensureListFromTypedPrefix();
    if (!did) saveCurrent();
  };

  // === Title rules (20 chars + shake) ===
  const onTitleChange = (v: string) => {
    if (v.length <= 20) {
      setTitle(v);
      saveCurrent();
      return;
    }
    // excedeu: trava e treme
    setTitleShake(true);
    window.setTimeout(() => setTitleShake(false), 280);
  };

  const topRightMenu = useMemo(() => {
    return (
      <div className="relative flex items-center gap-2">
        {/* ⚙️ */}
        <button
          type="button"
          onClick={() => {
            setShowFormat((s) => !s);
            setShowHistory(false);
          }}
          className="h-9 w-9 rounded-full border border-zinc-200 bg-white/70 backdrop-blur hover:bg-white shadow-sm grid place-items-center"
          title="Formatação"
        >
          <span className="text-[16px]">⚙️</span>
        </button>

        {/* + */}
        <button
          type="button"
          onClick={pushToHistory}
          className="h-9 w-9 rounded-full border border-zinc-200 bg-white/70 backdrop-blur hover:bg-white shadow-sm grid place-items-center"
          title="Nova nota"
        >
          <span className="text-[18px] leading-none">＋</span>
        </button>

        {/* 🕒 */}
        <button
          type="button"
          onClick={() => {
            setShowHistory((s) => !s);
            setShowFormat(false);
          }}
          className="h-9 w-9 rounded-full border border-zinc-200 bg-white/70 backdrop-blur hover:bg-white shadow-sm grid place-items-center"
          title="Histórico"
        >
          <span className="text-[16px]">🕒</span>
        </button>

        {/* Format popover */}
        {showFormat && (
          <div className="absolute right-0 top-11 z-50 w-[360px] rounded-2xl border border-zinc-200 bg-white shadow-xl p-3">
            <div className="text-[12px] text-zinc-500 mb-2">Fundo</div>
            <div className="flex items-center gap-2 mb-3">
              {NOTE_BG.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setBg(c.value)}
                  className="h-8 w-8 rounded-full border border-zinc-200 shadow-sm"
                  style={{
                    background: c.value,
                    outline: c.value === bg ? "2px solid rgba(0,0,0,0.35)" : "none",
                    outlineOffset: "2px",
                  }}
                  title={c.name}
                />
              ))}
            </div>

            <div className="text-[12px] text-zinc-500 mb-2">Texto</div>
            <div className="flex items-center gap-2 mb-3">
              {TEXT_FG.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFg(c.value)}
                  className="h-8 w-8 rounded-full border border-zinc-200 shadow-sm grid place-items-center"
                  style={{
                    background: "#fff",
                    outline: c.value === fg ? "2px solid rgba(0,0,0,0.35)" : "none",
                    outlineOffset: "2px",
                  }}
                  title={c.name}
                >
                  <span style={{ color: c.value, fontWeight: 700 }}>A</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cmd("bold")}
                className="h-9 px-3 rounded-xl border border-zinc-200 hover:bg-zinc-50"
                title="Negrito (Ctrl+B)"
              >
                <b>B</b>
              </button>
              <button
                type="button"
                onClick={() => cmd("italic")}
                className="h-9 px-3 rounded-xl border border-zinc-200 hover:bg-zinc-50"
                title="Itálico (Ctrl+I)"
              >
                <i>I</i>
              </button>
              <button
                type="button"
                onClick={() => cmd("underline")}
                className="h-9 px-3 rounded-xl border border-zinc-200 hover:bg-zinc-50"
                title="Sublinhado (Ctrl+U)"
              >
                <u>U</u>
              </button>

              <div className="ml-auto">
                <button
                  type="button"
                  onClick={clearAll}
                  className="h-9 px-3 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700"
                  title="Limpar"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History popover */}
        {showHistory && (
          <div className="absolute right-0 top-11 z-50 w-[320px] max-h-[360px] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-xl">
            <div className="p-3 border-b border-zinc-100 text-[12px] text-zinc-500">
              Histórico ({history.length})
            </div>

            {history.length === 0 ? (
              <div className="p-4 text-sm text-zinc-500">Sem notas ainda. Clique em “+” para salvar a atual no histórico.</div>
            ) : (
              <div className="p-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadFromHistory(item)}
                    className="w-full text-left p-3 rounded-xl hover:bg-zinc-50 border border-transparent hover:border-zinc-100"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full border border-zinc-200"
                        style={{ background: item.bg }}
                        aria-hidden
                      />
                      <div className="font-medium text-[14px] text-zinc-900 truncate">
                        {item.title || "Sem título"}
                      </div>
                      <div className="ml-auto text-[12px] text-zinc-500">
                        {nowTimeLabel(item.updatedAt)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [bg, fg, history, showFormat, showHistory]);

  return (
    <div className="min-h-screen w-full bg-[#f5f6f7]">
      {/* “mesa” pontilhada suave */}
      <div className="min-h-screen w-full app-dots">
        {/* Folhinha central */}
        <div className="mx-auto max-w-[980px] px-6 pt-10">
          <div
            className="mx-auto w-[360px] rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-zinc-200/80 overflow-hidden"
            style={{ background: bg }}
          >
            {/* Header (semáforo + título + ações) */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-black/5 bg-white/35 backdrop-blur">
              {/* Semáforo */}
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#FF5F57] border border-black/10" />
                <span className="h-3 w-3 rounded-full bg-[#FEBC2E] border border-black/10" />
                <span className="h-3 w-3 rounded-full bg-[#28C840] border border-black/10" />
              </div>

              <div className="flex flex-col">
                <div className="text-[13px] font-semibold text-zinc-900 leading-none">Folha Única</div>
                <div className="text-[11px] text-zinc-600 leading-none mt-1">
                  Salvo às {nowTimeLabel(savedAt)}
                </div>
              </div>

              <div className="ml-auto">{topRightMenu}</div>
            </div>

            {/* Conteúdo */}
            <div className="p-4">
              {/* Título */}
              <div className="mb-3">
                <input
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Título (opcional)…"
                  className={[
                    "w-full rounded-2xl border border-black/10 bg-white/45 backdrop-blur px-4 py-3",
                    "text-[14px] text-zinc-900 placeholder:text-zinc-500 outline-none",
                    titleShake ? "shake" : "",
                  ].join(" ")}
                  maxLength={21} // deixa passar 1 só pra disparar o shake, mas a state limita em 20
                />
                <div className="mt-1 text-[11px] text-zinc-600 flex items-center justify-between">
                  <span>Ctrl+B / Ctrl+I / Ctrl+U</span>
                  <span>{Math.min(title.length, 20)}/20</span>
                </div>
              </div>

              {/* Editor */}
              <div className="rounded-3xl border border-black/10 bg-white/45 backdrop-blur p-3">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={onEditorInput}
                  onKeyDown={onEditorKeyDown}
                  onFocus={() => {
                    setShowHistory(false);
                    // não fecha format automaticamente pra não irritar
                  }}
                  className="min-h-[260px] max-h-[360px] overflow-auto px-2 py-2 outline-none text-[15px] leading-6"
                  style={{ color: fg }}
                  data-placeholder="Escreva aqui… (use * ou - + espaço para lista)"
                />
              </div>

              <div className="mt-3 text-[11px] text-zinc-700">
                Dica: digite <b>*</b> ou <b>-</b> + espaço no início para lista. Tab indenta. Dois Enter saem da lista.
              </div>
            </div>
          </div>

          {/* mini legenda embaixo (opcional) */}
          <div className="text-center text-[12px] text-zinc-500 mt-6">
            Sticky-notes com cara de Apple — autosave e histórico no localStorage.
          </div>
        </div>
      </div>
    </div>
  );
}
