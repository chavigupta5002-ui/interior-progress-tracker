export function CongratsModal({ propertyName, onClose }: { propertyName: string; onClose: () => void }) {
  return (
    <div className="congrats-backdrop" role="dialog" aria-modal="true" aria-label="Scope of work complete">
      <div className="congrats-card">
        <div className="congrats-emoji">🎉</div>
        <h2>Scope complete!</h2>
        <p>
          Every checklist point for <strong>{propertyName}</strong> has been checked off. Great work!
        </p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
