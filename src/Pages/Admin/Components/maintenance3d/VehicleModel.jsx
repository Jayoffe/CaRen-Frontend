import { createContext, useContext, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { heightAt } from './rigs.js'

const HIGHLIGHT = '#36b6ff'
const HOVER = '#8fd3ff'

// Highlight / ghost state for the component group a mesh belongs to.
const PartState = createContext({ active: false, hovered: false, ghost: false })

function Mat({ color, metalness = 0.35, roughness = 0.55, emissive = '#000000', emissiveIntensity = 0 }) {
  const { active, hovered, ghost } = useContext(PartState)
  return (
    <meshStandardMaterial
      key={ghost ? 'ghost' : 'solid'}
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={active ? HIGHLIGHT : hovered ? HOVER : emissive}
      emissiveIntensity={active ? 0.42 : hovered ? 0.25 : emissiveIntensity}
      transparent={ghost}
      opacity={ghost ? 0.16 : 1}
      depthWrite={!ghost}
    />
  )
}

/** A selectable component: pointer events select it; children render with its highlight state. */
function Part({ id, interaction, children }) {
  const { selectedKey, hoveredKey, ghosted, available, onHover, onSelect } = interaction
  const enabled = available.has(id)
  const state = useMemo(() => ({
    active: selectedKey === id,
    hovered: hoveredKey === id && selectedKey !== id,
    ghost: ghosted.has(id),
  }), [selectedKey, hoveredKey, ghosted, id])

  return (
    <PartState.Provider value={state}>
      <group
        name={id}
        userData={{ componentKey: id }}
        onPointerOver={enabled ? (event) => { event.stopPropagation(); onHover(id) } : undefined}
        onPointerOut={enabled ? () => onHover(null) : undefined}
        onClick={enabled ? (event) => { event.stopPropagation(); onSelect(id) } : undefined}
      >
        {children}
      </group>
    </PartState.Provider>
  )
}

/** Cylinder between two points. */
function Rod({ from, to, radius, color, metalness = 0.5, roughness = 0.4, segments = 12 }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const direction = end.clone().sub(start)
    return {
      position: start.clone().add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      length: direction.length(),
    }
  }, [from, to])
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, segments]} />
      <Mat color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

/** Side profile with wheel-arch cut-outs for every axle inside its x range. */
function profileShape(points, axles, wheelRadius, bottom) {
  const shape = new THREE.Shape()
  const frontX = points[0][0]
  const rearX = points[points.length - 1][0]
  shape.moveTo(rearX, bottom)
  axles
    .filter((axle) => axle > rearX && axle < frontX)
    .sort((a, b) => a - b)
    .forEach((axle) => {
      const radius = wheelRadius + 0.07
      const dy = bottom - wheelRadius
      const dx = Math.sqrt(radius * radius - dy * dy)
      shape.lineTo(axle - dx, bottom)
      shape.absarc(axle, wheelRadius, radius, Math.atan2(dy, -dx), Math.atan2(dy, dx), true)
    })
  shape.lineTo(frontX, bottom)
  points.forEach(([x, y]) => shape.lineTo(x, y))
  shape.closePath()
  return shape
}

const SECTION = [ // normalised half cross-section: [u (width), v (height)], bottom centre to roof centre
  [0, 0], [0.82, 0], [0.93, 0.03], [0.985, 0.1], [1, 0.22], [1, 'belt'], [0.86, 0.985], [0.72, 1], [0, 1],
]

