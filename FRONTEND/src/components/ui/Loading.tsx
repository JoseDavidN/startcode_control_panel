export const Loading = () => (
  <div className="flex items-center justify-center h-full w-full min-h-[200px]">
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-hairline" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 border-r-pink-400 animate-spin" />
      </div>
      <span className="text-xs text-white/40 font-medium tracking-wider uppercase">Cargando…</span>
    </div>
  </div>
);
