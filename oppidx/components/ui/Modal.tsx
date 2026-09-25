'use client'

/** The one popup shell for every "quick action" across the ecosystem
 * (find a person, host a gathering, add a guide, read the policy digest)
 * — same overlay/card language everywhere so switching between them never
 * feels like leaving to a different product. */
export function Modal({ onClose, maxWidth = 440, children }: { onClose: () => void; maxWidth?: number; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}
    >
      <div onClick={e => e.stopPropagation()} className="card-box" style={{ padding: '28px 26px', maxWidth, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: subtitle ? 6 : 16, gap: 10 }}>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--ink)' }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{subtitle}</p>}
      </div>
      <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--ink-2)', lineHeight: 1, flex: 'none' }}>×</button>
    </div>
  )
}

export function modalInputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
    fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--card)', color: 'var(--ink)',
    outline: 'none', marginBottom: 14,
  }
}

export function ModalSubmitButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: '11px 24px', borderRadius: 2, border: 'none', cursor: 'pointer',
        background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
        fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', boxShadow: '3px 3px 0 var(--shadow)',
        opacity: props.disabled ? 0.6 : 1, width: '100%',
        ...props.style,
      }}
    >
      {children}
    </button>
  )
}

export function ModalError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>{children}</div>
}
