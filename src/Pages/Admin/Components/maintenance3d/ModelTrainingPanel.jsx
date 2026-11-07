import { useCallback, useEffect, useState } from 'react'
import { acceptModel, getTrainingDataset, getTrainingOverview, revokeModel, startTraining } from '../../../../Services/API/assessmentAPI.js'
import { Chip } from './AssessmentOverview.jsx'
import { formatDate, formatKm } from './status.js'

const MODEL_STATUS = {
  evaluated_pending: { label: 'Passed, awaiting review', tone: 'pending' },
  evaluated_accepted: { label: 'Accepted', tone: 'good' },
  evaluated_rejected: { label: 'Rejected', tone: 'failed' },
  superseded: { label: 'Superseded', tone: 'na' },
}

const EXCLUSIONS = {
  not_verified: 'Not verified',
  no_usable_label: 'No usable result',
  demo_vehicle: 'Demo vehicle',
  missing_vehicle_history: 'Missing vehicle history',
  missing_odometer: 'No odometer on the assessment',
  odometer_decrease: 'Odometer decreased',
  missing_outcome_date: 'No outcome date',
  category_not_rated: 'Category not rated',
  outcome_before_assessment: 'Outcome before the assessment',
  no_lead_time: 'Outcome on the assessment day',
  outside_horizon: 'Outside the prediction horizon',
  invalid_mileage: 'Invalid mileage',
  duplicate_outcome: 'Duplicate outcome',
  duplicate_event: 'Same event recorded twice',
  conflicting_outcomes: 'Conflicting results',
}

