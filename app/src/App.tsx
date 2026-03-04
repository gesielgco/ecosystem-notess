import { useEffect, useMemo, useRef, useState } from "react";

type Note = {
  id: string;
  text: string;
  bg: string;
  createdAt: number;
  updatedAt: number;
};

type View = "grid" | "edit";

const STORAGE_NOTES = "ecosystem_notes_v1_notes";
const STORAGE_LAST = "ecosystem_notes_v1_lastEditedNoteId";
const STORAGE_SIZES = "ecosystem_notes_v1_sizes";

const BG_PALETTE = ["#F7F7F7", "#F7E7CD", "#F5E6EA", "#D4EFDF", "#D6EAF8"] as const;
const MAX_CHARS = 400;

// Hard limits (manual resize)
const MIN_W = 300;
const MAX_W = 520;
const MIN_H = 220;
const MAX_H = 620;

// Auto-height limits (proporcional ao texto)
// (inclui o “compacto quando vazio”)
const AUTO_EMPTY_TEXTAREA_H = 120;
const AUTO_MIN_TEXTAREA_H = 160;
const AUTO_MAX_TEXTAREA_H = 360;

// Footer height (CSS usa 44px)
const FOOTER_H = 44;

// Long-press (mobile)
const LONG_PRESS_MS = 520;
const MOVE_TOLERANCE_PX = 10;

type NoteSize = {
  w?: number;
  h?: number;
  manualW?: boolean;
  manualH?: boolean;
};

function now() {
  return Date.now();
}

function genId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clampText(s: string) {
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function safeBg(bg: string) {
  return (BG_PALETTE as readonly string[]).includes(bg) ? bg : "#F7F7F7";
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_NOTES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n: any) => ({
        id: String(n?.id ?? ""),
        text: typeof n?.text === "string" ? clampText(n.text) : "",
        bg: safeBg(String(n?.bg ?? "#F7F7F7")),
        createdAt: typeof n?.createdAt === "number" ? n.createdAt : now(),
        updatedAt: typeof n?.updatedAt === "number" ? n.updatedAt : now(),
      }))
      .filter((n) => n.id);
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes));
}

function loadLastEdited(): string | null {
  try {
    return localStorage.getItem(STORAGE_LAST);
  } catch {
    return null;
  }
}

function saveLastEdited(id: string | null) {
  if (!id) localStorage.removeItem(STORAGE_LAST);
  else localStorage.setItem(STORAGE_LAST, id);
}

