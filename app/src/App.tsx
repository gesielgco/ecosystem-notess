import React, { useMemo, useRef, useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Clock, Plus, Settings2, Bold, Italic, Underline } from "lucide-react";

type NoteData = {
  id: string;
  title: string;
  html: string;
  bg: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  updatedAt: number;
};

const STORAGE_NOTES = "folhaUnica.notes.v2";
const STORAGE_Z = "folhaUnica.zTop.v2";
const STORAGE_ACTIVE = "folhaUnica.activeId.v2";

const BG_COLORS = [
  { name: "Padrão", value: "#F7F7F7" },
  { name: "Creme", value: "#F7E7CD" },
  { name: "Coral", value: "#FAD0C4" },
  { name: "Menta", value: "#D4EFDF" },
  { name: "Névoa", value: "#D6EAF8" },
] as const;

const TEXT_COLORS = [
  { name: "Chumbo", value: "#333333" },
  { name: "Rosa", value: "#C71585" },
  { name: "Azul", value: "#0047AB" },
  { name: "Laranja", value: "#FF8C00" },
  { name: "Verde", value: "#228B22" },
] as const;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function clampTitle(raw: string) {
  return raw.slice(0, 20);
}
function nowTimeLabel(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DragState =
  | { type: "drag"; id: string; startX: number; startY: number; baseX: number; baseY: number }
  | {
      type: "resize";
      id: string;
      dir: ResizeDir;
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      baseW: number;
      baseH: number;
    }
  | null;

const MIN_W = 260;
const MIN_H = 220;

function cursorForDir(dir: ResizeDir) {
  switch (dir) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
  }
}

