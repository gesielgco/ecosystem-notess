import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Clock, Plus, Settings2, Bold, Italic, Underline } from "lucide-react";

type NoteSnapshot = {
  id: string;
  title: string;
  html: string;
  bg: string;
  color: string;
  updatedAt: number;
};

const STORAGE_CURRENT = "folhaUnica.current.v1";
const STORAGE_HISTORY = "folhaUnica.history.v1";

const BG_COLORS = [
  { name: "Padrão", value: "#F7F7F7" },
  { name: "Creme", value: "#F7E7CD" },
  { name: "Coral", value: "#FAD0C4" },
  { name: "Menta", value: "#D4EFDF" },
  { name: "Névoa", value: "#D6EAF8" },
] as const;

const TEXT_COLORS = [
  { name: "Chumbo", value: "#333333" },
  { name: "Rosa Escuro", value: "#C71585" },
  { name: "Azul", value: "#0047AB" },
  { name: "Laranja", value: "#FF8C00" },
  { name: "Verde", value: "#228B22" },
] as const;

function nowTimeLabel(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function clampTitle(raw: string) {
  return raw.slice(0, 20);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [title, setTitle] = useState<string>("");
  const [bg, setBg] = useState<string>(BG_COLORS[0].value);
  const [color, setColor] = useState<string>(TEXT_COLORS[0].value);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [history, setHistory] = useState<NoteSnapshot[]>([]);

  const [shake, setShake] = useState(false);

  // --- Load on mount
  useEffect(() => {
    try {
      const hRaw = localStorage.getItem(STORAGE_HISTORY);
      if (hRaw) setHistory(JSON.parse(hRaw) as NoteSnapshot[]);
    } catch {}

    try {
      const raw = localStorage.getItem(STORAGE_CURRENT);
      if (!raw) return;
      const cur = JSON.parse(raw) as NoteSnapshot;

      setTitle(cur.title ?? "");
      setBg(cur.bg ?? BG_COLORS[0].value);
      setColor(cur.color ?? TEXT_COLORS[0].value);
      setUpdatedAt(cur.updatedAt ?? Date.now());

      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = cur.html ?? "";
        }
      });
    } catch {}
  }, []);

  // --- Autosave current (debounced)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? "";
      const snap: NoteSnapshot = {
        id: "current",
        title,
        html,
        bg,
        color,
        updatedAt,
      };
      try {
        localStorage.setItem(STORAGE_CURRENT, JSON.stringify(snap));
      } catch {}
    }, 200);

    return () => window.clearTimeout(t);
  }, [title, bg, color, updatedAt]);

  // Helper: persist history list
  const persistHistory = (items: NoteSnapshot[]) => {
    setHistory(items);
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(items));
    } catch {}
  };

  const currentPreview = useMemo(() => {
    const t = title.trim();
    return t.length ? t : "Sem Título";
  }, [title]);

  // --- Formatting helpers (execCommand: simples e funciona bem pra B/I/U)
  const applyCmd = (cmd: "bold" | "italic" | "underline") => {
    editorRef.current?.focus();
    document.execCommand(cmd);
    setUpdatedAt(Date.now());
  };

  const isInList = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node: Node | null = sel.anchorNode;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "LI") return true;
      }
      node = node.parentNode;
    }
    return false;
  };

  const getClosestLI = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "LI") return el;
      }
      node = node.parentNode;
    }
    return null;
  };

  const handleTitleChange = (v: string) => {
    if (v.length <= 20) {
      setTitle(v);
      return;
    }
    // excedeu: trava e dá shake
    setTitle(clampTitle(v));
    setShake(true);
    window.setTimeout(() => setShake(false), 260);
  };

  // Converter "* " ou "- " em lista quando aperta ESPAÇO no começo da linha
  const tryConvertToList = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;

    // pega texto do "bloco atual" (bem simples)
    let el: Node | null = container;
    while (el && el !== editorRef.current && el.parentNode) {
      if (el.nodeType === Node.ELEMENT_NODE) {
        const ht = el as HTMLElement;
        if (ht.tagName === "DIV" || ht.tagName === "P") break;
      }
      el = el.parentNode;
    }

    // fallback: editor direto
    const block = (el && el.nodeType === Node.ELEMENT_NODE ? (el as HTMLElement) : editorRef.current) as HTMLElement | null;
    if (!block) return;

    const text = (block.textContent ?? "").replace(/\u00A0/g, " "); // nbsp
    // se o usuário acabou de digitar "* " ou "- " no começo
    if (text === "*" || text === "-" || text === "* " || text === "- ") {
      // remove marcador e cria lista
      block.textContent = "";
      document.execCommand("insertUnorderedList");
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // atalhos: Ctrl/Cmd + B/I/U
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      applyCmd("bold");
      return;
    }
    if (meta && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      applyCmd("italic");
      return;
    }
    if (meta && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      applyCmd("underline");
      return;
    }

    // TAB: indent/outdent quando estiver em lista
    if (e.key === "Tab") {
      if (isInList()) {
        e.preventDefault();
        document.execCommand(e.shiftKey ? "outdent" : "indent");
        setUpdatedAt(Date.now());
      }
      return;
    }

    // Espaço: tenta converter "* " ou "- " em lista
    if (e.key === " ") {
      // dá chance do caractere entrar e então avalia
      window.setTimeout(() => {
        tryConvertToList();
        setUpdatedAt(Date.now());
      }, 0);
      return;
    }

    // ENTER duplo para sair da lista sem “pular” feio
    if (e.key === "Enter") {
      if (isInList()) {
        const li = getClosestLI();
        const empty = !li || (li.textContent ?? "").trim() === "";
        if (empty) {
          e.preventDefault();
          // Sai da lista
          document.execCommand("insertParagraph");
          document.execCommand("outdent");
          setUpdatedAt(Date.now());
        }
      }
      return;
    }
  };

  const handleEditorInput = () => {
    setUpdatedAt(Date.now());
  };

  const snapshotCurrent = (): NoteSnapshot => {
    return {
      id: uid(),
      title: clampTitle(title.trim() || "Sem Título"),
      html: editorRef.current?.innerHTML ?? "",
      bg,
      color,
      updatedAt: Date.now(),
    };
  };

  const newNote = () => {
    // salva atual no histórico se tiver algum conteúdo
    const html = (editorRef.current?.innerHTML ?? "").replace(/\s+/g, "");
    const hasSomething = html.length > 0 || title.trim().length > 0;

    if (hasSomething) {
      const snap = snapshotCurrent();
      const next = [snap, ...history].slice(0, 200);
      persistHistory(next);
    }

    // limpa
    setTitle("");
    setBg(BG_COLORS[0].value);
    setColor(TEXT_COLORS[0].value);
    setUpdatedAt(Date.now());
    if (editorRef.current) editorRef.current.innerHTML = "";
    // foco
    window.setTimeout(() => editorRef.current?.focus(), 0);
  };

  const loadFromHistory = (snap: NoteSnapshot) => {
    setTitle(clampTitle(snap.title ?? ""));
    setBg(snap.bg ?? BG_COLORS[0].value);
    setColor(snap.color ?? TEXT_COLORS[0].value);
    setUpdatedAt(Date.now());
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = snap.html ?? "";
    });
  };

  return (
    <div className="min-h-screen w-full bg-zinc-50 flex items-center justify-center p-6">
      {/* Folha Única */}
      <div
        className="folha group relative"
        style={{
          backgroundColor: bg,
          color,
        }}
      >
        {/* Header: [Semáforo] [Título central] [Botões direita] */}
        <div className="folha-header">
          {/* Semáforo */}
          <div className="flex items-center gap-2">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>

          {/* Título (invisível) */}
          <div className="flex-1 flex justify-center px-3">
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Sem Título"
              className={`title-input ${shake ? "shake" : ""}`}
              spellCheck={false}
              aria-label="Título"
            />
          </div>

          {/* Botões direita (mesmo tamanho do semáforo) */}
          <div className="right-actions">
            {/* Settings */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button className="icon-btn" aria-label="Configurações">
                  <Settings2 size={14} strokeWidth={1.5} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="right"
                  align="start"
                  sideOffset={10}
                  className="popover popover-horizontal"
                >
                  {/* Fundo */}
                  <div className="popover-row">
                    <span className="popover-label">Fundo</span>
                    <div className="flex items-center gap-2">
                      {BG_COLORS.map((c) => (
                        <button
                          key={c.value}
                          className={`swatch ${bg === c.value ? "swatch-active" : ""}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => setBg(c.value)}
                          aria-label={`Fundo ${c.name}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Texto */}
                  <div className="popover-row">
                    <span className="popover-label">Texto</span>
                    <div className="flex items-center gap-2">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c.value}
                          className={`swatch ${color === c.value ? "swatch-active" : ""}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => setColor(c.value)}
                          aria-label={`Texto ${c.name}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Estilo */}
                  <div className="popover-row">
                    <span className="popover-label">Estilo</span>
                    <div className="flex items-center gap-2">
                      <button className="fmt-btn" onClick={() => applyCmd("bold")} aria-label="Negrito">
                        <Bold size={14} strokeWidth={1.5} />
                      </button>
                      <button className="fmt-btn" onClick={() => applyCmd("italic")} aria-label="Itálico">
                        <Italic size={14} strokeWidth={1.5} />
                      </button>
                      <button className="fmt-btn" onClick={() => applyCmd("underline")} aria-label="Sublinhado">
                        <Underline size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            {/* Plus */}
            <button className="icon-btn" onClick={newNote} aria-label="Nova nota">
              <Plus size={14} strokeWidth={1.5} />
            </button>

            {/* History */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button className="icon-btn" aria-label="Histórico">
                  <Clock size={14} strokeWidth={1.5} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="right" align="end" sideOffset={10} className="popover popover-vertical">
                  <div className="history-title">Histórico</div>

                  <ScrollArea.Root className="history-scroll">
                    <ScrollArea.Viewport className="history-viewport">
                      <div className="history-list">
                        {history.length === 0 ? (
                          <div className="history-empty">Sem notas ainda.</div>
                        ) : (
                          history.map((h) => (
                            <button
                              key={h.id}
                              className="history-item"
                              onClick={() => loadFromHistory(h)}
                              title={h.title}
                            >
                              <span className="history-item-title">{clampTitle(h.title)}</span>
                              <span className="history-item-time">{nowTimeLabel(h.updatedAt)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar className="history-scrollbar" orientation="vertical">
                      <ScrollArea.Thumb className="history-thumb" />
                    </ScrollArea.Scrollbar>
                  </ScrollArea.Root>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>

        {/* Editor (sem bordas internas / folha contínua) */}
        <div
          ref={editorRef}
          className="editor"
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          onKeyDown={handleEditorKeyDown}
          data-placeholder="Escreva..."
          aria-label="Editor"
        />

        {/* Status ultra discreto (opcional) */}
        <div className="status">
          Salvo às {nowTimeLabel(updatedAt)}
        </div>
      </div>
    </div>
  );
}
