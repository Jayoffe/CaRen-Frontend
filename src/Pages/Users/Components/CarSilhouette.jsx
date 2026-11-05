import './CarSilhouette.css'

const WHEEL_ARCHES = 'L199 68A15 15 0 0 0 169 68L71 68A15 15 0 0 0 41 68'

const SILHOUETTES = {
  sedan: {
    body: `M12 62C12 52 18 47 30 45L62 41C76 28 92 20 116 20L140 20C158 20 172 28 186 41L214 46C224 48 230 54 230 62L230 68${WHEEL_ARCHES}L12 68Z`,
    windows: 'M73 41C83 31 97 26 114 26L124 26L124 41ZM131 26L140 26C154 26 165 32 175 41L131 41Z',
  },
  hatchback: {
    body: `M16 62L16 42C16 36 20 32 26 30L48 22C56 19 64 18 74 18L132 18C150 18 166 27 180 41L212 46C223 48 230 54 230 62L230 68${WHEEL_ARCHES}L16 68Z`,
    windows: 'M30 41L34 34C36 31 40 29 44 28L62 25L62 41ZM69 24L112 24L112 41L69 41ZM119 24L132 24C147 24 159 31 169 41L119 41Z',
  },
  suv: {
    body: `M24 62L26 30L44 10C46 7 49 6 53 6L140 6C148 6 154 9 160 15L180 36L206 41C213 43 216 49 216 58L216 68${WHEEL_ARCHES}L24 68Z`,
    windows: 'M36 32L49 14C50 13 51 12 53 12L94 12L94 32ZM101 12L140 12C145 12 149 14 153 18L168 32L101 32Z',
  },
  van: {
    body: `M12 62L12 26C12 17 19 10 28 10L150 10C160 10 168 14 175 22L197 44L218 48C226 50 230 55 230 62L230 68${WHEEL_ARCHES}L12 68Z`,
    windows: 'M26 18L66 18L66 40L26 40ZM73 18L112 18L112 40L73 40ZM119 18L150 18C156 18 162 21 166 25L183 40L119 40Z',
  },
  pickup: {
    body: `M12 68L12 40L100 40L112 16C114 13 116 12 120 12L166 12C172 12 176 14 180 18L198 40L218 45C226 47 230 53 230 62L230 68${WHEEL_ARCHES}Z`,
    windows: 'M110 40L120 20C121 18.500 122 18 124 18L146 18L146 40ZM153 18L166 18C170 18 173 19 175 22L188 40L153 40Z',
  },
}

function bodyTypeOf(category) {
  const value = String(category || '').toLowerCase()
  if (/suv|crossover|utility/.test(value)) return 'suv'
  if (/hatch/.test(value)) return 'hatchback'
  if (/van|mpv/.test(value)) return 'van'
  if (/pick-?up|truck/.test(value)) return 'pickup'
  if (/sedan|coupe|compact|economy|luxury|sport/.test(value)) return 'sedan'
  return null
}

export default function CarSilhouette({ category }) {
  const shape = SILHOUETTES[bodyTypeOf(category)]
  if (!shape) return null
  return (
    <svg className="car-silhouette" viewBox="0 0 240 84" aria-hidden="true">
      <path className="car-silhouette-body" d={shape.body} />
      <path className="car-silhouette-glass" d={shape.windows} />
      <circle className="car-silhouette-tyre" cx="56" cy="68" r="12" />
      <circle className="car-silhouette-hub" cx="56" cy="68" r="5" />
      <circle className="car-silhouette-tyre" cx="184" cy="68" r="12" />
      <circle className="car-silhouette-hub" cx="184" cy="68" r="5" />
    </svg>
  )
}
