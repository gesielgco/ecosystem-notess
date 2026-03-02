import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "ecosystem-notes:note";

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [note, setNote] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Carrega do localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setNote(saved);
  }, []);

  // Auto-save (debounce simples)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, note);
      setLastSavedAt(new Date());
    }, 350);
    return () => clearTimeout(t);
  }, [note]);

  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return "Ainda não salvo";
    return `Salvo às ${formatTime(lastSavedAt)}`;
  }, [lastSavedAt]);

  const clear = () => {
    setNote("");
    localStorage.removeItem(STORAGE_KEY);
    setLastSavedAt(new Date());
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-zinc-900">
      {/* Header */}
      <header className="mx-auto max-w-[820px] px-6 pt-10 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notas</h1>
            <p className="mt-1 text-sm text-zinc-500">{savedLabel}</p>
          </div>

          <button
            onClick={clear}
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 active:scale-[0.98]"
            title="Limpar nota"
          >
            Limpar
          </button>
        </div>
      </header>

      {/* Card */}
      <main className="mx-auto max-w-[820px] px-6 pb-12">
        <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-6 py-4">
            <p className="text-sm font-medium text-zinc-700">Nota rápida</p>
          </div>

          <div className="p-4 sm:p-6">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Escreva aqui…"
              className="w-full min-h-[360px] resize-none bg-transparent text-[15px] leading-7 text-zinc-900 placeholder:text-zinc-400 outline-none"
            />
            <p className="mt-3 text-xs text-zinc-500">
              Salva automaticamente no seu navegador (localStorage).
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
