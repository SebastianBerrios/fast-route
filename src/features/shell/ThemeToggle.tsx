"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage errors (private mode)
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Modo claro" : "Modo oscuro"}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${className}`}
    >
      <span className="text-lg">{dark ? "☀️" : "🌙"}</span>
      <span className="hidden md:inline">{dark ? "Modo claro" : "Modo oscuro"}</span>
    </button>
  );
}
