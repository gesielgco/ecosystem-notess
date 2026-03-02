import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "ecosystem-notes:note:v1";

export default function App() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"salvo" | "editando">("salvo");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Carrega do localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setNote(saved);
    // foco automático
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // Autosave (debounce simples)
  useEffect(() => {
    setStatus("editando");
    const id = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, note);
      setStatus("salvo");
    }, 400);

    return () => clearTimeout(id);
  }, [note]);

  const counter = useMemo(() => {
    const chars = note.length;
    const words = note.trim() ? note.trim().split(/\s+/).length : 0;
    return { chars, words };
  }, [note]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] rounded-3xl border border-black/10 shadow-sm">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗒️</span>
            <h1 className="text-sm font-semibold tracking-tight">Notas</h1>
          </div>

          <div className="text-xs text-black/50">
            {status === "salvo" ? "Salvo" : "Editando…"}
          </div>
        </div>

        <div className="px-6 pb-2">
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escreva aqui…"
            className="w-full h-[320px] resize-none bg-transparent outline-none text-[15px] leading-6 placeholder:text-black/30"
          />
        </div>

        <div className="px-6 pb-5 flex items-center justify-between text-xs text-black/45">
          <span>{counter.words} palavras</span>
          <span>{counter.chars} caracteres</span>
        </div>
      </div>
    </div>
  );
}
