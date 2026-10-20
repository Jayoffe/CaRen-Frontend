export default function Select({ className = '', children, ...props }) {
  return <select className={`form-control ${className}`.trim()} {...props}>{children}</select>
}
