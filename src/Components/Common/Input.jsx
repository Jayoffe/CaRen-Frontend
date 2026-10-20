export default function Input({ className = '', ...props }) {
  return <input className={`form-control ${className}`.trim()} {...props} />
}
