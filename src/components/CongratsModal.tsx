export function CongratsModal({ propertyName, onClose }: { propertyName: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Scope of work complete"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
        <div className="mb-2 text-4xl">🎉</div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">Scope complete!</h2>
        <p className="mb-5 text-sm text-gray-500">
          Every checklist point for <span className="font-medium text-gray-700">{propertyName}</span> has
          been checked off. Great work!
        </p>
        <button
          type="button"
          className="w-full rounded-xl bg-[#FFD700] py-3 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