function Evaluation({ entry, active, onAccept, onRevoke, busy }) {
  const report = entry.report
  const metrics = report.metrics
  const status = MODEL_STATUS[entry.status] || { label: entry.status, tone: 'na' }
  const matrix = metrics?.confusion_matrix
  return (
    <details className="am-result" open={entry.status === 'evaluated_pending' || active}>
      <summary>
        <span>{entry.model_version}</span>
        <span className="am-result-chips">{active && <Chip tone="good">Serving</Chip>}<Chip tone={status.tone}>{status.label}</Chip></span>
      </summary>
      <div className="am-result-body">
        <dl className="am-status-grid">
          <div><dt>Trained</dt><dd>{formatDate(entry.trained_at)}</dd></div>
          <div><dt>Algorithm</dt><dd>{report.algorithm?.replaceAll('_', ' ') || 'None fitted'}</dd></div>
          <div><dt>Dataset</dt><dd>{report.dataset.rows} records, {report.dataset.vehicles} vehicles</dd></div>
          <div><dt>Faults / healthy</dt><dd>{report.dataset.faults} / {report.dataset.healthy}</dd></div>
          {report.periods.training && <div><dt>Training period</dt><dd>{formatDate(report.periods.training[0])} to {formatDate(report.periods.training[1])}</dd></div>}
          {report.periods.test && <div><dt>Test period</dt><dd>{formatDate(report.periods.test[0])} to {formatDate(report.periods.test[1])}</dd></div>}
        </dl>
        <p className="am-note">{report.methodology}</p>

        {metrics && (
          <>
            <h4>Test results ({metrics.records} later records, not used for training)</h4>
            <dl className="am-status-grid">
              <div><dt>Recall</dt><dd>{metrics.recall}</dd></div>
              <div><dt>Recall, 95% lower bound</dt><dd>{metrics.recall_lower_bound}</dd></div>
              <div><dt>Precision</dt><dd>{metrics.precision}</dd></div>
              <div><dt>F1-score</dt><dd>{metrics.f1}</dd></div>
              <div><dt>Accuracy</dt><dd>{metrics.accuracy}</dd></div>
            </dl>
            <table className="am-table am-matrix" aria-label="Confusion matrix">
              <thead><tr><th /><th>Model: no fault</th><th>Model: fault</th></tr></thead>
              <tbody>
                <tr><th>Actually healthy</th><td>{matrix.true_negative}</td><td>{matrix.false_positive} false alarms</td></tr>
                <tr><th>Actual fault</th><td className={matrix.false_negative ? 'am-missed' : ''}>{matrix.false_negative} missed faults</td><td>{matrix.true_positive}</td></tr>
              </tbody>
            </table>
            {matrix.false_negative > 0 && (
              <p className="am-flag-critical">{matrix.false_negative} verified {matrix.false_negative === 1 ? 'fault' : 'faults'} would not have been flagged{report.safety_critical ? ' in a safety-critical category' : ''}.</p>
            )}
            {report.unseen_vehicle_metrics
              ? <p className="am-note">On {report.unseen_vehicle_metrics.records} records from vehicles not seen in training: recall {report.unseen_vehicle_metrics.recall}, precision {report.unseen_vehicle_metrics.precision}.</p>
              : <p className="am-note">The test period had no vehicles unseen in training, so performance on new vehicles is unknown.</p>}
          </>
        )}

        {report.acceptance_criteria.length > 0 && (
          <>
            <h4>Acceptance criteria</h4>
            <table className="am-table">
              <thead><tr><th>Criterion</th><th>Required</th><th>Actual</th><th>Result</th></tr></thead>
              <tbody>
                {report.acceptance_criteria.map((item) => (
                  <tr key={item.name}><td>{item.name}</td><td>{item.required}</td><td>{item.actual ?? 'n/a'}</td><td><Chip tone={item.passed ? 'good' : 'failed'}>{item.passed ? 'Passed' : 'Failed'}</Chip></td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <ul className="am-reasons">{report.decision_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {entry.revoked_reason && <p className="am-note">Withdrawn: {entry.revoked_reason}</p>}

        <div className="am-outcome-actions">
          {entry.status === 'evaluated_pending' && <button type="button" className="is-primary" disabled={busy} onClick={() => onAccept(entry)}>Accept this model</button>}
          {active && <button type="button" disabled={busy} onClick={() => onRevoke(entry)}>Withdraw this model</button>}
        </div>
      </div>
    </details>
  )
}

function DatasetReview({ dataset }) {
  return (
    <div className="am-dataset">
      <h4>Eligible records ({dataset.rows.length})</h4>
      {dataset.rows.length === 0 ? <p className="am-note">No records qualify yet.</p> : (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead><tr><th>Vehicle</th><th>Assessed</th><th>Odometer</th><th>Rating</th><th>Verified result</th><th>Outcome date</th><th>Outcome mileage</th></tr></thead>
            <tbody>
              {dataset.rows.slice(0, 100).map((row) => (
                <tr key={row.outcome_id}>
                  <td>{row.plate_number || `#${row.vehicle_id}`}</td>
                  <td>{formatDate(row.assessed_on)}</td>
                  <td>{formatKm(row.odometer_km)}</td>
                  <td>{row.rating}</td>
                  <td>{row.label === 'fault' ? 'Fault' : 'Healthy'}</td>
                  <td>{formatDate(row.outcome_date)}</td>
                  <td>{row.outcome_mileage_km === null ? <em>Not recorded</em> : formatKm(row.outcome_mileage_km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dataset.rows.length > 100 && <p className="am-note">Showing the first 100 of {dataset.rows.length}.</p>}
        </div>
      )}
    </div>
  )
}

/** Data sufficiency, training, evaluation and the model registry, per category. */
export default function ModelTrainingPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [training, setTraining] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dataset, setDataset] = useState({ key: null, value: null })

  const load = useCallback(async () => {
    try {
      setData(await getTrainingOverview())
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  async function act(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function train(key) {
    setTraining(key)
    await act(() => startTraining(key))
    setTraining(null)
  }

  async function review(key) {
    setError('')
    try {
      const value = await getTrainingDataset(key)
      setDataset({ key, value })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function accept(category, entry) {
    if (window.confirm(`Accept ${entry.model_version}? It will start giving predictions for ${category.name}.`)) {
      void act(() => acceptModel(category.key, entry.model_version))
    }
  }

  function revoke(category, entry) {
    const reason = window.prompt(`Why withdraw ${entry.model_version}? ${category.name} will return to prediction unavailable.`)
    if (reason?.trim()) void act(() => revokeModel(category.key, reason.trim()))
  }

  if (!data) {
    return error ? <p className="am-error" role="alert">{error}</p> : <p className="am-note" role="status">Loading model training…</p>
  }

  const { totals, categories } = data.sufficiency
  const { policy } = data
  const qualified = categories.filter((category) => category.status === 'sufficient').length
  const models = Object.fromEntries(data.models.map((model) => [model.key, model]))

  return (
    <>
      <section className="am-section" aria-label="Data sufficiency">
        <div className="am-section-head">
          <h2>Data sufficiency</h2>
          <Chip tone={qualified ? 'good' : 'insufficient'}>{qualified} of {categories.length} categories qualify</Chip>
        </div>
        <dl className="am-tally am-tally-inline">
          <div><dt>Verified outcomes</dt><dd>{totals.verified_outcomes}</dd></div>
          <div><dt>Eligible for training</dt><dd>{totals.eligible}</dd></div>
          <div><dt>Contributing vehicles</dt><dd>{totals.vehicles}</dd></div>
          <div><dt>Confirmed faults</dt><dd>{totals.faults}</dd></div>
          <div><dt>Healthy outcomes</dt><dd>{totals.healthy}</dd></div>
        </dl>
        <p className="am-note">
          Each category needs {policy.min_outcomes_per_category} eligible outcomes from at least {policy.min_vehicles} vehicles, with no vehicle above {Math.round(policy.max_vehicle_share * 100)}%,
          and at least {policy.min_failures} faults and {policy.min_healthy} healthy results. Only verified outcomes within {policy.horizon_days} days of an assessment count. Demo vehicles do not count.
        </p>
        <div className="am-table-wrap">
          <table className="am-table">
            <thead><tr><th>Category</th><th>Eligible</th><th>Still needed</th><th>Vehicles</th><th>Faults</th><th>Healthy</th><th>Status</th></tr></thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.key}>
                  <td>{category.name}</td>
                  <td>{category.eligible} / {category.minimum}</td>
                  <td>{category.remaining}</td>
                  <td>{category.vehicles}</td>
                  <td>{category.faults}</td>
                  <td>{category.healthy}</td>
                  <td>
                    <Chip tone={category.status === 'sufficient' ? 'good' : 'insufficient'}>{category.status === 'sufficient' ? 'Sufficient' : 'Insufficient Data'}</Chip>
                    {category.blockers.map((blocker) => <small key={blocker}>{blocker}</small>)}
                    {Object.entries(category.excluded_by_reason).map(([reason, count]) => <small key={reason}>Excluded: {EXCLUSIONS[reason] || reason} ({count})</small>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="am-section" aria-label="Model training and registry">
        <div className="am-section-head"><h2>Model training and registry</h2></div>
        {!data.service.reachable && <p className="am-banner">The AI service could not be reached, so model status is unknown and no training can run.</p>}
        {error && <p className="am-error" role="alert">{error}</p>}
        <p className="am-note">Condition-based screening always runs. A machine learning prediction appears only for a category with an accepted model, and each category unlocks on its own.</p>
        <div className="am-models">
          {categories.map((category) => {
            const model = models[category.key]
            const ready = category.status === 'sufficient'
            const versions = model?.versions || []
            const open = dataset.key === category.key
            return (
              <article key={category.key} className="am-model-row">
                <header>
                  <strong>{category.name}{category.safety_critical && <small> Safety-critical</small>}</strong>
                  <Chip tone={model?.available ? 'good' : 'not-assessed'}>{model?.available ? 'ML prediction enabled' : 'Prediction unavailable'}</Chip>
                  <span className="am-model-actions">
                    <button type="button" onClick={() => (open ? setDataset({ key: null, value: null }) : review(category.key))}>{open ? 'Hide dataset' : 'Review dataset'}</button>
                    <button type="button" className={ready ? 'is-primary' : ''} disabled={!ready || busy || !data.service.reachable} title={ready ? '' : 'This category does not have enough eligible data.'} onClick={() => train(category.key)}>
                      {training === category.key ? 'Training…' : 'Start training'}
                    </button>
                  </span>
                </header>
                {training === category.key && <p className="am-note" role="status">Training and evaluating {category.name}. This page updates when it finishes.</p>}
                {model && !model.available && versions.length > 0 && <p className="am-note">{model.reason}</p>}
                {open && dataset.value && <DatasetReview dataset={dataset.value} />}
                {versions.map((entry) => (
                  <Evaluation key={entry.model_version} entry={entry} active={model.active_version === entry.model_version} busy={busy} onAccept={(item) => accept(category, item)} onRevoke={(item) => revoke(category, item)} />
                ))}
              </article>
            )
          })}
        </div>
        {data.runs.length > 0 && (
          <details className="am-runs">
            <summary>Training history ({data.runs.length})</summary>
            <table className="am-table">
              <thead><tr><th>Started</th><th>Category</th><th>Run</th><th>Records</th><th>Vehicles</th><th>Evaluation</th></tr></thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.started_at}</td>
                    <td>{run.category_key}</td>
                    <td>{run.status}{run.error_message ? `: ${run.error_message}` : ''}</td>
                    <td>{run.dataset_rows}</td>
                    <td>{run.dataset_vehicles}</td>
                    <td>{MODEL_STATUS[run.evaluation_status]?.label || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </>
  )
}
