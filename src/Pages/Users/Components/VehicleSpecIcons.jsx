export function OutlineIcon({ children, size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

export function GearboxIcon() {
  return <OutlineIcon><circle cx="6" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v10M12 7v10M18 7v3a2 2 0 0 1-2 2H6" /></OutlineIcon>
}

export function FuelIcon() {
  return <OutlineIcon><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M7 8h4" /><path d="M14 12h2a2 2 0 0 1 2 2v3a1.500 1.500 0 0 0 3 0V9l-3-3" /></OutlineIcon>
}

export function SeatsIcon() {
  return <OutlineIcon><circle cx="9" cy="8" r="3.500" /><path d="M3 20c0-3.300 2.700-6 6-6s6 2.700 6 6M16 4.800a3.500 3.500 0 0 1 0 6.400M17.500 14.400c2.100.8 3.500 3 3.500 5.600" /></OutlineIcon>
}