function bodyFrame(spec) {
  const belt = Math.min(...spec.windows.map(([, y]) => y)) - 0.03
  const frontX = Math.max(...spec.profile.map(([x]) => x))
  const rearX = Math.min(...spec.profile.map(([x]) => x))
  const half = Math.max(frontX, -rearX)
  const archRadius = spec.wheelRadius + 0.07
  const planFactor = (x) => 1 - 0.12 * Math.pow(Math.abs(x) / half, 6)
  const bottomAt = (x) => [spec.frontAxle, spec.rearAxle].reduce((bottom, axle) => {
    const dx = x - axle
    return Math.abs(dx) < archRadius ? Math.max(bottom, spec.wheelRadius + Math.sqrt(archRadius * archRadius - dx * dx)) : bottom
  }, spec.clearance)
  // Half-width of the body surface at (x, y): used to lay windows and trim onto it.
  const surfaceZ = (x, y) => {
    const top = heightAt(spec.profile, x) ?? belt
    const u = y <= belt ? 1 : 1 - 0.14 * THREE.MathUtils.clamp((y - belt) / Math.max(top - belt, 0.01), 0, 1)
    return (spec.width / 2) * planFactor(x) * u
  }
  return { belt, frontX, rearX, planFactor, bottomAt, surfaceZ }
}

/** Smooth body loft: cross-sections along x with rounded corners, tuck-under and tumblehome. */
function loftBody(spec) {
  const frame = bodyFrame(spec)
  const { frontX, rearX } = frame
  const xs = []
  const steps = 140
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    xs.push(rearX + (frontX - rearX) * (0.5 - 0.5 * Math.cos(Math.PI * t))) // denser at the ends
  }
  const ring = []
  const positions = []
  xs.forEach((x) => {
    const top = Math.max(heightAt(spec.profile, x) ?? frame.belt, frame.bottomAt(x) + 0.05)
    const bottom = Math.min(frame.bottomAt(x), top - 0.05)
    const span = top - bottom
    const beltV = THREE.MathUtils.clamp((frame.belt - bottom) / span, 0.25, 0.97)
    const halfWidth = (spec.width / 2) * frame.planFactor(x)
    const section = SECTION.map(([u, v]) => [u, v === 'belt' ? beltV : v])
    const points = [
      ...section.map(([u, v]) => [-u, v]),
      ...section.slice(0, -1).reverse().map(([u, v]) => [u, v]),
    ].filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1])
    ring.length = points.length
    points.forEach(([u, v]) => positions.push(x, bottom + v * span, u * halfWidth))
  })

  const perRing = ring.length
  const indices = []
  for (let slice = 0; slice < xs.length - 1; slice += 1) {
    for (let index = 0; index < perRing - 1; index += 1) {
      const a = slice * perRing + index
      const b = a + perRing
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  // End caps (front and rear faces) as triangle fans from each ring's centroid.
  const vertexCount = positions.length / 3
  ;[[0, false], [xs.length - 1, true]].forEach(([slice, flip], cap) => {
    let cx = 0; let cy = 0; let cz = 0
    for (let index = 0; index < perRing; index += 1) {
      const offset = (slice * perRing + index) * 3
      cx += positions[offset]; cy += positions[offset + 1]; cz += positions[offset + 2]
    }
    positions.push(cx / perRing, cy / perRing, cz / perRing)
    const centre = vertexCount + cap
    for (let index = 0; index < perRing - 1; index += 1) {
      const a = slice * perRing + index
      if (flip) indices.push(centre, a, a + 1)
      else indices.push(centre, a + 1, a)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Side-window shape laid onto the body surface. */
function windowGeometry(spec, side) {
  const { surfaceZ } = bodyFrame(spec)
  const geometry = new THREE.ShapeGeometry(new THREE.Shape(spec.windows.map(([x, y]) => new THREE.Vector2(x, y))), 8)
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    position.setZ(index, side * (surfaceZ(position.getX(index), position.getY(index)) + 0.022))
  }
  geometry.computeVertexNormals()
  return geometry
}

function extrude(shape, depth, bevel = 0.05) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 18,
  })
  geometry.translate(0, 0, -(depth - bevel * 2) / 2)
  return geometry
}

/** Disposes a memoised geometry when it is replaced or unmounted. */
function useDisposeOnChange(value) {
  useEffect(() => () => value.dispose(), [value])
  return value
}

/** Glass quad along a profile segment, spanning the vehicle width. */
function GlassPanel({ segment, width }) {
  const [[x1, y1], [x2, y2]] = segment
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  const offset = 0.012 / length
  return (
    <group position={[(x1 + x2) / 2 + dy * offset, (y1 + y2) / 2 - dx * offset, 0]} rotation={[0, 0, Math.atan2(dy, dx)]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length * 0.96, width]} />
        <meshPhysicalMaterial color="#0d1b26" roughness={0.08} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Wheel({ position, radius, width, spokes = 5, rimColor = '#b9c1c8' }) {
  const tube = Math.min(width / 2, radius * 0.3)
  const rimRadius = radius - tube * 2
  return (
    <group position={position}>
      <mesh scale={[1, 1, width / 2 / tube]}>
        <torusGeometry args={[radius - tube, tube, 14, 40]} />
        <Mat color="#1b1d20" roughness={0.92} metalness={0.05} />
      </mesh>
      <mesh>
        <torusGeometry args={[rimRadius, 0.022, 8, 36]} />
        <Mat color={rimColor} metalness={0.8} roughness={0.28} />
      </mesh>
      {Array.from({ length: spokes }, (_, index) => (
        <mesh key={index} rotation={[0, 0, (index / spokes) * Math.PI * 2]} position={[0, 0, 0]}>
          <boxGeometry args={[0.035, rimRadius * 2, 0.03]} />
          <Mat color={rimColor} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.16, radius * 0.16, width * 0.7, 16]} />
        <Mat color="#4a5158" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  )
}

function BrakeAssembly({ position, radius, side, caliperAngle = 0.5 }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, 0.028, 32]} />
        <Mat color="#8e959c" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh position={[Math.cos(caliperAngle) * radius * 0.82, Math.sin(caliperAngle) * radius * 0.82, side * 0.02]} rotation={[0, 0, caliperAngle]}>
        <boxGeometry args={[0.07, radius * 0.75, 0.07]} />
        <Mat color="#b23a2f" metalness={0.4} roughness={0.45} />
      </mesh>
    </group>
  )
}