function loadSizes(): Record<string, NoteSize> {
  try {
    const raw = localStorage.getItem(STORAGE_SIZES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveSizes(map: Record<string, NoteSize>) {
  localStorage.setItem(STORAGE_SIZES, JSON.stringify(map));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [view, setView] = useState<View>("edit"); // ✅ sempre abre no modo edição
  const [activeId, setActiveId] = useState<string | null>(null);

  // micro-interações
  const [isFocused, setIsFocused] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const savedPulseTimer = useRef<number | null>(null);

  // persist debounce
  const saveTimerRef = useRef<number | null>(null);

  // sizes per note
  const [sizes, setSizes] = useState<Record<string, NoteSize>>({});

  // refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // resize drag state
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    noteId: string;
  } | null>(null);

  // long-press state (mobile)
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  const orderedNotes = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);

  const activeNote = useMemo(() => {
    if (!activeId) return null;
    return notes.find((n) => n.id === activeId) ?? null;
  }, [notes, activeId]);

  function scheduleSave(nextNotes: Note[]) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => saveNotes(nextNotes), 220);
  }

  function pulseSaved() {
    if (savedPulseTimer.current) window.clearTimeout(savedPulseTimer.current);
    setSavedPulse(true);
    savedPulseTimer.current = window.setTimeout(() => setSavedPulse(false), 600);
  }

  function pickBgForNew(count: number) {
    const idx = count % BG_PALETTE.length;
    return BG_PALETTE[idx];
  }

  function createNoteAndOpen(prefBg?: string) {
    const t = now();
    const newNote: Note = {
      id: genId(),
      text: "",
      bg: safeBg(prefBg ?? pickBgForNew(notes.length)),
      createdAt: t,
      updatedAt: t,
    };

    const next = [newNote, ...notes];
    setNotes(next);
    scheduleSave(next);

    setActiveId(newNote.id);
    saveLastEdited(newNote.id);
    setView("edit");

    // reset size for this note
    setSizes((prev) => {
      const nextMap = { ...prev };
      delete nextMap[newNote.id];
      saveSizes(nextMap);
      return nextMap;
    });
  }

  function deleteNoteSilently(noteId: string) {
    const next = notes.filter((x) => x.id !== noteId);
    setNotes(next);
    scheduleSave(next);

    if (loadLastEdited() === noteId) saveLastEdited(null);

    setSizes((prev) => {
      const nextMap = { ...prev };
      delete nextMap[noteId];
      saveSizes(nextMap);
      return nextMap;
    });
  }

  function maybeDeleteActiveIfEmpty() {
    if (!activeId) return;
    const n = notes.find((x) => x.id === activeId);
    if (!n) return;

    if (n.text.trim().length === 0) {
      const noteId = n.id;
      setActiveId(null);
      deleteNoteSilently(noteId);
    }
  }

  function openNote(id: string) {
    maybeDeleteActiveIfEmpty();
    setActiveId(id);
    saveLastEdited(id);
    setView("edit");
  }

  function exitToGrid() {
    maybeDeleteActiveIfEmpty();
    setView("grid");
  }

  // ✅ auto-height proporcional ao texto + compacto quando vazio (se não manualH)
  function autoResizeTextarea() {
    if (!activeId) return;
    const s = sizes[activeId];
    if (s?.manualH) return;

    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";

    const text = el.value.trim();
    if (text.length === 0) {
      el.style.height = `${AUTO_EMPTY_TEXTAREA_H}px`;
      return;
    }

    const desired = el.scrollHeight;
    const clampedH = clamp(desired, AUTO_MIN_TEXTAREA_H, AUTO_MAX_TEXTAREA_H);
    el.style.height = `${clampedH}px`;
  }

  function updateActiveText(nextTextRaw: string) {
    if (!activeId) return;
    const nextText = clampText(nextTextRaw);
    const t = now();

    setNotes((prev) => {
      const next = prev.map((n) => (n.id === activeId ? { ...n, text: nextText, updatedAt: t } : n));
      scheduleSave(next);
      return next;
    });

    pulseSaved();
    queueMicrotask(() => autoResizeTextarea());
  }

  function updateActiveBg(bg: string) {
    if (!activeId) return;
    const safe = safeBg(bg);
    const t = now();

    setNotes((prev) => {
      const next = prev.map((n) => (n.id === activeId ? { ...n, bg: safe, updatedAt: t } : n));
      scheduleSave(next);
      return next;
    });

    pulseSaved();
  }

  // ✅ Resize manual (canto inferior direito)
  function onResizeHandlePointerDown(e: React.PointerEvent) {
    if (!activeId) return;
    const card = cardRef.current;
    if (!card) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = card.getBoundingClientRect();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      noteId: activeId,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizeHandlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag?.active) return;

    e.preventDefault();

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    const nextW = clamp(drag.startW + dx, MIN_W, MAX_W);
    const nextH = clamp(drag.startH + dy, MIN_H, MAX_H);

    setSizes((prev) => {
      const nextMap = {
        ...prev,
        [drag.noteId]: { ...(prev[drag.noteId] ?? {}), w: nextW, h: nextH, manualW: true, manualH: true },
      };
      saveSizes(nextMap);
      return nextMap;
    });

    // textarea acompanha a altura manual
    const el = textareaRef.current;
    if (el) {
      const inner = Math.max(AUTO_EMPTY_TEXTAREA_H, nextH - FOOTER_H - 20);
      el.style.height = `${Math.min(inner, AUTO_MAX_TEXTAREA_H)}px`;
    }
  }

  function onResizeHandlePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = { ...drag, active: false };
    e.preventDefault();
  }

  // -----------------------------
  // ✅ LONG PRESS (mobile) + vibração
  // -----------------------------
  function cancelLongPress() {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  }

  function onGridPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;

    // só no vazio (não em cima de um card)
    if (target.closest(".note-card")) return;

    const isCoarse =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer:coarse)").matches;

    // só para mobile/tablet
    if (!isCoarse) return;

    longPressStartRef.current = { x: e.clientX, y: e.clientY };

    cancelLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      // vibração sutil (se suportar)
      if (navigator.vibrate) navigator.vibrate(12);

      createNoteAndOpen();
      cancelLongPress();
    }, LONG_PRESS_MS);
  }

  function onGridPointerMove(e: React.PointerEvent) {
    if (!longPressStartRef.current) return;

    const dx = Math.abs(e.clientX - longPressStartRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartRef.current.y);

    // se o usuário estiver rolando/arrastando, cancela
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      cancelLongPress();
    }
  }

  // ✅ BOOT: sempre edit (última válida; senão cria; senão mais recente)
  useEffect(() => {
    const loaded = loadNotes();
    const last = loadLastEdited();
    const loadedSizes = loadSizes();

    setNotes(loaded);
    setSizes(loadedSizes);

    if (last && loaded.some((n) => n.id === last)) {
      setActiveId(last);
      setView("edit");
      return;
    }

    if (loaded.length === 0) {
      const t = now();
      const newNote: Note = { id: genId(), text: "", bg: "#F7F7F7", createdAt: t, updatedAt: t };
      const next = [newNote];
      setNotes(next);
      saveNotes(next);
      saveLastEdited(newNote.id);
      setActiveId(newNote.id);
      setView("edit");
      return;
    }

    const mostRecent = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (mostRecent) {
      setActiveId(mostRecent.id);
      saveLastEdited(mostRecent.id);
      setView("edit");
    }
  }, []);

  // foco apenas desktop (não abre teclado no mobile)
  useEffect(() => {
    if (view !== "edit") return;

    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer:fine)").matches;

    if (!isDesktop) return;

    setTimeout(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }, [view, activeId]);

  // ESC volta pro grid (desktop)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (view !== "edit") return;
      if (e.key === "Escape") {
        e.preventDefault();
        exitToGrid();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, notes, activeId]);

  // ao trocar nota ativa: aplica auto-height proporcional
  useEffect(() => {
    if (view !== "edit") return;
    setTimeout(() => autoResizeTextarea(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, view]);

  // Desktop: duplo clique no vazio cria (mobile: long press)
  function onGridDoubleClick() {
    createNoteAndOpen();
  }

  const activeSize = activeId ? sizes[activeId] : undefined;

  const cardStyle: React.CSSProperties | undefined =
    view === "edit" && activeId
      ? {
          background: activeNote?.bg,
          width: activeSize?.manualW && activeSize?.w ? `${activeSize.w}px` : undefined,
          height: activeSize?.manualH && activeSize?.h ? `${activeSize.h}px` : undefined,
        }
      : undefined;

  return (
    <div className="app-root">
      {view === "grid" && (
        <div
          className="grid-screen"
          onDoubleClick={onGridDoubleClick}
          onPointerDown={onGridPointerDown}
          onPointerMove={onGridPointerMove}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          role="button"
          tabIndex={0}
        >
          <div className="grid-wrap">
            {orderedNotes.map((n) => (
              <button
                key={n.id}
                className="note-card"
                style={{ background: n.bg }}
                onClick={(e) => {
                  e.stopPropagation();
                  openNote(n.id);
                }}
                type="button"
              >
                <div className="note-card-text clamp-4">{n.text.trim().length ? n.text : " "}</div>
                <div className="note-card-meta">Salvo às {formatTime(n.updatedAt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "edit" && activeNote && (
        <div className="edit-screen">
          <div className="edit-topbar">
            <button className="back-btn" type="button" onClick={exitToGrid} aria-label="Voltar">
  <span className="back-icon">←</span>
            </button>
          </div>

          {/* Centralização vertical é feita no CSS (.edit-outer) */}
          <div className="edit-outer">
            <div className="edit-wrap">
              <div
                ref={cardRef}
                className={`edit-card edit-card--postit ${isFocused ? "is-focused" : ""}`}
                style={cardStyle}
              >
                <textarea
                  ref={textareaRef}
                  className="edit-textarea"
                  placeholder="Escreva..."
                  value={activeNote.text}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.length > MAX_CHARS) updateActiveText(v.slice(0, MAX_CHARS));
                    else updateActiveText(v);
                  }}
                  spellCheck
                />

                <div
                  className="resize-handle"
                  onPointerDown={onResizeHandlePointerDown}
                  onPointerMove={onResizeHandlePointerMove}
                  onPointerUp={onResizeHandlePointerUp}
                  role="presentation"
                  title="Ajustar tamanho"
                />

                <div className="edit-footer">
                  <div className={`edit-saved ${savedPulse ? "saved-pulse" : ""}`}>
                    Salvo às {formatTime(activeNote.updatedAt)}
                  </div>

                  <div className="edit-right">
                    <div className="color-picker" aria-label="Selecionar cor do fundo">
                      {BG_PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`swatch ${activeNote.bg === c ? "swatch-active" : ""}`}
                          style={{ background: c }}
                          onClick={() => updateActiveBg(c)}
                          aria-label={`Cor ${c}`}
                          title="Alterar cor"
                        />
                      ))}
                    </div>

                    <div className="edit-counter">
                      {activeNote.text.length} / {MAX_CHARS}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ height: 10 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
