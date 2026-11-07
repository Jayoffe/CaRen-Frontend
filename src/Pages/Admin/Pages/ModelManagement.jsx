import FleetServiceNeeds from '../Components/maintenance3d/FleetServiceNeeds.jsx'
import ModelTrainingPanel from '../Components/maintenance3d/ModelTrainingPanel.jsx'
import { PmIcon } from '../Components/maintenance3d/AssessmentOverview.jsx'
import './MaintenancePredictions.css'
import './AssessmentWorkspace.css'

/** /admin/maintenance/model-management: technical model tooling, kept apart from the assessment workflow. */
export default function ModelManagement({ navigate }) {
  return (
    <div className="admin-content pm-page">
      <div className="am-overview">
        <button type="button" className="am-back" onClick={() => navigate('/admin/maintenance/predictions')}><PmIcon name="left" /> Predictive Maintenance</button>
        <header className="am-page-head">
          <div>
            <span className="am-eyebrow">Technical</span>
            <h1>Model Management</h1>
            <p>Training data, evaluation results and the model registry. Assessments and their results do not depend on anything on this page.</p>
          </div>
        </header>
        <ModelTrainingPanel />
        <FleetServiceNeeds onSelect={(id) => navigate(`/admin/maintenance/predictions?vehicle=${id}&view=results`)} />
      </div>
    </div>
  )
}
