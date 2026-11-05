import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Rendered on <body> so that printing the agreement can hide the whole app behind it.
function Dialog({ className = '', labelledBy, busy = false, onClose, children }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
    dialog.querySelector('[data-autofocus]')?.focus()
    // Closing rather than just unmounting returns focus to the button that opened the dialog.
    return () => dialog.close()
  }, [])

  return createPortal(
    <dialog
      ref={ref}
      className={`rv-dialog ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      {children}
    </dialog>,
    document.body,
  )
}

/**
 * The agreement is a stored record of what the renter accepted, so its text is only ever
 * arranged here, never reworded or recalculated from the live reservation.
 */
function parseAgreement(text) {
  const blocks = String(text)
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length)
  const parseRow = (line) => {
    const term = line.match(/^(\d+)\.\s+(.*)$/)
    if (term) return { type: 'term', number: Number(term[1]), text: term[2] }
    const pair = line.match(/^([^:]{1,40}):\s+(.+)$/)
    if (pair) return { type: 'pair', label: pair[1], value: pair[2] }
    return { type: 'text', text: line }
  }
  const sections = blocks.map((lines, index) => (
    index > 0 && /^[A-Z][A-Z &/-]+$/.test(lines[0])
      ? { heading: lines[0], rows: lines.slice(1).map(parseRow) }
      : { heading: null, rows: lines.map(parseRow) }
  ))
  if (!sections.some((section) => section.heading)) return null
  const [intro, ...rest] = sections
  const [titleRow, ...metaRows] = intro.rows
  // A first line that is not plain text means the format has changed, so show the record as it is.
  if (titleRow?.type !== 'text') return null
  return { title: titleRow.text, meta: metaRows, sections: rest }
}

function AgreementRows({ rows }) {
  const pairs = rows.filter((row) => row.type === 'pair')
  const terms = rows.filter((row) => row.type === 'term')
  const lines = rows.filter((row) => row.type === 'text')
  return (
    <>
      {lines.map((row) => <p key={row.text}>{row.text}</p>)}
      {pairs.length > 0 && (
        <dl className="rv-doc-pairs">
          {pairs.map((row) => (
            <div key={row.label} className={/total/i.test(row.label) ? 'is-total' : undefined}>
              <dt>{row.label}:</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {terms.length > 0 && (
        <ol className="rv-doc-terms">
          {terms.map((row) => <li key={row.number} value={row.number}>{row.text}</li>)}
        </ol>
      )}
    </>
  )
}

export function AgreementDialog({ reservation, onClose }) {
  const agreement = parseAgreement(reservation.contract_text)
  return (
    <Dialog className="rv-agreement" labelledBy="rv-agreement-title" onClose={onClose}>
      <div className="rv-agreement-bar">
        <h2 id="rv-agreement-title">Rental agreement</h2>
        <div>
          <button type="button" className="rv-btn rv-btn-outline" onClick={() => window.print()}>Print</button>
          <button type="button" className="rv-btn rv-btn-primary" data-autofocus onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="rv-agreement-scroll">
        {agreement ? (
          <article className="rv-doc">
            <header className="rv-doc-head">
              <h3>{agreement.title}</h3>
              <AgreementRows rows={agreement.meta} />
            </header>
            {agreement.sections.map((section, index) => (section.heading ? (
              <section className="rv-doc-section" key={section.heading}>
                <h4>{section.heading}</h4>
                <div><AgreementRows rows={section.rows} /></div>
              </section>
            ) : (
              <footer className="rv-doc-closing" key={index}><AgreementRows rows={section.rows} /></footer>
            )))}
          </article>
        ) : (
          <pre className="rv-doc-plain">{reservation.contract_text}</pre>
        )}
      </div>
    </Dialog>
  )
}

export function CancelDialog({ reservation, dates, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  return (
    <Dialog className="rv-small" labelledBy="rv-cancel-title" busy={busy} onClose={onClose}>
      <div className="rv-small-body">
        <h2 id="rv-cancel-title">Cancel this reservation?</h2>
        <p>{reservation.make} {reservation.model}, {dates}. You can't undo this. To rent on these dates again, you'd make a new reservation.</p>
        {error && <p className="rv-field-error" role="alert">{error}</p>}
        <div className="rv-small-actions">
          <button type="button" className="rv-btn rv-btn-outline" data-autofocus disabled={busy} onClick={onClose}>Keep reservation</button>
          <button type="button" className="rv-btn rv-btn-danger" disabled={busy} onClick={confirm}>{busy ? 'Cancelling…' : 'Cancel reservation'}</button>
        </div>
      </div>
    </Dialog>
  )
}

export function PaymentDialog({ reservation, amount, onCheckout, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onCheckout()
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  return (
    <Dialog className="rv-small" labelledBy="rv-pay-title" busy={busy} onClose={onClose}>
      <form className="rv-small-body" onSubmit={submit} noValidate>
        <h2 id="rv-pay-title">Pay online with GCash</h2>
        <p>{reservation.make} {reservation.model}, reservation #{reservation.id}</p>
        <dl className="rv-pay-summary">
          <div>
            <dt>Exact amount</dt>
            <dd className="rv-pay-amount">{amount}</dd>
          </div>
        </dl>
        {error && <p className="rv-field-error" role="alert">{error}</p>}
        <p className="rv-hint">Xendit will open a secure checkout where you can choose GCash. Vehicle handover remains blocked until payment is confirmed.</p>
        <div className="rv-small-actions">
          <button type="button" className="rv-btn rv-btn-outline" data-autofocus disabled={busy} onClick={onClose}>Not now</button>
          <button type="submit" className="rv-btn rv-btn-primary" disabled={busy}>{busy ? 'Opening checkout...' : 'Continue to payment'}</button>
        </div>
      </form>
    </Dialog>
  )
}
