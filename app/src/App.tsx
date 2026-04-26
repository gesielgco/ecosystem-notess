import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, X, Trash2 } from "lucide-react";

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

const BG_PALETTE = ["#F7E7CD", "#F5E6EA", "#D4EFDF", "#D6EAF8"] as const;
const MAX_CHARS = 400;

const LONG_PRESS_MS = 520;
const MOVE_TOLERANCE_PX = 10;

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
  if (bg === "#FCFCFC") return BG_PALETTE[0];
  return (BG_PALETTE as readonly string[]).includes(bg) ? bg : BG_PALETTE[0];
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
        bg: safeBg(String(n?.bg ?? BG_PALETTE[0])),
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

function isMobileLikeNow() {
  if (typeof window === "undefined") return false;

  const coarse =
    !!window.matchMedia && window.matchMedia("(pointer:coarse)").matches;

  return coarse;
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [view, setView] = useState<View>("edit");
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isMobileLike, setIsMobileLike] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const savedPulseTimer = useRef<number | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextCardClickRef = useRef(false);

  const orderedNotes = useMemo(() => {
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes]);

  const activeNote = useMemo(() => {
    if (!activeId) return null;
    return notes.find((n) => n.id === activeId) ?? null;
  }, [notes, activeId]);

  useEffect(() => {
    const apply = () => setIsMobileLike(isMobileLikeNow());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    const loaded = loadNotes();
    const last = loadLastEdited();

    setNotes(loaded);

    if (last && loaded.some((n) => n.id === last)) {
      setActiveId(last);
      setView("edit");
      return;
    }

    if (loaded.length === 0) {
      const t = now();
      const newNote: Note = {
        id: genId(),
        text: "",
        bg: BG_PALETTE[0],
        createdAt: t,
        updatedAt: t,
      };
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

  useEffect(() => {
    if (view === "edit" && activeNote) {
      document.documentElement.style.backgroundColor = activeNote.bg;
      document.body.style.backgroundColor = activeNote.bg;
    } else {
      document.documentElement.style.backgroundColor = "#f6f6f6";
      document.body.style.backgroundColor = "#f6f6f6";
    }

    return () => {
      document.documentElement.style.backgroundColor = "#f6f6f6";
      document.body.style.backgroundColor = "#f6f6f6";
    };
  }, [view, activeNote]);

  useEffect(() => {
    if (view !== "edit") return;

    const shouldFocus =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(pointer:fine)").matches;

    if (!shouldFocus) return;

    setTimeout(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }, [view, activeId]);

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
  }, [view, activeId, notes]);

  function pulseSaved() {
    if (savedPulseTimer.current) window.clearTimeout(savedPulseTimer.current);
    setSavedPulse(true);
    savedPulseTimer.current = window.setTimeout(() => setSavedPulse(false), 600);
  }

  function clearSelectionMode() {
    setIsSelectionMode(false);
    setSelectedIds([]);
  }

  function toggleSelected(noteId: string) {
    setSelectedIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
    );
  }

  function enterSelectionMode(initialId?: string) {
    setIsSelectionMode(true);
    if (initialId) {
      setSelectedIds((prev) => (prev.includes(initialId) ? prev : [...prev, initialId]));
    }
  }

  function createNoteAndOpen(prefBg?: string) {
    const t = now();
    const newNote: Note = {
      id: genId(),
      text: "",
      bg: safeBg(prefBg ?? BG_PALETTE[notes.length % BG_PALETTE.length]),
      createdAt: t,
      updatedAt: t,
    };

    const next = [newNote, ...notes];
    setNotes(next);
    saveNotes(next);

    setActiveId(newNote.id);
    saveLastEdited(newNote.id);
    setView("edit");
    clearSelectionMode();
  }

  function deleteNoteSilently(noteId: string) {
    const next = notes.filter((x) => x.id !== noteId);
    setNotes(next);
    saveNotes(next);

    if (loadLastEdited() === noteId) saveLastEdited(null);
  }

  function deleteSelectedNotes() {
    if (selectedIds.length === 0) return;

    const selectedSet = new Set(selectedIds);
    const next = notes.filter((n) => !selectedSet.has(n.id));
    setNotes(next);
    saveNotes(next);

    if (activeId && selectedSet.has(activeId)) {
      setActiveId(null);
      saveLastEdited(null);
    }

    clearSelectionMode();
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
    clearSelectionMode();
  }

  function exitToGrid() {
    maybeDeleteActiveIfEmpty();
    setView("grid");
    clearSelectionMode();
  }

  function updateActiveText(nextTextRaw: string) {
    if (!activeId) return;

    const nextText = clampText(nextTextRaw);
    const t = now();

    const next = notes.map((n) =>
      n.id === activeId ? { ...n, text: nextText, updatedAt: t } : n
    );

    setNotes(next);
    saveNotes(next);
    pulseSaved();
  }

  function updateActiveBg(bg: string) {
    if (!activeId) return;

    const safe = safeBg(bg);
    const t = now();

    const next = notes.map((n) =>
      n.id === activeId ? { ...n, bg: safe, updatedAt: t } : n
    );

    setNotes(next);
    saveNotes(next);
    pulseSaved();
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  }

  function onGridPointerDown(e: React.PointerEvent) {
    if (!isMobileLikeNow()) return;

    const target = e.target as HTMLElement;
    const noteCard = target.closest(".note-card") as HTMLElement | null;
    const noteId = noteCard?.dataset.noteId;

    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    cancelLongPress();

    if (noteId) {
      longPressTimerRef.current = window.setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(12);
        suppressNextCardClickRef.current = true;
        enterSelectionMode(noteId);
        cancelLongPress();
      }, LONG_PRESS_MS);
      return;
    }

    longPressTimerRef.current = window.setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(12);
      createNoteAndOpen();
      cancelLongPress();
    }, LONG_PRESS_MS);
  }

  function onGridPointerMove(e: React.PointerEvent) {
    if (!longPressStartRef.current) return;

    const dx = Math.abs(e.clientX - longPressStartRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartRef.current.y);

    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      cancelLongPress();
    }
  }

  function onGridDoubleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest(".note-card")) return;
    if (isMobileLikeNow()) return;
    createNoteAndOpen();
  }

  function onCardClick(noteId: string) {
    if (suppressNextCardClickRef.current) {
      suppressNextCardClickRef.current = false;
      return;
    }

    if (isSelectionMode) {
      toggleSelected(noteId);
      return;
    }

    openNote(noteId);
  }

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
          <div className="grid-header">
            {!isSelectionMode ? (
              <>
                <div className="grid-hint" aria-hidden="true">
                  {isMobileLike ? "pressione para criar" : "clique 2x para criar"}
                </div>

                {!isMobileLike ? (
                  <button
                    type="button"
                    className="topbar-icon-btn grid-select-btn"
                    title="Selecionar"
                    aria-label="Selecionar"
                    onClick={(e) => {
                      e.stopPropagation();
                      enterSelectionMode();
                    }}
                  >
                    <CheckSquare size={18} strokeWidth={1.5} />
                  </button>
                ) : (
                  <div className="grid-header-spacer" />
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="topbar-icon-btn"
                  title="Cancelar"
                  aria-label="Cancelar"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSelectionMode();
                  }}
                >
                  <X size={18} strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  className="topbar-icon-btn"
                  title="Apagar selecionadas"
                  aria-label="Apagar selecionadas"
                  disabled={selectedIds.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSelectedNotes();
                  }}
                >
                  <Trash2 size={18} strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>

          <div className="grid-wrap">
            {orderedNotes.map((n) => {
              const isSelected = selectedIds.includes(n.id);

              return (
                <button
                  key={n.id}
                  data-note-id={n.id}
                  className={`note-card ${isSelected ? "note-card--selected" : ""}`}
                  style={{ background: n.bg }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCardClick(n.id);
                  }}
                  type="button"
                >
                  <div className="note-card-text clamp-4">
                    {n.text.trim().length ? n.text : " "}
                  </div>
                  <div className="note-card-meta">Salvo às {formatTime(n.updatedAt)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "edit" && activeNote && (
        <div className="edit-screen" style={{ background: activeNote.bg }}>
          <div className="edit-card" style={{ background: activeNote.bg }}>
            <button
              className="edit-close-btn"
              type="button"
              onClick={exitToGrid}
              aria-label="Fechar nota"
              title="Fechar nota"
            >
              ×
            </button>

            <textarea
              ref={textareaRef}
              className="edit-textarea"
              placeholder="Escreva..."
              value={activeNote.text}
              onChange={(e) => updateActiveText(e.target.value)}
              spellCheck
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
        </div>
      )}
    </div>
  );
}