function Spring({ geometry, position }) {
  return (
    <group position={position}>
      <mesh geometry={geometry}>
        <Mat color="#d0a338" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, geometry.userData.height / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, geometry.userData.height * 1.1, 10]} />
        <Mat color="#3b4148" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  )
}

function useSpringGeometry(height, radius) {
  const geometry = useMemo(() => {
    const turns = 6
    const points = Array.from({ length: turns * 24 + 1 }, (_, index) => {
      const t = index / (turns * 24)
      const angle = t * turns * Math.PI * 2
      return new THREE.Vector3(Math.cos(angle) * radius, t * height, Math.sin(angle) * radius)
    })
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 24, 0.012, 6, false)
    tube.userData.height = height
    return tube
  }, [height, radius])
  return useDisposeOnChange(geometry)
}

function Tube({ points, radius, color, metalness = 0.75, roughness = 0.35 }) {
  const key = JSON.stringify(points)
  const geometry = useDisposeOnChange(useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(JSON.parse(key).map((point) => new THREE.Vector3(...point))), 48, radius, 10, false),
    [key, radius],
  ))
  return (
    <mesh geometry={geometry}>
      <Mat color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

function CarModel({ rig, paint, xray, interaction }) {
  const s = rig.spec
  const { half, track, width, wheelRadius: R, tireWidth } = s
  const [ex, ey] = s.engine
  const [ew, eh, ed] = s.engineSize
  const axles = [s.frontAxle, s.rearAxle]

  const body = useDisposeOnChange(useMemo(() => loftBody(s), [s]))
  const surfaceZ = useMemo(() => bodyFrame(s).surfaceZ, [s])
  const leftWindows = useDisposeOnChange(useMemo(() => windowGeometry(s, -1), [s]))
  const rightWindows = useDisposeOnChange(useMemo(() => windowGeometry(s, 1), [s]))
  const bedSide = useDisposeOnChange(useMemo(() => (s.bed
    ? extrude(profileShape([[s.bed.front, s.clearance + 0.12], [s.bed.front, s.bed.top], [s.bed.rear, s.bed.top], [s.bed.rear, s.clearance + 0.12]], [s.frontAxle, s.rearAxle], s.wheelRadius, s.clearance + 0.12), 0.07, 0.015)
    : new THREE.BufferGeometry()), [s]))
  const spring = useSpringGeometry(R * 1.05, 0.07)

  const bodyMaterial = (
    <meshPhysicalMaterial
      key={xray ? 'xray' : 'solid'}
      color={paint}
      metalness={0.45}
      roughness={0.32}
      clearcoat={0.9}
      clearcoatRoughness={0.18}
      transparent={xray}
      opacity={xray ? 0.14 : 1}
      depthWrite={!xray}
    />
  )
  // An opaque body blocks clicks on the parts it hides; in x-ray mode it ignores the pointer.
  const bodyEvents = xray
    ? { raycast: () => null }
    : { onClick: (event) => event.stopPropagation(), onPointerOver: (event) => { event.stopPropagation(); interaction.onHover(null) } }

  const wheelZ = { left: -track, right: track }
  const wheels = [
    ['tire-front-left', s.frontAxle, 'left'], ['tire-front-right', s.frontAxle, 'right'],
    ['tire-rear-left', s.rearAxle, 'left'], ['tire-rear-right', s.rearAxle, 'right'],
  ]
  const exhaustPath = [
    [ex - 0.1, s.clearance + 0.1, -0.12], [ex - ew, s.clearance + 0.03, -0.22],
    [s.rearAxle + 0.6, s.clearance + 0.03, -0.32], [s.rearAxle + 0.15, s.clearance + 0.05, -0.36],
  ]

  return (
    <group>
      <mesh geometry={body} {...bodyEvents}>{bodyMaterial}</mesh>
      {s.bed && (
        <group {...bodyEvents}>
          {[-1, 1].map((side) => (
            <mesh key={side} geometry={bedSide} position={[0, 0, side * (width / 2 - 0.035)]}>{bodyMaterial}</mesh>
          ))}
          <mesh position={[(s.bed.front + s.bed.rear) / 2, s.bed.floor, 0]}>
            <boxGeometry args={[s.bed.front - s.bed.rear, 0.05, width - 0.1]} />
            <meshStandardMaterial key={xray ? 'xray' : 'solid'} color="#1f2328" roughness={0.9} transparent={xray} opacity={xray ? 0.2 : 1} depthWrite={!xray} />
          </mesh>
          <mesh position={[s.bed.rear + 0.035, (s.bed.top + s.clearance + 0.12) / 2, 0]}>
            <boxGeometry args={[0.07, s.bed.top - s.clearance - 0.12, width - 0.1]} />
            {bodyMaterial}
          </mesh>
        </group>
      )}

      {!xray && (
        <group>
          {[leftWindows, rightWindows].map((geometry) => (
            <mesh key={geometry.uuid} geometry={geometry}>
              <meshPhysicalMaterial color="#0d1b26" roughness={0.08} metalness={0.2} side={THREE.DoubleSide} />
            </mesh>
          ))}
          <GlassPanel segment={s.windshield} width={width * 0.8} />
          {s.rearWindow && <GlassPanel segment={s.rearWindow} width={width * 0.76} />}
          <mesh position={[half + 0.01, s.lamps.front - 0.14, 0]}>
            <boxGeometry args={[0.03, 0.16, width * 0.42]} />
            <meshStandardMaterial color="#15181b" roughness={0.6} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[s.windshield[0][0] - 0.05, s.windshield[0][1] + 0.08, side * (width / 2 * 0.95 + 0.06)]}>
              <boxGeometry args={[0.12, 0.09, 0.1]} />
              {bodyMaterial}
            </mesh>
          ))}
        </group>
      )}

      <Part id="engine" interaction={interaction}>
        <mesh position={[ex, ey, 0]}>
          <boxGeometry args={[ew, eh, ed]} />
          <Mat color="#5d656d" metalness={0.65} roughness={0.42} />
        </mesh>
        <mesh position={[ex, ey + eh / 2 + 0.05, 0]}>
          <boxGeometry args={[ew * 0.82, 0.1, ed * 0.62]} />
          <Mat color="#26292d" metalness={0.3} roughness={0.5} />
        </mesh>
        {[-0.3, -0.1, 0.1, 0.3].map((offset) => (
          <mesh key={offset} position={[ex - ew * 0.15, ey + eh / 2 + 0.06, offset * ed * 0.9]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, ew * 0.55, 10]} />
            <Mat color="#9aa3ab" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[ex + ew / 2 + 0.02, ey - eh * 0.15, ed * 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.05, 20]} />
          <Mat color="#2e3338" metalness={0.6} roughness={0.4} />
        </mesh>
      </Part>

      <Part id="battery" interaction={interaction}>
        <mesh position={[ex - ew / 2 - 0.12, ey + 0.04, -width * 0.3]}>
          <boxGeometry args={[0.24, 0.2, 0.17]} />
          <Mat color="#1d2024" roughness={0.6} />
        </mesh>
        {[[-0.06, '#c0392b'], [0.06, '#2c3e50']].map(([offset, color]) => (
          <mesh key={offset} position={[ex - ew / 2 - 0.12 + offset, ey + 0.16, -width * 0.3]}>
            <cylinderGeometry args={[0.018, 0.018, 0.04, 10]} />
            <Mat color={color} metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      </Part>

      <Part id="cooling" interaction={interaction}>
        <mesh position={[half - 0.3, ey - 0.02, 0]}>
          <boxGeometry args={[0.06, eh * 1.05, width * 0.62]} />
          <Mat color="#3f4a54" metalness={0.55} roughness={0.5} />
        </mesh>
        <mesh position={[half - 0.38, ey - 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[eh * 0.42, eh * 0.42, 0.04, 24]} />
          <Mat color="#23272b" roughness={0.6} />
        </mesh>
        <mesh position={[ex + 0.1, ey + eh / 2 - 0.02, -width * 0.24]}>
          <cylinderGeometry args={[0.05, 0.05, 0.14, 14]} />
          <Mat color="#d9dde0" roughness={0.3} metalness={0.1} />
        </mesh>
      </Part>

      <Part id="transmission" interaction={interaction}>
        <mesh position={[ex - ew / 2 - 0.3, s.clearance + 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.17, 0.6, 18]} />
          <Mat color="#6c747b" metalness={0.7} roughness={0.38} />
        </mesh>
      </Part>
      <Rod from={[ex - ew / 2 - 0.62, s.clearance + 0.18, 0]} to={[s.rearAxle, R, 0]} radius={0.03} color="#3a3f45" />

      <Part id="exhaust" interaction={interaction}>
        <Tube points={exhaustPath} radius={0.028} color="#7b8188" />
        <mesh position={[s.rearAxle - 0.3, s.clearance + 0.05, -0.38]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.55, 18]} />
          <Mat color="#8a9097" metalness={0.75} roughness={0.35} />
        </mesh>
        <Rod from={[s.rearAxle - 0.55, s.clearance + 0.05, -0.42]} to={[-half + 0.04, s.clearance + 0.04, -0.48]} radius={0.032} color="#a3a9af" />
      </Part>

      <Part id="steering" interaction={interaction}>
        <Rod from={[s.frontAxle - 0.18, R * 0.95, -(track - 0.32)]} to={[s.frontAxle - 0.18, R * 0.95, track - 0.32]} radius={0.028} color="#7a828a" metalness={0.75} roughness={0.35} />
        <Rod from={[s.frontAxle - 0.18, R * 0.95, -0.36]} to={[s.windshield[0][0] - 0.45, s.windshield[0][1] + 0.05, -width * 0.2]} radius={0.02} color="#4a5158" />
        <mesh position={[s.windshield[0][0] - 0.5, s.windshield[0][1] + 0.08, -width * 0.2]} rotation={[0, Math.PI / 2, 0.45]}>
          <torusGeometry args={[0.17, 0.018, 10, 32]} />
          <Mat color="#1f2226" roughness={0.6} />
        </mesh>
      </Part>

      <Part id="suspension" interaction={interaction}>
        {axles.map((axle) => [-1, 1].map((side) => (
          <Spring key={`${axle}${side}`} geometry={spring} position={[axle - 0.04, R, side * (track - 0.3)]} />
        )))}
      </Part>

      <Part id="brakes-front" interaction={interaction}>
        {[-1, 1].map((side) => (
          <BrakeAssembly key={side} position={[s.frontAxle, R, side * (track - 0.06)]} radius={R * 0.56} side={side} caliperAngle={0.6} />
        ))}
      </Part>
      <Part id="brakes-rear" interaction={interaction}>
        {[-1, 1].map((side) => (
          <BrakeAssembly key={side} position={[s.rearAxle, R, side * (track - 0.06)]} radius={R * 0.5} side={side} caliperAngle={Math.PI - 0.6} />
        ))}
      </Part>

      {wheels.map(([id, axle, side]) => (
        <Part key={id} id={id} interaction={interaction}>
          <Wheel position={[axle, R, wheelZ[side]]} radius={R} width={tireWidth} />
        </Part>
      ))}

      <Part id="lighting" interaction={interaction}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[half - 0.05, s.lamps.front, side * (surfaceZ(half - 0.05, s.lamps.front) - 0.3)]}>
              <boxGeometry args={[0.05, 0.11, 0.34]} />
              <Mat color="#eef3f6" emissive="#cfe6ff" emissiveIntensity={0.5} metalness={0.2} roughness={0.15} />
            </mesh>
            <mesh position={[-half + 0.04, s.lamps.rear, side * (surfaceZ(-half + 0.04, s.lamps.rear) - 0.24)]}>
              <boxGeometry args={[0.05, 0.12, 0.3]} />
              <Mat color="#9e1b1b" emissive="#d42a2a" emissiveIntensity={0.45} roughness={0.25} />
            </mesh>
          </group>
        ))}
      </Part>
    </group>
  )
}

