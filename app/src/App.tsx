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

const BG_PALETTE = ["#F7F7F7", "#F7E7CD", "#F5E6EA", "#D4EFDF", "#D6EAF8"] as const;
const MAX_CHARS = 400;

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

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [view, setView] = useState<View>("edit"); // ✅ abre sempre no modo edição
  const [activeId, setActiveId] = useState<string | null>(null);

  // micro-interações
  const [isFocused, setIsFocused] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const savedPulseTimer = useRef<number | null>(null);

  // persist debounce (leve)
  const saveTimerRef = useRef<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const orderedNotes = useMemo(() => {
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes]);

  const activeNote = useMemo(() => {
    if (!activeId) return null;
    return notes.find((n) => n.id === activeId) ?? null;
  }, [notes, activeId]);

  function scheduleSave(nextNotes: Note[]) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveNotes(nextNotes);
    }, 220);
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
  }

  function deleteNoteSilently(noteId: string) {
    const next = notes.filter((x) => x.id !== noteId);
    setNotes(next);
    scheduleSave(next);

    if (loadLastEdited() === noteId) saveLastEdited(null);
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

  function updateActiveText(nextTextRaw: string) {
    if (!activeId) return;
    const nextText = clampText(nextTextRaw);
    const t = now();

    const next = notes.map((n) =>
      n.id === activeId ? { ...n, text: nextText, updatedAt: t } : n
    );

    setNotes(next);
    scheduleSave(next);
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
    scheduleSave(next);
    pulseSaved();
  }

  // ✅ BOOT: abre sempre no edit (última nota; se vazio cria)
  useEffect(() => {
    const loaded = loadNotes();
    const last = loadLastEdited();

    setNotes(loaded);

    // 1) última nota válida
    if (last && loaded.some((n) => n.id === last)) {
      setActiveId(last);
      setView("edit");
      return;
    }

    // 2) sem notas: cria e abre
    if (loaded.length === 0) {
      const t = now();
      const newNote: Note = {
        id: genId(),
        text: "",
        bg: "#F7F7F7",
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

    // 3) tem notas, mas não tem last válido → abre a mais recente
    const mostRecent = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (mostRecent) {
      setActiveId(mostRecent.id);
      saveLastEdited(mostRecent.id);
      setView("edit");
      return;
    }

    setView("edit");
  }, []);

  // foco apenas desktop (não estoura teclado no mobile)
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

  function onGridClick() {
    // clique no vazio do grid cria nota (quando estiver no grid)
    createNoteAndOpen();
  }

  return (
    <div className="app-root">
      {view === "grid" && (
        <div className="grid-screen" onClick={onGridClick} role="button" tabIndex={0}>
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
            <button className="back-btn" type="button" onClick={exitToGrid}>
              Voltar
            </button>
          </div>

          <div className="edit-wrap">
            <div
              className={`edit-card edit-card--vertical ${isFocused ? "is-focused" : ""}`}
              style={{ background: activeNote.bg }}
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
      )}
    </div>
  );
}
