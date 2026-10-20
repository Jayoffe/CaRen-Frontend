export default function EmptyState({ title, description, action, onAction }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <button className="button button-primary" onClick={onAction}>{action}</button>}
    </div>
  )
}
