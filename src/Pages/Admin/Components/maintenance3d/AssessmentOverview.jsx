import { useCallback, useMemo, useState } from 'react'
import { imageUrl } from '../../../../Services/API/api.js'
import { AI_STATUS, REASSESSMENT, RATINGS, SCREENING } from './assessmentStatus.js'
import ModelTrainingPanel from './ModelTrainingPanel.jsx'
import { formatDate, formatKm } from './status.js'

export function Chip({ tone, children, title }) {
  return <span className={`am-chip am-tone-${tone}`} title={title}>{children}</span>
}

/** Fleet-wide assessment state. Nothing here is a prediction. */
export default function AssessmentOverview({ fleet, onSelect }) {
  const [query, setQuery] = useState('')
  const vehicles = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return fleet.vehicles
    return fleet.vehicles.filter((vehicle) => [vehicle.make, vehicle.model, vehicle.year, vehicle.category, vehicle.plate_number]
      .some((value) => String(value ?? '').toLowerCase().includes(text)))
  }, [fleet.vehicles, query])

  const counts = useMemo(() => {
    const result = { safety: 0, due: 0, never: 0, failed: 0 }
    fleet.vehicles.forEach((vehicle) => {
      if (vehicle.safety_warning_count > 0) result.safety += 1
      if (['overdue', 'due_soon'].includes(vehicle.reassessment.status)) result.due += 1
      if (vehicle.reassessment.status === 'never_assessed') result.never += 1
      if (['failed', 'pending'].includes(vehicle.ai_status)) result.failed += 1
    })
    return result
  }, [fleet.vehicles])

  const open = useCallback((id) => () => onSelect(id), [onSelect])

  return (
    <div className="am-overview">
      <header className="am-page-head">
        <div>
          <h1>Predictive Maintenance Overview</h1>
          <p>Condition-based screening covers every category. Machine learning prediction is only available for a category with an accepted model; see Model training and registry below.</p>
        </div>
        <dl className="am-tally">
          <div className={counts.safety ? 'is-critical' : ''}><dt>Safety warnings</dt><dd>{counts.safety}</dd></div>
          <div><dt>Reassessment due</dt><dd>{counts.due}</dd></div>
          <div><dt>Never assessed</dt><dd>{counts.never}</dd></div>
          <div><dt>AI pending or failed</dt><dd>{counts.failed}</dd></div>
        </dl>
      </header>

      <section className="am-section" aria-label="Fleet assessments">
        <div className="am-section-head">
          <h2>Fleet</h2>
          <input type="search" placeholder="Search make, model, plate" aria-label="Search vehicles" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="am-table-wrap">
          <table className="am-table am-table-rows">
            <thead>
              <tr><th>Vehicle</th><th>Odometer</th><th>Latest assessment</th><th>Condition-based screening</th><th>AI analysis</th><th>Monthly reassessment</th></tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => {
                const screening = SCREENING[vehicle.overall_screening]
                const reassessment = REASSESSMENT[vehicle.reassessment.status]
                const ai = AI_STATUS[vehicle.ai_status]
                return (
                  <tr key={vehicle.id}>
                    <td>
                      <div className="am-vehicle-cell">
                        {vehicle.primary_image ? <img src={imageUrl(vehicle.primary_image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /> : <span className="am-thumb-empty" />}
                        <div>
                          <button type="button" className="am-link" onClick={open(vehicle.id)}>{vehicle.make} {vehicle.model} <span>{vehicle.year}</span></button>
                          <small>{[vehicle.plate_number || `Vehicle #${vehicle.id}`, vehicle.category].join(' · ')}</small>
                          {vehicle.data_flags.length > 0 && <small className="am-flag" title={vehicle.data_flags.join(' ')}>{vehicle.data_flags.length} record {vehicle.data_flags.length === 1 ? 'issue' : 'issues'}</small>}
                        </div>
                      </div>
                    </td>
                    <td>{formatKm(vehicle.current_mileage) || <em>Not recorded</em>}</td>
                    <td>{vehicle.assessed_on ? <>{formatDate(vehicle.assessed_on)}<small>{vehicle.assessor_name}</small></> : <em>None</em>}</td>
                    <td>
                      {screening ? <Chip tone={screening.tone}>{screening.label}</Chip> : <Chip tone={RATINGS.not_assessed.tone}>Not Assessed</Chip>}
                      {vehicle.safety_warning_count > 0 && <small className="am-flag-critical">{vehicle.safety_warning_count} safety {vehicle.safety_warning_count === 1 ? 'warning' : 'warnings'}</small>}
                      {vehicle.odometer_flag === 'decrease' && <small className="am-flag">Odometer decreased</small>}
                    </td>
                    <td>{ai ? <Chip tone={ai.tone}>{ai.label}</Chip> : <em>–</em>}</td>
                    <td><Chip tone={reassessment.tone}>{reassessment.label}</Chip>{vehicle.reassessment.due_on && <small>Due {formatDate(vehicle.reassessment.due_on)}</small>}</td>
                  </tr>
                )
              })}
              {vehicles.length === 0 && <tr><td colSpan={6}>No vehicles match your search.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="am-note">Reassessment status is worked out when this page loads. No scheduled job or notification runs in the background.</p>
      </section>

      <ModelTrainingPanel />

    </div>
  )
}