export default function App() {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [zTop, setZTop] = useState<number>(10);

  const dragRef = useRef<DragState>(null);
  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  useEffect(() => {
    try {
      const z = localStorage.getItem(STORAGE_Z);
      if (z) setZTop(Number(z) || 10);
    } catch {}

    try {
      const raw = localStorage.getItem(STORAGE_NOTES);
      const act = localStorage.getItem(STORAGE_ACTIVE);
      if (raw) {
        const parsed = JSON.parse(raw) as NoteData[];
        setNotes(parsed);
        if (act && parsed.some((n) => n.id === act)) setActiveId(act);
        else if (parsed[0]) setActiveId(parsed[0].id);
        return;
      }
    } catch {}

    const first: NoteData = {
      id: uid(),
      title: "",
      html: "",
      bg: BG_COLORS[0].value,
      color: TEXT_COLORS[0].value,
      x: 120,
      y: 90,
      w: 520,
      h: 520,
      z: 10,
      updatedAt: Date.now(),
    };
    setNotes([first]);
    setActiveId(first.id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes));
      localStorage.setItem(STORAGE_Z, String(zTop));
      if (activeId) localStorage.setItem(STORAGE_ACTIVE, activeId);
    } catch {}
  }, [notes, zTop, activeId]);

  const bringToFront = (id: string) => {
    setNotes((prev) => {
      const maxZ = Math.max(zTop, ...prev.map((n) => n.z));
      const nextZ = maxZ + 1;
      setZTop(nextZ);
      return prev.map((n) => (n.id === id ? { ...n, z: nextZ } : n));
    });
    setActiveId(id);
  };

  const updateNote = (id: string, patch: Partial<NoteData>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const applyCmd = (id: string, cmd: "bold" | "italic" | "underline") => {
    bringToFront(id);
    editorRefs.current[id]?.focus();
    document.execCommand(cmd);
    updateNote(id, { updatedAt: Date.now(), html: editorRefs.current[id]?.innerHTML ?? "" });
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

  const tryConvertToList = (id: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;

    let el: Node | null = container;
    while (el && el !== editorRefs.current[id] && el.parentNode) {
      if (el.nodeType === Node.ELEMENT_NODE) {
        const ht = el as HTMLElement;
        if (ht.tagName === "DIV" || ht.tagName === "P") break;
      }
      el = el.parentNode;
    }

    const block = (el && el.nodeType === Node.ELEMENT_NODE ? (el as HTMLElement) : editorRefs.current[id]) as
      | HTMLElement
      | null;
    if (!block) return;

    const text = (block.textContent ?? "").replace(/\u00A0/g, " ");
    if (text === "*" || text === "-" || text === "* " || text === "- ") {
      block.textContent = "";
      document.execCommand("insertUnorderedList");
    }
  };

  const handleEditorKeyDown = (id: string, e: React.KeyboardEvent<HTMLDivElement>) => {
    const meta = e.metaKey || e.ctrlKey;

    if (meta && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      applyCmd(id, "bold");
      return;
    }
    if (meta && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      applyCmd(id, "italic");
      return;
    }
    if (meta && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      applyCmd(id, "underline");
      return;
    }

    if (e.key === "Tab") {
      if (isInList()) {
        e.preventDefault();
        document.execCommand(e.shiftKey ? "outdent" : "indent");
        updateNote(id, { updatedAt: Date.now(), html: editorRefs.current[id]?.innerHTML ?? "" });
      }
      return;
    }

    if (e.key === " ") {
      window.setTimeout(() => {
        tryConvertToList(id);
        updateNote(id, { updatedAt: Date.now(), html: editorRefs.current[id]?.innerHTML ?? "" });
      }, 0);
      return;
    }

    if (e.key === "Enter") {
      if (isInList()) {
        const li = getClosestLI();
        const empty = !li || (li.textContent ?? "").trim() === "";
        if (empty) {
          e.preventDefault();
          document.execCommand("insertParagraph");
          document.execCommand("outdent");
          updateNote(id, { updatedAt: Date.now(), html: editorRefs.current[id]?.innerHTML ?? "" });
        }
      }
      return;
    }
  };

  const handleEditorInput = (id: string) => {
    updateNote(id, { updatedAt: Date.now(), html: editorRefs.current[id]?.innerHTML ?? "" });
  };

  const newNoteCascade = () => {
    const base = activeNote ?? notes[notes.length - 1];
    const baseX = base ? base.x : 120;
    const baseY = base ? base.y : 90;

    const maxZ = Math.max(zTop, ...notes.map((n) => n.z));
    const nextZ = maxZ + 1;
    setZTop(nextZ);

    const n: NoteData = {
      id: uid(),
      title: "",
      html: "",
      bg: BG_COLORS[0].value,
      color: TEXT_COLORS[0].value,
      x: baseX + 18,
      y: baseY + 18,
      w: base?.w ?? 520,
      h: base?.h ?? 520,
      z: nextZ,
      updatedAt: Date.now(),
    };

    setNotes((prev) => [...prev, n]);
    setActiveId(n.id);
    window.setTimeout(() => editorRefs.current[n.id]?.focus(), 0);
  };

  const onHeaderPointerDown = (id: string, e: React.PointerEvent) => {
    bringToFront(id);
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      type: "drag",
      id,
      startX: e.clientX,
      startY: e.clientY,
      baseX: note.x,
      baseY: note.y,
    };
  };

  const onResizePointerDown = (id: string, dir: ResizeDir, e: React.PointerEvent) => {
    bringToFront(id);
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      type: "resize",
      id,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      baseX: note.x,
      baseY: note.y,
      baseW: note.w,
      baseH: note.h,
    };
  };

  const onGlobalPointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (st.type === "drag") {
      updateNote(st.id, { x: st.baseX + dx, y: st.baseY + dy });
      return;
    }

    if (st.type === "resize") {
      let x = st.baseX;
      let y = st.baseY;
      let w = st.baseW;
      let h = st.baseH;

      const dir = st.dir;

      if (dir.includes("e")) w = st.baseW + dx;
      if (dir.includes("w")) {
        w = st.baseW - dx;
        x = st.baseX + dx;
      }

      if (dir.includes("s")) h = st.baseH + dy;
      if (dir.includes("n")) {
        h = st.baseH - dy;
        y = st.baseY + dy;
      }

      if (w < MIN_W) {
        if (dir.includes("w")) x -= MIN_W - w;
        w = MIN_W;
      }
      if (h < MIN_H) {
        if (dir.includes("n")) y -= MIN_H - h;
        h = MIN_H;
      }

      updateNote(st.id, { x, y, w, h });
    }
  };

  const onGlobalPointerUp = () => {
    dragRef.current = null;
  };

  const [shakeMap, setShakeMap] = useState<Record<string, boolean>>({});
  const setShake = (id: string, v: boolean) => setShakeMap((p) => ({ ...p, [id]: v }));

  const handleTitleChange = (id: string, v: string) => {
    if (v.length <= 20) {
      updateNote(id, { title: v, updatedAt: Date.now() });
      return;
    }
    updateNote(id, { title: clampTitle(v), updatedAt: Date.now() });
    setShake(id, true);
    window.setTimeout(() => setShake(id, false), 260);
  };

  const historySorted = useMemo(() => {
    const copy = [...notes];
    copy.sort((a, b) => b.updatedAt - a.updatedAt);
    return copy.slice(0, 80);
  }, [notes]);

  return (
    <div className="min-h-screen w-full bg-zinc-50" onPointerMove={onGlobalPointerMove} onPointerUp={onGlobalPointerUp}>
      {notes.map((n) => {
        const focused = n.id === activeId;
        return (
          <div
            key={n.id}
            className={`folha ${focused ? "folha-focused" : "folha-blur"} group`}
            style={{
              backgroundColor: n.bg,
              color: n.color,
              left: n.x,
              top: n.y,
              width: n.w,
              height: n.h,
              zIndex: n.z,
            }}
            onMouseDown={() => bringToFront(n.id)}
          >
            <div className="folha-header dragbar" onPointerDown={(e) => onHeaderPointerDown(n.id, e)}>
              <div className="flex items-center gap-2">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
              </div>

              <div className="flex-1 flex justify-center px-3">
                <input
                  value={n.title}
                  onChange={(e) => handleTitleChange(n.id, e.target.value)}
                  placeholder="Sem Título"
                  className={`title-input ${shakeMap[n.id] ? "shake" : ""}`}
                  spellCheck={false}
                />
              </div>

              <div className="right-actions">
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button className="icon-btn" aria-label="Configurações">
                      <Settings2 size={14} strokeWidth={1.5} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content side="right" align="start" sideOffset={10} className="popover popover-horizontal">
                      <div className="popover-row">
                        <span className="popover-label">Fundo</span>
                        <div className="flex items-center gap-2">
                          {BG_COLORS.map((c) => (
                            <button
                              key={c.value}
                              className={`swatch ${n.bg === c.value ? "swatch-active" : ""}`}
                              style={{ backgroundColor: c.value }}
                              onClick={() => updateNote(n.id, { bg: c.value, updatedAt: Date.now() })}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="popover-row">
                        <span className="popover-label">Texto</span>
                        <div className="flex items-center gap-2">
                          {TEXT_COLORS.map((c) => (
                            <button
                              key={c.value}
                              className={`swatch ${n.color === c.value ? "swatch-active" : ""}`}
                              style={{ backgroundColor: c.value }}
                              onClick={() => updateNote(n.id, { color: c.value, updatedAt: Date.now() })}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="popover-row">
                        <span className="popover-label">Estilo</span>
                        <div className="flex items-center gap-2">
                          <button className="fmt-dot" onClick={() => applyCmd(n.id, "bold")}>
                            <Bold size={12} strokeWidth={1.5} />
                          </button>
                          <button className="fmt-dot" onClick={() => applyCmd(n.id, "italic")}>
                            <Italic size={12} strokeWidth={1.5} />
                          </button>
                          <button className="fmt-dot" onClick={() => applyCmd(n.id, "underline")}>
                            <Underline size={12} strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>

                <button className="icon-btn" onClick={newNoteCascade} aria-label="Nova nota">
                  <Plus size={14} strokeWidth={1.5} />
                </button>

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
                            {historySorted.map((h) => (
                              <button
                                key={h.id}
                                className="history-item"
                                onClick={() => {
                                  bringToFront(h.id);
                                  window.setTimeout(() => editorRefs.current[h.id]?.focus(), 0);
                                }}
                              >
                                <span className="history-item-title">{clampTitle(h.title || "Sem Título")}</span>
                                <span className="history-item-time">{nowTimeLabel(h.updatedAt)}</span>
                              </button>
                            ))}
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

            <div
              ref={(el) => (editorRefs.current[n.id] = el)}
              className="editor"
              contentEditable
              suppressContentEditableWarning
              onInput={() => handleEditorInput(n.id)}
              onKeyDown={(e) => handleEditorKeyDown(n.id, e)}
              onFocus={() => bringToFront(n.id)}
              data-placeholder="Escreva..."
              dangerouslySetInnerHTML={{ __html: n.html }}
            />

            <div className="handle handle-n" style={{ cursor: cursorForDir("n") }} onPointerDown={(e) => onResizePointerDown(n.id, "n", e)} />
            <div className="handle handle-s" style={{ cursor: cursorForDir("s") }} onPointerDown={(e) => onResizePointerDown(n.id, "s", e)} />
            <div className="handle handle-e" style={{ cursor: cursorForDir("e") }} onPointerDown={(e) => onResizePointerDown(n.id, "e", e)} />
            <div className="handle handle-w" style={{ cursor: cursorForDir("w") }} onPointerDown={(e) => onResizePointerDown(n.id, "w", e)} />

            <div className="handle handle-nw" style={{ cursor: cursorForDir("nw") }} onPointerDown={(e) => onResizePointerDown(n.id, "nw", e)} />
            <div className="handle handle-ne" style={{ cursor: cursorForDir("ne") }} onPointerDown={(e) => onResizePointerDown(n.id, "ne", e)} />
            <div className="handle handle-sw" style={{ cursor: cursorForDir("sw") }} onPointerDown={(e) => onResizePointerDown(n.id, "sw", e)} />
            <div className="handle handle-se" style={{ cursor: cursorForDir("se") }} onPointerDown={(e) => onResizePointerDown(n.id, "se", e)} />
          </div>
        );
      })}
    </div>
  );
}
