"use client";

import { useState } from "react";
import { addCustomTicker, removeCustomTicker } from "@/lib/api";

export default function SettingsPage() {
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");

  async function handleAdd() {
    if (!input.trim()) return;
    await addCustomTicker(input.trim().toUpperCase());
    setMessage(`${input.toUpperCase()} 추가됨`);
    setInput("");
  }

  async function handleRemove() {
    if (!input.trim()) return;
    await removeCustomTicker(input.trim().toUpperCase());
    setMessage(`${input.toUpperCase()} 제거됨`);
    setInput("");
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-xl font-semibold">설정</h2>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">커스텀 종목 관리</h3>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="TICKER (예: AMD)"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500"
        />
        <div className="flex gap-2">
          <button onClick={handleAdd}
            className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg py-2 transition-colors">
            추가
          </button>
          <button onClick={handleRemove}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg py-2 transition-colors">
            제거
          </button>
        </div>
        {message && <p className="text-xs text-emerald-400">{message}</p>}
      </div>
    </div>
  );
}