function MotorcycleModel({ rig, paint, xray, interaction }) {
  const s = rig.spec
  const R = s.wheelRadius
  const head = [0.55, 0.98, 0]
  const pivot = [-0.14, 0.4, 0]
  const frame = '#2b3036'
  const bodyEvents = xray ? { raycast: () => null } : { onClick: (event) => event.stopPropagation() }
  const panel = (
    <meshPhysicalMaterial key={xray ? 'xray' : 'solid'} color={paint} metalness={0.45} roughness={0.3} clearcoat={0.9} transparent={xray} opacity={xray ? 0.15 : 1} depthWrite={!xray} />
  )

  return (
    <group>
      <group {...bodyEvents}>
        <mesh position={[0.16, 0.93, 0]} scale={[0.34, 0.14, 0.16]}>
          <sphereGeometry args={[1, 28, 18]} />
          {panel}
        </mesh>
        <mesh position={[-0.36, 0.86, 0]}>
          <boxGeometry args={[0.56, 0.07, 0.24]} />
          <meshStandardMaterial key={xray ? 'xray' : 'solid'} color="#17191c" roughness={0.85} transparent={xray} opacity={xray ? 0.2 : 1} depthWrite={!xray} />
        </mesh>
        <mesh position={[-0.3, 0.72, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.26]} />
          {panel}
        </mesh>
        <mesh position={[-0.76, 0.84, 0]} rotation={[0, 0, 0.18]}>
          <boxGeometry args={[0.32, 0.07, 0.18]} />
          {panel}
        </mesh>
      </group>
      <Rod from={head} to={pivot} radius={0.03} color={frame} />
      <Rod from={[0.45, 0.9, 0]} to={[-0.62, 0.8, 0]} radius={0.025} color={frame} />
      <Rod from={pivot} to={[s.rearAxle, R, -0.07]} radius={0.025} color={frame} />
      <Rod from={pivot} to={[s.rearAxle, R, 0.07]} radius={0.025} color={frame} />
      <Rod from={[0.5, 1.07, -0.34]} to={[0.5, 1.07, 0.34]} radius={0.016} color="#1a1c1f" />

      <Part id="engine" interaction={interaction}>
        <mesh position={[0.02, 0.45, 0]}>
          <boxGeometry args={[0.38, 0.3, 0.26]} />
          <Mat color="#5f676f" metalness={0.7} roughness={0.38} />
        </mesh>
        <mesh position={[0.1, 0.66, 0]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.16, 0.2, 0.22]} />
          <Mat color="#8c949b" metalness={0.75} roughness={0.32} />
        </mesh>
        <mesh position={[0.02, 0.43, -0.14]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.03, 24]} />
          <Mat color="#9aa2a9" metalness={0.85} roughness={0.25} />
        </mesh>
      </Part>

      <Part id="battery" interaction={interaction}>
        <mesh position={[-0.3, 0.7, 0]}>
          <boxGeometry args={[0.14, 0.1, 0.12]} />
          <Mat color="#1d2024" roughness={0.6} />
        </mesh>
      </Part>

      <Part id="final-drive" interaction={interaction}>
        <mesh position={[-0.08, 0.36, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.02, 16]} />
          <Mat color="#3b4148" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[s.rearAxle, R, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.015, 28]} />
          <Mat color="#3b4148" metalness={0.8} roughness={0.35} />
        </mesh>
        <Rod from={[-0.08, 0.415, -0.15]} to={[s.rearAxle, R + 0.12, -0.15]} radius={0.01} color="#6d737a" />
        <Rod from={[-0.08, 0.305, -0.15]} to={[s.rearAxle, R - 0.12, -0.15]} radius={0.01} color="#6d737a" />
      </Part>

      <Part id="suspension" interaction={interaction}>
        {[-0.08, 0.08].map((z) => (
          <Rod key={z} from={[s.frontAxle, R, z]} to={[head[0] + 0.03, head[1] - 0.04, z]} radius={0.024} color="#c4cad0" metalness={0.85} roughness={0.2} />
        ))}
        {[-0.1, 0.1].map((z) => (
          <Rod key={z} from={[-0.48, 0.42, z]} to={[-0.6, 0.8, z]} radius={0.028} color="#c9a03a" metalness={0.6} roughness={0.35} />
        ))}
      </Part>

      <Part id="brakes-front" interaction={interaction}>
        <BrakeAssembly position={[s.frontAxle, R, -0.08]} radius={R * 0.5} side={-1} caliperAngle={2.3} />
      </Part>
      <Part id="brakes-rear" interaction={interaction}>
        <BrakeAssembly position={[s.rearAxle, R, 0.08]} radius={R * 0.4} side={1} caliperAngle={0.9} />
      </Part>

      <Part id="tire-front" interaction={interaction}>
        <Wheel position={[s.frontAxle, R, 0]} radius={R} width={s.tireWidth} spokes={6} rimColor="#30353b" />
      </Part>
      <Part id="tire-rear" interaction={interaction}>
        <Wheel position={[s.rearAxle, R, 0]} radius={R} width={s.tireWidth + 0.03} spokes={6} rimColor="#30353b" />
      </Part>

      <Part id="exhaust" interaction={interaction}>
        <Tube points={[[0.16, 0.42, 0.06], [0.2, 0.22, 0.12], [-0.2, 0.2, 0.16], [-0.45, 0.32, 0.17]]} radius={0.025} color="#8a9097" />
        <mesh position={[-0.65, 0.42, 0.17]} rotation={[0, 0, Math.PI / 2 - 0.35]}>
          <cylinderGeometry args={[0.055, 0.065, 0.45, 18]} />
          <Mat color="#a6adb4" metalness={0.85} roughness={0.25} />
        </mesh>
      </Part>

      <Part id="lighting" interaction={interaction}>
        <mesh position={[0.8, 0.95, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.085, 0.07, 0.08, 24]} />
          <Mat color="#eef3f6" emissive="#cfe6ff" emissiveIntensity={0.55} roughness={0.15} />
        </mesh>
        <mesh position={[-0.93, 0.87, 0]}>
          <boxGeometry args={[0.04, 0.05, 0.12]} />
          <Mat color="#9e1b1b" emissive="#d42a2a" emissiveIntensity={0.45} roughness={0.25} />
        </mesh>
      </Part>
    </group>
  )
}

export default function VehicleModel(props) {
  return props.rig.kind === 'motorcycle' ? <MotorcycleModel {...props} /> : <CarModel {...props} />
}
