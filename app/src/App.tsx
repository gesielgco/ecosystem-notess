import { useState } from "react";

export default function App() {
  const [note, setNote] = useState("Escreva aqui...");

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-[320px] p-6 rounded-2xl shadow-xl bg-[#E9D7B6]">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full h-[200px] bg-transparent resize-none outline-none"
        />
      </div>
    </div>
  );
}
