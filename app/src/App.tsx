import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Settings, Plus, Clock } from "lucide-react";

type Note = {
  id: string;
  title: string;
  html: string;
  bg: string;
  fg: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  updatedAt: number;
};

const STORAGE_KEY = "folha_unica_notes_v1";

const BG_COLORS = [
  { name: "Cinza", value: "#F7F7F7" }, // padrão
  { name: "Creme", value: "#F7E7CD" },
  { name: "Coral", value: "#FAD0C4" },
  { name: "Menta", value: "#D4EFDF" },
  { name: "Névoa", value: "#D6EAF8" },
];

const FG_COLORS = [
  { name: "Chumbo", value: "#333333" }, // padrão
  { name: "Rosa", value: "#C71585" },
  { name: "Azul", value: "#0047AB" },
  { name: "Laranja", value: "#FF8C00" },
  { name: "Verde", value: "#228B22" },
];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function nowTimeLabel(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

type ResizeDir = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export default function App() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Note[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    const first = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Note[]) : [];
        return parsed?.[0]?.id ?? null;
      } catch {
        return null;
      }
    })();
    return first;
  });

  // refs por nota (editor)
  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const maxZ = useMemo(() => notes.reduce((m, n) => Math.max(m, n.z), 0), [notes]);

  // Persistência
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  // Se não houver notas, cria a primeira automaticamente
  useEffect(() => {
    if (notes.length === 0) {
      const first: Note = {
        id: uid(),
        title: "",
        html: "",
        bg: "#F7F7F7",
        fg: "#333333",
        x: 60,
        y: 80,
        w: 320,
        h: 360,
        z: 1,
        updatedAt: Date.now(),
      };
      setNotes([first]);
      setActiveId(first.id);
    } else if (!activeId) {
      setActiveId(notes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  // Estado de drag
  const dragState = useRef<{
    id: string;
    startX: number;
    startY: number;
    noteX: number;
    noteY: number;
  } | null>(null);

  // Estado de resize
  const resizeState = useRef<{
    id: string;
    dir: ResizeDir;
    startX: number;
    startY: number;
    noteX: number;
    noteY: number;
    noteW: number;
    noteH: number;
  } | null>(null);

  function bringToFront(id: string) {
    setNotes((prev) => {
      const zTop = prev.reduce((m, n) => Math.max(m, n.z), 0) + 1;
      return prev.map((n) => (n.id === id ? { ...n, z: zTop } : n));
    });
    setActiveId(id);
  }

  function createNewNoteCascade() {
    setNotes((prev) => {
      const base = prev.find((n) => n.id === activeId) ?? prev[prev.length - 1];
      const zTop = prev.reduce((m, n) => Math.max(m, n.z), 0) + 1;
      const newNote: Note = {
        id: uid(),
        title: "",
        html: "",
        bg: "#F7F7F7",
        fg: "#333333",
        x: (base?.x ?? 60) + 18,
        y: (base?.y ?? 80) + 18,
        w: Math.max(280, base?.w ?? 320),
        h: Math.max(300, base?.h ?? 360),
        z: zTop,
        updatedAt: Date.now(),
      };
      // foco na nova
      setTimeout(() => {
        setActiveId(newNote.id);
        const el = editorRefs.current[newNote.id];
        el?.focus();
      }, 0);
      return [...prev, newNote];
    });
  }

  function clearActiveNote() {
    if (!activeNote) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeNote.id ? { ...n, title: "", html: "", updatedAt: Date.now() } : n
      )
    );
    setTimeout(() => editorRefs.current[activeNote.id]?.focus(), 0);
  }

  function updateNote(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  // ==== Drag handlers ====
  function onDragPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);

    const note = notes.find((n) => n.id === id);
    if (!note) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      noteX: note.x,
      noteY: note.y,
    };
  }

  function onResizePointerDown(e: React.PointerEvent, id: string, dir: ResizeDir) {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);

    const note = notes.find((n) => n.id === id);
    if (!note) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeState.current = {
      id,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      noteX: note.x,
      noteY: note.y,
      noteW: note.w,
      noteH: note.h,
    };
  }

  function onGlobalPointerMove(e: PointerEvent) {
    // Drag
    if (dragState.current) {
      const s = dragState.current;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      updateNote(s.id, {
        x: s.noteX + dx,
        y: s.noteY + dy,
      });
      return;
    }

    // Resize
    if (resizeState.current) {
      const s = resizeState.current;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      const MIN_W = 260;
      const MIN_H = 240;

      let x = s.noteX;
      let y = s.noteY;
      let w = s.noteW;
      let h = s.noteH;

      const dir = s.dir;

      // horizontais
      if (dir.includes("e")) {
        w = clamp(s.noteW + dx, MIN_W, 900);
      }
      if (dir.includes("w")) {
        const newW = clamp(s.noteW - dx, MIN_W, 900);
        const delta = newW - s.noteW;
        w = newW;
        x = s.noteX - delta;
      }

      // verticais
      if (dir.includes("s")) {
        h = clamp(s.noteH + dy, MIN_H, 900);
      }
      if (dir.includes("n")) {
        const newH = clamp(s.noteH - dy, MIN_H, 900);
        const delta = newH - s.noteH;
        h = newH;
        y = s.noteY - delta;
      }

      updateNote(s.id, { x, y, w, h });
    }
  }

  function onGlobalPointerUp() {
    dragState.current = null;
    resizeState.current = null;
  }

  useEffect(() => {
    window.addEventListener("pointermove", onGlobalPointerMove);
    window.addEventListener("pointerup", onGlobalPointerUp);
    return () => {
      window.removeEventListener("pointermove", onGlobalPointerMove);
      window.removeEventListener("pointerup", onGlobalPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // ==== Rich text helpers ====
  function exec(cmd: "bold" | "italic" | "underline") {
    document.execCommand(cmd);
    // salva html imediatamente
    if (activeNote) {
      const el = editorRefs.current[activeNote.id];
      if (el) updateNote(activeNote.id, { html: el.innerHTML, updatedAt: Date.now() });
    }
  }

  function applyForeColor(color: string) {
    // aplica na seleção (se houver); se não houver, muda a cor base do editor (note.fg)
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("foreColor", false, color);
    } catch {
      // ok
    }
    if (activeNote) {
      const el = editorRefs.current[activeNote.id];
      if (el) updateNote(activeNote.id, { html: el.innerHTML, fg: color, updatedAt: Date.now() });
      else updateNote(activeNote.id, { fg: color, updatedAt: Date.now() });
    }
  }

  function inListSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const node = sel.anchorNode as Node | null;
    if (!node) return false;
    const el = (node.nodeType === 1 ? (node as Element) : node.parentElement) as Element | null;
    if (!el) return false;
    return !!el.closest("li, ul, ol");
  }

  function currentLineStartsWithDashOrStar() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);

    // pega o texto do bloco atual (heurística)
    const container = range.startContainer;
    const block =
      (container.nodeType === 1 ? (container as Element) : container.parentElement)?.closest(
        "div, p, li"
      ) ?? null;
    const text = block?.textContent ?? "";

    // início com "* " ou "- "
    return text.trimStart().startsWith("* ") || text.trimStart().startsWith("- ");
  }

  function removeLeadingMarkerInCurrentLine() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const block =
      (container.nodeType === 1 ? (container as Element) : container.parentElement)?.closest(
        "div, p, li"
      ) ?? null;
    if (!block) return;

    // remove apenas no começo
    const raw = block.textContent ?? "";
    const cleaned = raw.replace(/^\s*[\*\-]\s+/, "");
    if (cleaned !== raw) {
      block.textContent = cleaned;
      // move cursor pro fim do bloco
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>, noteId: string) {
    // atalhos
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        exec("bold");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        exec("italic");
        return;
      }
      if (k === "u") {
        e.preventDefault();
        exec("underline");
        return;
      }
    }

    // Tab para indent/outdent em listas
    if (e.key === "Tab") {
      if (inListSelection()) {
        e.preventDefault();
        if (e.shiftKey) document.execCommand("outdent");
        else document.execCommand("indent");
        return;
      }
    }

    // Enter: regra dos “dois enter saem da lista” (heurística)
    if (e.key === "Enter") {
      if (inListSelection()) {
        const sel = window.getSelection();
        const node = sel?.anchorNode;
        const li = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest("li");
        const isEmpty = (li?.textContent ?? "").trim() === "";

        if (isEmpty) {
          e.preventDefault();
          // sair da lista
          document.execCommand("outdent");
          document.execCommand("insertParagraph");
          return;
        }
      }
    }

    // Espaço: se começar com * ou - vira lista
    if (e.key === " " || e.code === "Space") {
      // só se a linha atual começar com marcador
      if (currentLineStartsWithDashOrStar()) {
        // transforma em lista
        e.preventDefault();
        removeLeadingMarkerInCurrentLine();
        document.execCommand("insertUnorderedList");
        return;
      }
    }
  }

  function handleEditorInput(noteId: string) {
    const el = editorRefs.current[noteId];
    if (!el) return;
    updateNote(noteId, { html: el.innerHTML, updatedAt: Date.now() });
  }

  // título: limite 20 + shake
  const [shakeIds, setShakeIds] = useState<Record<string, boolean>>({});

  function setShake(id: string) {
    setShakeIds((p) => ({ ...p, [id]: true }));
    window.setTimeout(() => {
      setShakeIds((p) => ({ ...p, [id]: false }));
    }, 260);
  }

  function onTitleChange(id: string, value: string) {
    if (value.length > 20) {
      setShake(id);
      return;
    }
    updateNote(id, { title: value, updatedAt: Date.now() });
  }

  // Render
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "white",
        position: "relative",
        overflow: "hidden",
      }}
      onPointerDown={() => {
        // clique fora não muda nada
      }}
    >
      {notes
        .slice()
        .sort((a, b) => a.z - b.z)
        .map((note) => {
          const focused = note.id === activeId;

          return (
            <div
              key={note.id}
              className={`folha ${focused ? "folha-focused" : "folha-blur"}`}
              style={{
                left: note.x,
                top: note.y,
                width: note.w,
                height: note.h,
                background: note.bg,
                zIndex: note.z,
              }}
              onPointerDown={() => bringToFront(note.id)}
            >
              {/* Resize handles (8) */}
              <div className="handle handle-n" onPointerDown={(e) => onResizePointerDown(e, note.id, "n")} />
              <div className="handle handle-s" onPointerDown={(e) => onResizePointerDown(e, note.id, "s")} />
              <div className="handle handle-e" onPointerDown={(e) => onResizePointerDown(e, note.id, "e")} />
              <div className="handle handle-w" onPointerDown={(e) => onResizePointerDown(e, note.id, "w")} />
              <div className="handle handle-nw" onPointerDown={(e) => onResizePointerDown(e, note.id, "nw")} />
              <div className="handle handle-ne" onPointerDown={(e) => onResizePointerDown(e, note.id, "ne")} />
              <div className="handle handle-sw" onPointerDown={(e) => onResizePointerDown(e, note.id, "sw")} />
              <div className="handle handle-se" onPointerDown={(e) => onResizePointerDown(e, note.id, "se")} />

              {/* Header: semáforo -> título -> ações */}
              <div className="folha-header dragbar" onPointerDown={(e) => onDragPointerDown(e, note.id)}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>

                <input
                  className={`title-input ${shakeIds[note.id] ? "shake" : ""}`}
                  value={note.title}
                  placeholder="Sem título"
                  onChange={(e) => onTitleChange(note.id, e.target.value)}
                  onPointerDown={(e) => {
                    // permitir editar sem “arrastar”
                    e.stopPropagation();
                  }}
                />

                <div style={{ flex: 1 }} />

                <div className="right-actions" onPointerDown={(e) => e.stopPropagation()}>
                  {/* Settings */}
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button className="icon-btn" aria-label="Configurações">
                        <Settings size={14} strokeWidth={1.5} />
                      </button>
                    </Popover.Trigger>

                    <Popover.Portal>
                      <Popover.Content
                        side="right"
                        align="start"
                        sideOffset={10}
                        collisionPadding={12}
                        sticky="partial"
                        className="popover popover-horizontal"
                        style={{ zIndex: 99999 }}
                      >
                        {/* Fundo */}
                        <div className="popover-row">
                          <div className="popover-label">Fundo</div>
                          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", width: "100%" }}>
                            {BG_COLORS.map((c) => (
                              <button
                                key={c.value}
                                className={`swatch ${note.bg === c.value ? "swatch-active" : ""}`}
                                style={{ background: c.value }}
                                onClick={() => updateNote(note.id, { bg: c.value, updatedAt: Date.now() })}
                                aria-label={c.name}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Texto */}
                        <div className="popover-row">
                          <div className="popover-label">Texto</div>
                          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", width: "100%" }}>
                            {FG_COLORS.map((c) => (
                              <button
                                key={c.value}
                                className={`swatch ${note.fg === c.value ? "swatch-active" : ""}`}
                                style={{ background: c.value }}
                                onClick={() => {
                                  // aplica na seleção se houver
                                  bringToFront(note.id);
                                  const el = editorRefs.current[note.id];
                                  el?.focus();
                                  applyForeColor(c.value);
                                  updateNote(note.id, { fg: c.value, updatedAt: Date.now() });
                                }}
                                aria-label={c.name}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Estilo */}
                        <div className="popover-row">
                          <div className="popover-label">Estilo</div>
                          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", width: "100%" }}>
                            <button
                              className="fmt-dot"
                              onClick={() => {
                                bringToFront(note.id);
                                editorRefs.current[note.id]?.focus();
                                document.execCommand("bold");
                                handleEditorInput(note.id);
                              }}
                              aria-label="Negrito"
                            >
                              <span style={{ fontSize: 11, fontWeight: 700 }}>B</span>
                            </button>

                            <button
                              className="fmt-dot"
                              onClick={() => {
                                bringToFront(note.id);
                                editorRefs.current[note.id]?.focus();
                                document.execCommand("italic");
                                handleEditorInput(note.id);
                              }}
                              aria-label="Itálico"
                            >
                              <span style={{ fontSize: 11, fontStyle: "italic" }}>I</span>
                            </button>

                            <button
                              className="fmt-dot"
                              onClick={() => {
                                bringToFront(note.id);
                                editorRefs.current[note.id]?.focus();
                                document.execCommand("underline");
                                handleEditorInput(note.id);
                              }}
                              aria-label="Sublinhado"
                            >
                              <span style={{ fontSize: 11, textDecoration: "underline" }}>U</span>
                            </button>
                          </div>
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>

                  {/* Plus */}
                  <button
                    className="icon-btn"
                    aria-label="Nova nota"
                    onClick={() => createNewNoteCascade()}
                  >
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
                      <Popover.Content
                        side="right"
                        align="start"
                        sideOffset={10}
                        collisionPadding={12}
                        sticky="partial"
                        className="popover popover-vertical"
                        style={{ zIndex: 99999 }}
                      >
                        <div className="history-title">Histórico</div>

                        <div className="history-scroll">
                          <ScrollArea.Root style={{ width: "100%", height: 220 }}>
                            <ScrollArea.Viewport className="history-viewport">
                              <div className="history-list">
                                {notes
                                  .slice()
                                  .sort((a, b) => b.updatedAt - a.updatedAt)
                                  .map((n) => (
                                    <button
                                      key={n.id}
                                      className="history-item"
                                      onClick={() => {
                                        bringToFront(n.id);
                                        setTimeout(() => editorRefs.current[n.id]?.focus(), 0);
                                      }}
                                    >
                                      <span className="history-item-title">
                                        {(n.title || "Sem título").slice(0, 20)}
                                      </span>
                                      <span className="history-item-time">{nowTimeLabel(n.updatedAt)}</span>
                                    </button>
                                  ))}
                              </div>
                            </ScrollArea.Viewport>

                            <ScrollArea.Scrollbar className="history-scrollbar" orientation="vertical">
                              <ScrollArea.Thumb className="history-thumb" />
                            </ScrollArea.Scrollbar>
                          </ScrollArea.Root>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                          <button
                            className="icon-btn"
                            onClick={() => clearActiveNote()}
                            title="Limpar nota atual"
                            aria-label="Limpar"
                          >
                            <span style={{ fontSize: 12, fontWeight: 600 }}>×</span>
                          </button>
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>

              {/* Editor único (folha contínua) */}
              <div
                ref={(el) => {
                  editorRefs.current[note.id] = el;
                }}
                className="editor"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Escreva..."
                style={{
                  color: note.fg,
                }}
                onPointerDown={(e) => {
                  // permitir selecionar texto sem puxar drag
                  e.stopPropagation();
                  bringToFront(note.id);
                }}
                onKeyDown={(e) => handleEditorKeyDown(e, note.id)}
                onInput={() => handleEditorInput(note.id)}
                dangerouslySetInnerHTML={{ __html: note.html }}
              />
            </div>
          );
        })}
    </div>
  );
}
