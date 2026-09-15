import { Plus } from 'lucide-react'

// The single reusable "add" trigger for the whole app — new property, new
// Task, new Subtask, new Sub-subtask — always fixed bottom-right.
export function FloatingActionButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-5 bottom-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFD700] text-black shadow-[0_4px_20px_-4px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 hover:bg-yellow-400 focus:outline-none focus:ring-4 focus:ring-yellow-200 active:scale-95"
    >
      <Plus size={28} strokeWidth={2.5} />
    </button>
  )
}
