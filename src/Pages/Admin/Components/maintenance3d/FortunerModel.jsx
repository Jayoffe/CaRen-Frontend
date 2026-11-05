import { Component, createContext, Suspense, useContext, useEffect, useMemo, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt } from './rigs.js'

const HIGHLIGHT = '#36b6ff'
const HOVER = '#8fd3ff'
const TRIM = '#121519'
const CHROME = '#e4e8ec'
const RUBBER = '#1c1e21'

// Highlight / ghost state for the component group a mesh belongs to.
const PartState = createContext({ active: false, hovered: false, ghost: false })

function Mat({ color, metalness = 0.35, roughness = 0.55, emissive = '#000000', emissiveIntensity = 0, side = THREE.FrontSide }) {
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
      side={side}
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

/** Chaikin corner cutting: rounds the profile's corners while staying inside the original outline. */
function smoothProfile(points, iterations = 2, cut = 0.14) {
  let current = points
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = [current[0]]
    for (let index = 0; index < current.length - 1; index += 1) {
      const [x1, y1] = current[index]
      const [x2, y2] = current[index + 1]
      next.push([x1 + (x2 - x1) * cut, y1 + (y2 - y1) * cut], [x1 + (x2 - x1) * (1 - cut), y1 + (y2 - y1) * (1 - cut)])
    }
    next.push(current[current.length - 1])
    current = next
  }
  return current
}

const SECTION = [ // normalised half cross-section: [u (width), v (height)], bottom centre to roof centre
  [0, 0], [0.8, 0], [0.92, 0.025], [0.975, 0.08], [0.995, 0.16], [1, 0.24], [1, 'belt'], [0.93, 'shoulder'], [0.84, 0.97], [0.66, 1], [0, 1],
]

function bodyFrame(spec) {
  const profile = smoothProfile(spec.profile)
  const belt = Math.min(...spec.windows.map(([, y]) => y)) - 0.03
  const frontX = Math.max(...profile.map(([x]) => x))
  const rearX = Math.min(...profile.map(([x]) => x))
  const half = Math.max(frontX, -rearX)
  const archRadius = spec.wheelRadius + 0.07
  const planFactor = (x) => 1 - 0.1 * Math.pow(Math.abs(x) / half, 4) - 0.06 * Math.pow(Math.abs(x) / half, 12)
  const topAt = (x) => heightAt(profile, x)
  const bottomAt = (x) => [spec.frontAxle, spec.rearAxle].reduce((bottom, axle) => {
    const dx = x - axle
    return Math.abs(dx) < archRadius ? Math.max(bottom, spec.wheelRadius + Math.sqrt(archRadius * archRadius - dx * dx)) : bottom
  }, spec.clearance)
  // Half-width of the body surface at (x, y): used to lay windows and trim onto it.
  const surfaceZ = (x, y) => {
    const top = topAt(x) ?? belt
    const u = y <= belt ? 1 : 1 - 0.16 * THREE.MathUtils.clamp((y - belt) / Math.max(top - belt, 0.01), 0, 1)
    return (spec.width / 2) * planFactor(x) * u
  }
  // Outermost x of the body at height y, searching inward from the front or rear end.
  const endX = (y, direction) => {
    const start = direction > 0 ? frontX : rearX
    for (let step = 0; step < 400; step += 1) {
      const x = start - direction * step * 0.004
      if ((topAt(x) ?? -Infinity) >= y && bottomAt(x) <= y) return x
    }
    return start
  }
  return { profile, belt, frontX, rearX, archRadius, planFactor, topAt, bottomAt, surfaceZ, endX }
}

/** Smooth body loft: cross-sections along x with rounded corners, tuck-under and tumblehome. */
function loftBody(spec) {
  const frame = bodyFrame(spec)
  const { frontX, rearX } = frame
  const xs = []
  const steps = 160
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    xs.push(rearX + (frontX - rearX) * (0.5 - 0.5 * Math.cos(Math.PI * t))) // denser at the ends
  }
  const ring = []
  const positions = []
  const colors = []
  // Two-tone paint: everything above the side-glass line takes the roof colour (multiplied with the paint).
  const roofY = spec.roofColor ? Math.max(...spec.windows.map(([, y]) => y)) + 0.01 : Infinity
  const roof = new THREE.Color(spec.roofColor || '#ffffff')
  xs.forEach((x) => {
    // Probe just inside the ends: the outermost slice can land a rounding error beyond the profile.
    const probe = THREE.MathUtils.clamp(x, rearX + 1e-4, frontX - 1e-4)
    const top = Math.max(frame.topAt(probe) ?? frame.belt, frame.bottomAt(x) + 0.05)
    const bottom = Math.min(frame.bottomAt(x), top - 0.05)
    const span = top - bottom
    const beltV = THREE.MathUtils.clamp((frame.belt - bottom) / span, 0.3, 0.95)
    const shoulderV = Math.min(beltV + 0.03, 0.96)
    const halfWidth = (spec.width / 2) * frame.planFactor(x)
    const section = SECTION.map(([u, v]) => [u, v === 'belt' ? beltV : v === 'shoulder' ? shoulderV : v])
    // Split the shoulder-to-roof segment at the roof line (a fixed point count per ring) so the colour change is crisp.
    const shoulder = SECTION.findIndex(([, v]) => v === 'shoulder')
    const [[u1, v1], [u2, v2]] = [section[shoulder], section[shoulder + 1]]
    const t = THREE.MathUtils.clamp(((roofY - bottom) / span - v1) / (v2 - v1), 0.05, 0.95)
    section.splice(shoulder + 1, 0, [u1 + (u2 - u1) * (t - 0.03), v1 + (v2 - v1) * (t - 0.03)], [u1 + (u2 - u1) * t, v1 + (v2 - v1) * t])
    const darkFrom = top >= roofY ? shoulder + 2 : Infinity
    const tagged = section.map(([u, v], index) => [u, v, index >= darkFrom])
    const points = [
      ...tagged.map(([u, v, dark]) => [-u, v, dark]),
      ...tagged.slice(0, -1).reverse(),
    ].filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1])
    ring.length = points.length
    points.forEach(([u, v, dark]) => {
      positions.push(x, bottom + v * span, u * halfWidth)
      colors.push(...(dark ? [roof.r, roof.g, roof.b] : [1, 1, 1]))
    })
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
    colors.push(1, 1, 1)
    const centre = vertexCount + cap
    for (let index = 0; index < perRing - 1; index += 1) {
      const a = slice * perRing + index
      if (flip) indices.push(centre, a, a + 1)
      else indices.push(centre, a + 1, a)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** A flat side-view outline laid onto the body surface (windows, trim, seams), `lift` above the paint. */
function surfacePatch(frame, points, side, lift, grow = 0) {
  const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length
  const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length
  const outline = points.map(([x, y]) => {
    const length = Math.hypot(x - cx, y - cy) || 1
    return new THREE.Vector2(x + ((x - cx) / length) * grow, y + ((y - cy) / length) * grow)
  })
  const flat = new THREE.ShapeGeometry(new THREE.Shape(outline))
  const source = flat.attributes.position
  const corner = (index) => new THREE.Vector3().fromBufferAttribute(source, flat.index.getX(index))
  // Split long triangles so the patch follows the curved body instead of cutting through it.
  const triangles = []
  const split = (a, b, c, depth = 0) => {
    const edges = [a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)]
    const longest = Math.max(...edges)
    if (longest <= 0.05 || depth > 14) {
      triangles.push(...(side < 0 ? [a, c, b] : [a, b, c]))
    } else if (longest === edges[0]) {
      const mid = a.clone().lerp(b, 0.5); split(a, mid, c, depth + 1); split(mid, b, c, depth + 1)
    } else if (longest === edges[1]) {
      const mid = b.clone().lerp(c, 0.5); split(a, b, mid, depth + 1); split(a, mid, c, depth + 1)
    } else {
      const mid = c.clone().lerp(a, 0.5); split(a, b, mid, depth + 1); split(mid, b, c, depth + 1)
    }
  }
  for (let index = 0; index < flat.index.count; index += 3) split(corner(index), corner(index + 1), corner(index + 2))
  flat.dispose()
  const positions = triangles.flatMap(({ x, y }) => [x, y, side * (frame.surfaceZ(x, y) + lift)])
  const soup = new THREE.BufferGeometry()
  soup.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const geometry = mergeVertices(soup, 1e-5) // shared vertices give smooth normals and clean reflections
  soup.dispose()
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


function GlassMat({ xray }) {
  return (
    <meshPhysicalMaterial
      key={xray ? 'xray' : 'solid'}
      color="#16232e"
      roughness={0.04}
      metalness={0.1}
      clearcoat={1}
      envMapIntensity={1.6}
      transparent={xray}
      opacity={xray ? 0.06 : 1}
      depthWrite={!xray}
      side={THREE.DoubleSide}
    />
  )
}

function trapezoid(length, startWidth, endWidth) {
  const shape = new THREE.Shape([
    new THREE.Vector2(-length / 2, -startWidth / 2), new THREE.Vector2(length / 2, -endWidth / 2),
    new THREE.Vector2(length / 2, endWidth / 2), new THREE.Vector2(-length / 2, startWidth / 2),
  ])
  return new THREE.ShapeGeometry(shape)
}

/** Glass along a profile segment, tapering from `widths[0]` to `widths[1]`, with a black ceramic border. */
function GlassPanel({ segment, widths }) {
  const [[x1, y1], [x2, y2]] = segment
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  const offset = 0.014 / length
  const [startWidth, endWidth] = widths
  const geometries = useMemo(() => [
    trapezoid(length * 0.92, startWidth, endWidth),
    trapezoid(length * 0.84, startWidth - 0.1, endWidth - 0.1),
  ], [length, startWidth, endWidth])
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  return (
    <group position={[(x1 + x2) / 2 + dy * offset, (y1 + y2) / 2 - dx * offset, 0]} rotation={[0, 0, Math.atan2(dy, dx)]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={geometries[0]}>
        <meshStandardMaterial color={TRIM} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} geometry={geometries[1]}>
        <GlassMat />
      </mesh>
    </group>
  )
}

function useTireGeometry(radius, width) {
  return useDisposeOnChange(useMemo(() => {
    const half = width / 2
    const bead = radius * 0.66
    const profile = [
      [bead, -half * 0.84], [bead + (radius - bead) * 0.45, -half * 1.0], [radius - 0.03, -half * 0.98],
      [radius - 0.008, -half * 0.86], [radius, -half * 0.66], [radius, half * 0.66], [radius - 0.008, half * 0.86],
      [radius - 0.03, half * 0.98], [bead + (radius - bead) * 0.45, half * 1.0], [bead, half * 0.84],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const geometry = new THREE.LatheGeometry(profile, 56)
    geometry.rotateX(Math.PI / 2) // lathe axis y -> wheel axle z
    return geometry
  }, [radius, width]))
}

/** Tyre with sidewall bulge and tread grooves on a multi-spoke alloy rim; `side` is the outboard direction (-1 = left). */
function Wheel({ position, radius, width, spokes = 5, rimColor = '#c7ced5', side = -1 }) {
  const tire = useTireGeometry(radius, width)
  const rim = radius * 0.66
  const hub = radius * 0.2
  const face = side * width * 0.3
  const spokeLength = rim - hub
  return (
    <group position={position}>
      <mesh geometry={tire}>
        <Mat color={RUBBER} roughness={0.88} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      {[-0.42, -0.14, 0.14, 0.42].map((offset) => (
        <mesh key={offset} position={[0, 0, offset * width]}>
          <torusGeometry args={[radius + 0.0005, 0.0045, 4, 56]} />
          <Mat color="#060707" roughness={1} metalness={0} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[rim, rim, width * 0.78, 40, 1, true]} />
        <Mat color="#5d656d" metalness={0.8} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, face]}>
        <torusGeometry args={[rim, 0.014, 10, 48]} />
        <Mat color={rimColor} metalness={0.95} roughness={0.16} />
      </mesh>
      {Array.from({ length: spokes }, (_, index) => {
        const angle = (index / spokes) * Math.PI * 2
        return [-0.11, 0.11].map((spread) => (
          <mesh
            key={`${index}${spread}`}
            position={[Math.cos(angle + spread * 0.55) * (hub + spokeLength / 2), Math.sin(angle + spread * 0.55) * (hub + spokeLength / 2), face]}
            rotation={[0, 0, angle + spread * 0.55]}
          >
            <boxGeometry args={[spokeLength * 1.04, 0.026, 0.028]} />
            <Mat color={rimColor} metalness={0.92} roughness={0.2} />
          </mesh>
        ))
      })}
      <mesh position={[0, 0, face]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[hub, hub * 1.1, 0.04, 28]} />
        <Mat color={rimColor} metalness={0.92} roughness={0.2} />
      </mesh>
      {Array.from({ length: 5 }, (_, index) => {
        const angle = (index / 5) * Math.PI * 2 + Math.PI / 2
        return (
          <mesh key={index} position={[Math.cos(angle) * hub * 0.66, Math.sin(angle) * hub * 0.66, face + side * 0.022]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.02, 6]} />
            <Mat color={CHROME} metalness={1} roughness={0.15} />
          </mesh>
        )
      })}
      <mesh position={[0, 0, face + side * 0.026]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[hub * 0.42, hub * 0.42, 0.012, 24]} />
        <Mat color="#23272c" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

/** Vented disc with a raised hat and a red caliper hugging the disc edge. */
function BrakeAssembly({ position, radius, side, caliperAngle = 0.5 }) {
  return (
    <group position={position}>
      {[-1, 1].map((face) => (
        <mesh key={face} position={[0, 0, face * 0.013]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[radius, radius, 0.01, 40]} />
          <Mat color="#a9b0b6" metalness={0.9} roughness={0.28} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.97, radius * 0.97, 0.018, 40]} />
        <Mat color="#3b4046" metalness={0.6} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, side * 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.48, radius * 0.5, 0.05, 32]} />
        <Mat color="#6f777e" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh rotation={[0, 0, caliperAngle - 0.45]} scale={[1, 1, 1.5]}>
        <torusGeometry args={[radius * 0.84, 0.04, 12, 18, 0.9]} />
        <Mat color="#d22f24" metalness={0.35} roughness={0.32} />
      </mesh>
    </group>
  )
}

function Spring({ geometry, position }) {
  return (
    <group position={position}>
      <mesh geometry={geometry}>
        <Mat color="#e2ad2c" metalness={0.5} roughness={0.32} />
      </mesh>
      <mesh position={[0, geometry.userData.height / 2, 0]}>
        <cylinderGeometry args={[0.024, 0.024, geometry.userData.height * 1.15, 12]} />
        <Mat color={CHROME} metalness={0.95} roughness={0.18} />
      </mesh>
      <mesh position={[0, geometry.userData.height * 0.3, 0]}>
        <cylinderGeometry args={[0.038, 0.038, geometry.userData.height * 0.6, 16]} />
        <Mat color="#2a2f35" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, geometry.userData.height + 0.01, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.02, 20]} />
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
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 24, 0.014, 8, false)
    tube.userData.height = height
    return tube
  }, [height, radius])
  return useDisposeOnChange(geometry)
}

function Tube({ points, radius, color, metalness = 0.75, roughness = 0.35, closed = false }) {
  const key = JSON.stringify(points)
  const geometry = useDisposeOnChange(useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(JSON.parse(key).map((point) => new THREE.Vector3(...point)), closed), 64, radius, 10, closed),
    [key, radius, closed],
  ))
  return (
    <mesh geometry={geometry}>
      <Mat color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

/** Inline-four engine: oil pan, block, head, valve cover, coil packs, intake, headers and belt drive. */
function Engine({ s }) {
  const [ex, ey] = s.engine
  const [ew, eh, ed] = s.engineSize
  const cylinders = [-0.3, -0.1, 0.1, 0.3].map((t) => t * ew)
  const front = ew / 2 + 0.05
  const crank = [front, -eh * 0.24, 0]
  const alternator = [front, eh * 0.16, ed * 0.3]
  const pump = [front, eh * 0.06, -ed * 0.06]
  return (
    <group position={[ex, ey, 0]}>
      <mesh position={[0, -eh * 0.42, 0]}>
        <boxGeometry args={[ew * 0.84, eh * 0.16, ed * 0.5]} />
        <Mat color="#3d4349" metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, -eh * 0.09, 0]}>
        <boxGeometry args={[ew, eh * 0.5, ed * 0.56]} />
        <Mat color="#a4adb5" metalness={0.75} roughness={0.42} />
      </mesh>
      <mesh position={[0, eh * 0.25, 0]}>
        <boxGeometry args={[ew * 0.96, eh * 0.18, ed * 0.5]} />
        <Mat color="#c4cbd1" metalness={0.8} roughness={0.32} />
      </mesh>
      <mesh position={[0, eh * 0.41, 0]}>
        <boxGeometry args={[ew * 0.9, eh * 0.15, ed * 0.38]} />
        <Mat color="#b3242b" metalness={0.45} roughness={0.38} />
      </mesh>
      {[-0.13, 0.13].map((offset) => (
        <mesh key={offset} position={[0, eh * 0.49, offset * ed]}>
          <boxGeometry args={[ew * 0.86, 0.012, 0.018]} />
          <Mat color="#e1484d" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      {cylinders.map((x) => (
        <mesh key={x} position={[x, eh * 0.52, 0]}>
          <cylinderGeometry args={[0.026, 0.03, 0.07, 14]} />
          <Mat color="#17191c" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[-ew * 0.32, eh * 0.5, ed * 0.12]}>
        <cylinderGeometry args={[0.032, 0.032, 0.03, 18]} />
        <Mat color="#f2c230" roughness={0.4} />
      </mesh>
      <mesh position={[ew * 0.18, eh * 0.5, -ed * 0.17]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.022, 0.007, 8, 16]} />
        <Mat color="#f2c230" roughness={0.4} />
      </mesh>

      {/* Intake: plenum and runners on the right, throttle body facing forward. */}
      <mesh position={[0, eh * 0.3, ed * 0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, ew * 0.82, 20]} />
        <Mat color="#cfd5da" metalness={0.85} roughness={0.25} />
      </mesh>
      {cylinders.map((x) => (
        <Rod key={x} from={[x, eh * 0.3, ed * 0.36]} to={[x, eh * 0.2, ed * 0.24]} radius={0.022} color="#cfd5da" metalness={0.85} roughness={0.25} />
      ))}
      <mesh position={[ew * 0.45, eh * 0.3, ed * 0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.06, 18]} />
        <Mat color="#2a2e33" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Exhaust headers on the left, merging into the collector the exhaust pipe leaves from. */}
      {cylinders.map((x) => (
        <Tube key={x} points={[[x, eh * 0.18, -ed * 0.25], [x, eh * 0.1, -ed * 0.36], [x * 0.5, -eh * 0.2, -ed * 0.36], [-0.1, -eh * 0.4, -ed * 0.25]]} radius={0.02} color="#a8744f" metalness={0.8} roughness={0.38} />
      ))}

      {/* Front accessory drive. */}
      <mesh position={[ew / 2 + 0.012, eh * 0.02, 0]}>
        <boxGeometry args={[0.024, eh * 0.62, ed * 0.48]} />
        <Mat color="#22262a" roughness={0.5} />
      </mesh>
      {[[crank, 0.07], [pump, 0.045], [alternator, 0.04]].map(([at, radius]) => (
        <mesh key={at.join()} position={at} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[radius, radius, 0.035, 24]} />
          <Mat color="#c8ced3" metalness={0.9} roughness={0.22} />
        </mesh>
      ))}
      <mesh position={[ew / 2 - 0.05, alternator[1], alternator[2]]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.065, 0.065, 0.12, 22]} />
        <Mat color="#bfc6cc" metalness={0.85} roughness={0.3} />
      </mesh>
      <Tube
        closed
        points={[
          [front, crank[1] - 0.072, 0], [front, crank[1], 0.072], [front, alternator[1] - 0.03, alternator[2] + 0.04],
          [front, alternator[1] + 0.042, alternator[2]], [front, pump[1] + 0.047, pump[2]], [front, crank[1] + 0.02, -0.07],
        ]}
        radius={0.007}
        color="#141517"
        metalness={0.1}
        roughness={0.8}
      />
      <mesh position={[-ew * 0.1, -eh * 0.22, ed * 0.31]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 20]} />
        <Mat color="#e0662a" roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Air box and intake duct. */}
      <mesh position={[ew * 0.2, eh * 0.18, ed * 0.5 + 0.12]}>
        <boxGeometry args={[0.32, 0.15, 0.2]} />
        <Mat color="#23272b" roughness={0.65} />
      </mesh>
      <Tube points={[[ew * 0.36, eh * 0.2, ed * 0.5 + 0.06], [ew * 0.5, eh * 0.28, ed * 0.48], [ew * 0.49, eh * 0.3, ed * 0.4]]} radius={0.035} color="#1b1e22" metalness={0.1} roughness={0.8} />
    </group>
  )
}

/** Radiator with fins and side tanks, electric fan, hoses and coolant reservoir. */
function Cooling({ s }) {
  const [ex, ey] = s.engine
  const [ew, eh, ed] = s.engineSize
  const x = s.half - 0.3
  const height = eh * 1.05
  const span = s.width * 0.62
  return (
    <group>
      <mesh position={[x, ey - 0.02, 0]}>
        <boxGeometry args={[0.04, height, span]} />
        <Mat color="#9aa6b0" metalness={0.75} roughness={0.38} />
      </mesh>
      {Array.from({ length: 16 }, (_, index) => (
        <mesh key={index} position={[x + 0.022, ey - 0.02 - height / 2 + ((index + 0.5) / 16) * height, 0]}>
          <boxGeometry args={[0.006, 0.007, span]} />
          <Mat color="#4c5862" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[x, ey - 0.02, side * (span / 2 + 0.035)]}>
          <boxGeometry args={[0.07, height, 0.07]} />
          <Mat color="#1d2125" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[x, ey - 0.02 + height / 2 + 0.02, span / 2 + 0.035]}>
        <cylinderGeometry args={[0.03, 0.03, 0.03, 16]} />
        <Mat color={CHROME} metalness={1} roughness={0.15} />
      </mesh>
      <group position={[x - 0.08, ey - 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <torusGeometry args={[height * 0.42, 0.018, 10, 40]} />
          <Mat color="#2b3036" roughness={0.6} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.06, 20]} />
          <Mat color="#3f464d" metalness={0.6} roughness={0.4} />
        </mesh>
        {Array.from({ length: 7 }, (_, index) => {
          const angle = (index / 7) * Math.PI * 2
          const reach = height * 0.22
          return (
            <mesh key={index} position={[Math.cos(angle) * (reach + 0.03), Math.sin(angle) * (reach + 0.03), 0]} rotation={[0.45, 0, angle]}>
              <boxGeometry args={[reach * 1.6, 0.06, 0.006]} />
              <Mat color="#3a4148" roughness={0.55} metalness={0.2} />
            </mesh>
          )
        })}
      </group>
      <Tube points={[[x - 0.03, ey + height * 0.38, span * 0.38], [x - 0.2, ey + height * 0.4, span * 0.3], [ex + ew * 0.3, ey + eh * 0.28, ed * 0.12]]} radius={0.024} color="#22262b" metalness={0.1} roughness={0.75} />
      <Tube points={[[x - 0.03, ey - height * 0.38, -span * 0.38], [x - 0.15, ey - height * 0.3, -span * 0.2], [ex + ew / 2 + 0.03, ey + eh * 0.06, -ed * 0.06]]} radius={0.024} color="#22262b" metalness={0.1} roughness={0.75} />
      <group position={[ex + 0.1, ey + eh / 2 - 0.04, -s.width * 0.26]}>
        <mesh>
          <boxGeometry args={[0.16, 0.14, 0.11]} />
          <Mat color="#eceff1" roughness={0.35} metalness={0.05} />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[0.162, 0.07, 0.112]} />
          <Mat color="#e5609a" roughness={0.3} />
        </mesh>
        <mesh position={[0.03, 0.08, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.03, 16]} />
          <Mat color="#2f6fd1" roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Leader-style graphics between the wheel arches: black lower-door cladding and
 * a twin stripe that kicks up behind the front arch.
 */
function sideDecals(s, frame) {
  const R = s.wheelRadius
  // x where a horizontal line at height y clears an arch.
  const clear = (axle, y, direction) => axle + direction * (Math.sqrt(Math.max(frame.archRadius ** 2 - (y - R) ** 2, 0)) + 0.04)
  const front = (y) => clear(s.frontAxle, y, -1)
  const rear = (y) => clear(s.rearAxle, y, 1)
  const low = s.clearance + 0.12 // above the tuck-under, so the patch sits on the vertical side
  const cladTop = s.clearance + 0.2
  const stripe = [s.clearance + 0.3, s.clearance + 0.36]
  const thin = [s.clearance + 0.25, s.clearance + 0.27]
  return [
    [[rear(low), low], [front(low), low], [front(cladTop), cladTop], [rear(cladTop), cladTop]],
    [[rear(stripe[0]), stripe[0]], [front(stripe[0]) - 0.1, stripe[0]], [front(stripe[1] + 0.12), stripe[1] + 0.12], [front(stripe[1] + 0.12) - 0.08, stripe[1] + 0.12], [front(stripe[1]) - 0.2, stripe[1]], [rear(stripe[1]), stripe[1]]],
    [[rear(thin[0]) + 0.3, thin[0]], [front(thin[0]) - 0.05, thin[0]], [front(thin[1]) - 0.08, thin[1]], [rear(thin[1]) + 0.3, thin[1]]],
  ]
}

/** Flat outline in the (z, y) plane extruded forward along +x, for parts mounted on the nose. */
function useFrontPanel(outline, depth, bevel = 0.006) {
  const key = JSON.stringify(outline)
  return useDisposeOnChange(useMemo(() => {
    const shape = new THREE.Shape(JSON.parse(key).map(([z, y]) => new THREE.Vector2(-z, y)))
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8,
    })
    geometry.rotateY(Math.PI / 2)
    return geometry
  }, [key, depth, bevel]))
}

/** Places a group on the nose between two heights, leaning with the front face. */
function noseMount(noseAt, top, bottom) {
  return {
    position: [(noseAt(top) + noseAt(bottom)) / 2, (top + bottom) / 2, 0],
    rotation: [0, 0, Math.atan2(noseAt(bottom) - noseAt(top), top - bottom)],
  }
}

/** Leader-style front: tall trapezoid grille with heavy chrome bars, black bumper, fog-lamp blades and skid plate. */
function LeaderFront({ s, noseAt, halfWidth }) {
  const top = s.lamps.front + 0.05
  const bottom = s.clearance + 0.32
  const h = (top - bottom) / 2
  const [gTop, gBottom] = [halfWidth * 0.55, halfWidth * 0.4]
  const grille = useFrontPanel([[-gTop, h], [gTop, h], [gTop - 0.04, -h * 0.35], [gBottom, -h], [-gBottom, -h], [-gTop + 0.04, -h * 0.35]], 0.05)
  const bumperTop = bottom - 0.02
  const bumperBottom = s.clearance + 0.1
  const bh = (bumperTop - bumperBottom) / 2
  const bumper = useFrontPanel([[-halfWidth, bh], [halfWidth, bh], [halfWidth * 1.01, -bh], [-halfWidth * 1.01, -bh]], 0.05)
  const intake = useFrontPanel([[-gBottom * 0.95, bh * 0.7], [gBottom * 0.95, bh * 0.7], [gBottom * 0.8, -bh * 0.55], [-gBottom * 0.8, -bh * 0.55]], 0.03)
  const blade = useFrontPanel([[-0.025, bh * 0.95], [0.035, bh * 0.95], [0.02, -bh * 0.8], [-0.04, -bh * 0.8]], 0.03)
  const barWidth = (y) => gBottom + ((y + h) / (2 * h)) * (gTop - gBottom)
  const grilleMount = noseMount(noseAt, top, bottom)
  const bumperMount = noseMount(noseAt, bumperTop, bumperBottom)
  return (
    <group>
      <group {...grilleMount}>
        <mesh geometry={grille} position={[-0.035, 0, 0]}>
          <meshPhysicalMaterial color="#08090b" roughness={0.25} metalness={0.4} clearcoat={1} />
        </mesh>
        {[0.72, 0.36, 0, -0.36].map((t) => (
          <mesh key={t} position={[0.03, t * h, 0]}>
            <boxGeometry args={[0.035, 0.035, barWidth(t * h) * 2 - 0.06]} />
            <meshStandardMaterial color={CHROME} metalness={1} roughness={0.12} />
          </mesh>
        ))}
        <mesh position={[0.025, h - 0.008, 0]}>
          <boxGeometry args={[0.04, 0.028, gTop * 2 + 0.04]} />
          <meshStandardMaterial color={CHROME} metalness={1} roughness={0.12} />
        </mesh>
      </group>

      <group {...bumperMount}>
        <mesh geometry={bumper} position={[-0.03, 0, 0]}>
          <meshStandardMaterial color="#111316" roughness={0.5} metalness={0.25} />
        </mesh>
        <mesh geometry={intake} position={[0.018, 0, 0]}>
          <meshStandardMaterial color="#050607" roughness={0.75} />
        </mesh>
        {[-0.2, 0.15].map((y) => (
          <mesh key={y} position={[0.05, y * bh, 0]}>
            <boxGeometry args={[0.01, 0.01, gBottom * 1.5]} />
            <meshStandardMaterial color="#3a4047" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        {/* Chrome accent across the top of the bumper. */}
        <mesh position={[0.024, bh * 0.82, 0]}>
          <boxGeometry args={[0.02, 0.014, halfWidth * 1.7]} />
          <meshStandardMaterial color={CHROME} metalness={1} roughness={0.12} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[0.02, 0, side * halfWidth * 0.8]} scale={[1, 1, side]}>
            <mesh geometry={blade}>
              <meshPhysicalMaterial color="#0b0c0e" roughness={0.2} metalness={0.5} clearcoat={1} />
            </mesh>
            <mesh position={[0.032, 0, 0.004]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.006, bh * 1.4, 0.012]} />
              <meshStandardMaterial color="#ffffff" emissive="#eaf4ff" emissiveIntensity={1.2} />
            </mesh>
            <mesh position={[0.03, -bh * 0.45, -0.06]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.026, 0.026, 0.012, 20]} />
              <meshStandardMaterial color="#f5f9ff" emissive="#d6ecff" emissiveIntensity={0.7} metalness={0.4} roughness={0.1} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Body-kit lip spoiler with a silver skid plate. */}
      <group position={[noseAt(s.clearance + 0.08) + 0.04, s.clearance + 0.05, 0]}>
        <mesh>
          <boxGeometry args={[0.16, 0.035, halfWidth * 2]} />
          <meshStandardMaterial color="#0f1113" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[0.06, 0.02, 0]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.08, 0.012, halfWidth * 0.9]} />
          <meshStandardMaterial color="#aeb5bc" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
    </group>
  )
}

/** Slim LED headlamps sweeping out and up from the grille's top corners. */
function LeaderHeadlamps({ s, noseAt, halfWidth }) {
  const y = s.lamps.front
  const inner = halfWidth * 0.57
  const outer = halfWidth * 0.98
  const outline = [[inner, 0.035], [outer - 0.03, 0.065], [outer, 0.045], [outer - 0.06, -0.025], [inner + 0.05, -0.05], [inner, -0.03]]
  const housing = useFrontPanel(outline, 0.04)
  const mount = noseMount(noseAt, y + 0.07, y - 0.05)
  return (
    <group {...mount}>
      {[-1, 1].map((side) => (
        <group key={side} scale={[1, 1, side]}>
          <mesh geometry={housing} position={[-0.02, -0.01, 0]}>
            <Mat color="#0d1014" metalness={0.7} roughness={0.15} />
          </mesh>
          {/* LED daytime-running strip along the upper edge. */}
          <mesh position={[0.024, 0.032, (inner + outer) / 2 + 0.01]} rotation={[0.07, 0, 0]}>
            <boxGeometry args={[0.008, 0.012, outer - inner - 0.06]} />
            <Mat color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
          </mesh>
          {[0.18, 0.28].map((t) => (
            <mesh key={t} position={[0.024, -0.002, inner + t * (outer - inner) * 1.4]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.022, 0.022, 0.01, 20]} />
              <Mat color="#f5f9ff" emissive="#d6ecff" emissiveIntensity={0.9} metalness={0.4} roughness={0.1} />
            </mesh>
          ))}
          <mesh position={[0.024, -0.02, outer - 0.09]}>
            <boxGeometry args={[0.008, 0.012, 0.06]} />
            <Mat color="#ffb347" emissive="#ff9a1f" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Exterior trim laid onto the body: framed side glass, pillars, door seams and handles. */
function useSideTrim(s, frame) {
  const trim = useMemo(() => {
    const xs = s.windows.map(([x]) => x)
    const windowFront = Math.max(...xs)
    const windowRear = Math.min(...xs)
    const pillars = []
    if (windowFront - windowRear > 1.5) pillars.push((s.frontAxle + s.rearAxle) / 2 - 0.05)
    if (windowRear < s.rearAxle - 0.3) pillars.push(s.rearAxle + 0.1)
    const frontEdge = Math.min(s.windshield[0][0] - 0.04, s.frontAxle - frame.archRadius - 0.05)
    const rearEdge = Math.max(s.rearAxle + frame.archRadius + 0.02, windowRear)
    const seams = [frontEdge, ...(pillars.length ? [pillars[0]] : []), rearEdge]
    const seamBottom = (x) => {
      const bottom = frame.bottomAt(x)
      return bottom + 0.26 * ((frame.topAt(x) ?? frame.belt) - bottom)
    }
    const rect = (x1, x2, y1, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
    const build = (side) => ({
      trim: [surfacePatch(frame, s.windows, side, 0.016, 0.035)],
      glass: [surfacePatch(frame, s.windows, side, 0.024)],
      pillars: pillars.map((x) => surfacePatch(frame, rect(x - 0.045, x + 0.045, frame.belt, (heightAt(s.windows, x) ?? frame.belt) + 0.02), side, 0.03)),
      seams: seams.map((x) => surfacePatch(frame, rect(x - 0.005, x + 0.005, seamBottom(x), frame.belt + 0.01), side, 0.004)),
      decals: s.styling ? sideDecals(s, frame).map((outline) => surfacePatch(frame, outline, side, 0.006)) : [],
    })
    const handles = seams.slice(1).map((x) => x + 0.2)
    return { left: build(-1), right: build(1), handles }
  }, [s, frame])
  useEffect(() => () => [trim.left, trim.right].forEach((set) => Object.values(set).flat().forEach((geometry) => geometry.dispose())), [trim])
  return trim
}

/** Keeps the coded shell on screen if a 3D asset fails to load or parse. */
class AssetBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('3D vehicle asset could not be loaded; showing the built-in model instead.', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Checks the asset exists before loading it: a missing file would otherwise come
 * back as the dev server's HTML page and fail inside the GLTF parser.
 */
function VehicleAsset(props) {
  const { url } = props.asset
  const [available, setAvailable] = useState(null)
  useEffect(() => {
    let live = true
    fetch(url, { method: 'HEAD' })
      .then((response) => live && setAvailable(response.ok && !(response.headers.get('content-type') || '').includes('text/html')))
      .catch(() => live && setAvailable(false))
    return () => { live = false }
  }, [url])
  return available ? <LoadedAsset {...props} /> : null
}

/** A real vehicle model scaled to the rig's length, centred on it and standing on the ground. */
function LoadedAsset({ asset, spec, xray, bodyEvents, onReady }) {
  const { scene } = useGLTF(asset.url)
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.rotation.y = asset.rotationY || 0
    root.updateMatrixWorld(true)
    let size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
    // The rig's length runs along x; turn models authored along z.
    if (size.z > size.x) {
      root.rotation.y += Math.PI / 2
      root.updateMatrixWorld(true)
      size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
    }
    root.scale.setScalar(spec.length / size.x)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const centre = box.getCenter(new THREE.Vector3())
    root.position.set(-centre.x, -box.min.y, -centre.z)
    // Own copies of the materials so x-ray never alters the cached asset.
    const materials = []
    root.traverse((object) => {
      if (!object.isMesh) return
      object.material = Array.isArray(object.material) ? object.material.map((material) => material.clone()) : object.material.clone()
      ;[].concat(object.material).forEach((material) => {
        material.userData.base = { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite }
        materials.push(material)
      })
    })
    root.userData.materials = materials
    return root
  }, [scene, asset.rotationY, spec.length])

  useEffect(() => {
    model.userData.materials.forEach((material) => {
      const base = material.userData.base
      material.transparent = xray || base.transparent
      material.opacity = xray ? Math.min(base.opacity, 0.11) : base.opacity
      material.depthWrite = xray ? false : base.depthWrite
      material.needsUpdate = true
    })
  }, [model, xray])

  useEffect(() => {
    onReady(true)
    return () => {
      onReady(false)
      model.userData.materials.forEach((material) => material.dispose())
    }
  }, [model, onReady])

  return <primitive object={model} {...bodyEvents} />
}

function CarModel({ rig, paint, xray, interaction }) {
  const s = rig.spec
  // Set by the loaded asset; it resets this itself when it unmounts.
  const [assetReady, setAssetReady] = useState(false)
  const { half, track, width, wheelRadius: R, tireWidth } = s
  const [ex, ey] = s.engine
  const [ew] = s.engineSize
  const axles = [s.frontAxle, s.rearAxle]

  const frame = useMemo(() => bodyFrame(s), [s])
  const body = useDisposeOnChange(useMemo(() => loftBody(s), [s]))
  const trim = useSideTrim(s, frame)
  const bedSide = useDisposeOnChange(useMemo(() => (s.bed
    ? extrude(profileShape([[s.bed.front, s.clearance + 0.12], [s.bed.front, s.bed.top], [s.bed.rear, s.bed.top], [s.bed.rear, s.clearance + 0.12]], [s.frontAxle, s.rearAxle], s.wheelRadius, s.clearance + 0.12), 0.07, 0.015)
    : new THREE.BufferGeometry()), [s]))
  const spring = useSpringGeometry(R * 1.05, 0.07)

  // In x-ray the shell becomes a pale ghost so the components inside read clearly.
  const ghostColor = useMemo(() => `#${new THREE.Color(paint).lerp(new THREE.Color('#dce6f0'), 0.65).getHexString()}`, [paint])
  // Light paints read as solid pearl white rather than grey metallic.
  const pearl = useMemo(() => new THREE.Color(paint).getHSL({}).l > 0.75, [paint])
  // `vertexColors` only for the lofted shell, which carries the two-tone roof colours.
  const paintMaterial = (vertexColors) => (
    <meshPhysicalMaterial
      key={`${xray ? 'xray' : 'solid'}${vertexColors}`}
      color={xray ? ghostColor : paint}
      vertexColors={vertexColors && !xray}
      metalness={pearl ? 0.12 : 0.55}
      roughness={pearl ? 0.22 : 0.3}
      clearcoat={1}
      clearcoatRoughness={0.08}
      envMapIntensity={1.25}
      transparent={xray}
      opacity={xray ? 0.11 : 1}
      depthWrite={!xray}
    />
  )
  const bodyMaterial = paintMaterial(false)
  const trimMaterial = <meshStandardMaterial color={TRIM} roughness={0.55} metalness={0.2} />
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
  const catAt = new THREE.Vector3(...exhaustPath[1]).lerp(new THREE.Vector3(...exhaustPath[2]), 0.35)

  const halfWidthAt = (x) => (width / 2) * frame.planFactor(x)
  const noseAt = (y) => frame.endX(y, 1)
  const noseHalf = halfWidthAt(noseAt(s.lamps.front)) * 0.9
  const tailAt = (y) => (s.bed ? s.bed.rear : frame.endX(y, -1))
  const glassWidth = (x, y, inset) => 2 * frame.surfaceZ(x, Math.min(y, frame.belt)) * inset
  const archStart = Math.asin(THREE.MathUtils.clamp((s.clearance - R) / frame.archRadius, -1, 1))
  const archSweep = Math.PI - 2 * archStart
  // The lip only follows the arch where the body side is vertical, above the tuck-under.
  const lipStart = Math.asin(THREE.MathUtils.clamp((s.clearance + 0.26 * (rig.height - s.clearance) - R) / frame.archRadius, -1, 0.6))
  const [wsX, wsY] = s.windshield[0]
  const grilleY = s.lamps.front - 0.13
  const plateY = (s.lamps.front + s.clearance) / 2 - 0.02
  const intakeY = s.clearance + 0.1

  return (
    <group>
      {rig.asset && (
        <AssetBoundary key={rig.asset.url}>
          <Suspense fallback={null}>
            <VehicleAsset asset={rig.asset} spec={s} xray={xray} bodyEvents={bodyEvents} onReady={setAssetReady} />
          </Suspense>
        </AssetBoundary>
      )}

      {/* Coded exterior shell; hidden (but still hit-testable) once a real 3D asset has loaded. */}
      <group visible={!assetReady}>
      <mesh geometry={body} {...bodyEvents}>{paintMaterial(true)}</mesh>
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
        <group {...bodyEvents}>
          {[trim.left, trim.right].map((set, index) => (
            <group key={index}>
              {[...set.trim, ...set.pillars, ...set.seams, ...set.decals].map((geometry) => (
                <mesh key={geometry.uuid} geometry={geometry}>{trimMaterial}</mesh>
              ))}
              {set.glass.map((geometry) => (
                <mesh key={geometry.uuid} geometry={geometry}><GlassMat /></mesh>
              ))}
            </group>
          ))}
          {[-1, 1].map((side) => trim.handles.map((x) => (
            <mesh key={`${side}${x}`} position={[x, frame.belt - 0.07, side * (frame.surfaceZ(x, frame.belt - 0.07) + 0.012)]}>
              <boxGeometry args={[0.15, 0.028, 0.022]} />
              <meshStandardMaterial color={CHROME} metalness={1} roughness={0.15} />
            </mesh>
          )))}
          <GlassPanel segment={s.windshield} widths={[glassWidth(...s.windshield[0], 0.9), glassWidth(...s.windshield[1], 0.68)]} />
          {s.rearWindow && <GlassPanel segment={s.rearWindow} widths={[glassWidth(...s.rearWindow[0], 0.68), glassWidth(...s.rearWindow[1], 0.9)]} />}

          {/* Wipers at the base of the windshield. */}
          {[-0.05, 0.38].map((z) => (
            <mesh key={z} position={[wsX - 0.02, wsY + 0.035, z - width * 0.18]} rotation={[0.08, 0, 0]}>
              <boxGeometry args={[0.02, 0.015, width * 0.36]} />
              {trimMaterial}
            </mesh>
          ))}

          {/* Side mirrors on the door, just behind the A-pillar. */}
          {[-1, 1].map((side) => {
            const z = side * frame.surfaceZ(wsX - 0.12, wsY + 0.04)
            return (
              <group key={side} position={[wsX - 0.12, wsY + 0.04, z]}>
                <mesh position={[0, 0, side * 0.04]}>
                  <boxGeometry args={[0.07, 0.03, 0.08]} />
                  {trimMaterial}
                </mesh>
                <mesh position={[-0.01, 0.03, side * 0.13]} scale={[0.065, 0.06, 0.11]}>
                  <sphereGeometry args={[1, 24, 16]} />
                  {s.styling ? trimMaterial : bodyMaterial}
                </mesh>
                <mesh position={[-0.045, 0.03, side * 0.13]} rotation={[0, Math.PI / 2, 0]}>
                  <planeGeometry args={[0.18, 0.09]} />
                  <meshStandardMaterial color="#c5d4df" metalness={1} roughness={0.05} side={THREE.DoubleSide} />
                </mesh>
              </group>
            )
          })}

          {/* Black wheel-arch lips and liners. */}
          {axles.map((axle) => [-1, 1].map((side) => (
            <group key={`${axle}${side}`} position={[axle, R, 0]}>
              <mesh position={[0, 0, side * (halfWidthAt(axle) - 0.005)]} rotation={[0, 0, lipStart]}>
                <torusGeometry args={[frame.archRadius, s.styling ? 0.034 : 0.02, 8, 40, Math.PI - 2 * lipStart]} />
                {trimMaterial}
              </mesh>
              <mesh position={[0, 0, side * (halfWidthAt(axle) * 0.8 - 0.22)]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[frame.archRadius - 0.006, frame.archRadius - 0.006, 0.4, 40, 1, true, archStart + Math.PI / 2, archSweep]} />
                <meshStandardMaterial color="#0d0f12" roughness={0.9} side={THREE.DoubleSide} />
              </mesh>
            </group>
          )))}

          {s.styling && <LeaderFront s={s} noseAt={noseAt} halfWidth={noseHalf} />}

          {/* Front fascia: grille, lower intake and number plate. */}
          {!s.styling && (
          <group position={[noseAt(grilleY), grilleY, 0]}>
            <mesh position={[-0.01, 0, 0]}>
              <boxGeometry args={[0.04, 0.15, width * 0.4]} />
              <meshStandardMaterial color={CHROME} metalness={1} roughness={0.18} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.045, 0.12, width * 0.37]} />
              <meshStandardMaterial color="#0a0b0d" roughness={0.6} />
            </mesh>
            {[-0.032, 0, 0.032].map((y) => (
              <mesh key={y} position={[0.006, y, 0]}>
                <boxGeometry args={[0.04, 0.008, width * 0.36]} />
                <meshStandardMaterial color="#5a636b" metalness={0.9} roughness={0.25} />
              </mesh>
            ))}
          </group>
          )}
          {!s.styling && (
            <mesh position={[noseAt(intakeY) - 0.01, intakeY, 0]}>
              <boxGeometry args={[0.04, 0.09, width * 0.58]} />
              <meshStandardMaterial color="#0a0b0d" roughness={0.7} />
            </mesh>
          )}
          {[...(s.styling ? [] : [[noseAt(plateY) + 0.006, plateY]]), [tailAt(s.lamps.rear - 0.24) - 0.006, s.lamps.rear - 0.24]].map(([x, y]) => (
            <group key={x} position={[x, y, 0]}>
              <mesh>
                <boxGeometry args={[0.014, 0.12, 0.36]} />
                <meshStandardMaterial color="#1a1d21" roughness={0.5} />
              </mesh>
              <mesh position={[Math.sign(x) * 0.004, 0, 0]}>
                <boxGeometry args={[0.014, 0.1, 0.34]} />
                <meshStandardMaterial color="#f1f3f4" roughness={0.4} />
              </mesh>
            </group>
          ))}
          <mesh position={[tailAt(s.clearance + 0.1) + 0.01, s.clearance + 0.1, 0]}>
            <boxGeometry args={[0.04, 0.1, width * 0.7]} />
            <meshStandardMaterial color="#121417" roughness={0.65} />
          </mesh>

          {rig.type === 'suv' && [-1, 1].map((side) => (
            <Rod key={side} from={[s.windshield[1][0] - 0.1, rig.height + 0.04, side * width * 0.36]} to={[s.rearWindow[0][0] + 0.15, rig.height + 0.04, side * width * 0.36]} radius={0.016} color="#2a2e33" metalness={0.6} roughness={0.35} />
          ))}

          {s.styling && (
            <>
              {/* Black side steps between the wheel arches. */}
              {[-1, 1].map((side) => {
                const front = s.frontAxle - frame.archRadius - 0.04
                const rear = s.rearAxle + frame.archRadius + 0.04
                return (
                  <group key={side} position={[(front + rear) / 2, s.clearance + 0.01, side * (halfWidthAt(0) - 0.01)]}>
                    <mesh>
                      <boxGeometry args={[front - rear, 0.045, 0.17]} />
                      <meshStandardMaterial color="#141619" roughness={0.45} metalness={0.35} />
                    </mesh>
                    <mesh position={[0, 0.024, side * 0.02]}>
                      <boxGeometry args={[front - rear - 0.04, 0.006, 0.11]} />
                      <meshStandardMaterial color="#2c3036" roughness={0.85} />
                    </mesh>
                  </group>
                )
              })}
              {/* Roof spoiler over the tailgate glass. */}
              <mesh position={[s.rearWindow[0][0] - 0.06, rig.height - 0.01, 0]} rotation={[0, 0, 0.12]}>
                <boxGeometry args={[0.2, 0.035, width * 0.8]} />
                <meshStandardMaterial color="#121417" roughness={0.35} metalness={0.3} />
              </mesh>
            </>
          )}
        </group>
      )}
      </group>

      <Part id="engine" interaction={interaction}>
        <Engine s={s} />
      </Part>

      <Part id="battery" interaction={interaction}>
        <group position={[ex - ew / 2 - 0.12, ey + 0.04, -width * 0.3]}>
          <mesh>
            <boxGeometry args={[0.25, 0.19, 0.18]} />
            <Mat color="#2a2f35" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.105, 0]}>
            <boxGeometry args={[0.25, 0.025, 0.18]} />
            <Mat color="#e8ecef" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.02, -0.091]}>
            <boxGeometry args={[0.2, 0.06, 0.004]} />
            <Mat color="#2f7de1" roughness={0.4} emissive="#2f7de1" emissiveIntensity={0.15} />
          </mesh>
          {[[-0.08, '#d63b2f'], [0.08, '#1d2228']].map(([offset, color]) => (
            <mesh key={offset} position={[offset, 0.135, 0.05]}>
              <cylinderGeometry args={[0.018, 0.02, 0.04, 12]} />
              <Mat color={color} metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          <Tube points={[[-0.08, 0.155, 0.05], [-0.06, 0.2, 0.12], [0.1, 0.12, 0.2]]} radius={0.011} color="#d63b2f" metalness={0.1} roughness={0.6} />
          <Tube points={[[0.08, 0.155, 0.05], [0.12, 0.17, -0.02], [0.16, 0.05, -0.12]]} radius={0.011} color="#1d2228" metalness={0.1} roughness={0.6} />
        </group>
      </Part>

      <Part id="cooling" interaction={interaction}>
        <Cooling s={s} />
      </Part>

      <Part id="transmission" interaction={interaction}>
        <group position={[ex - ew / 2 - 0.3, s.clearance + 0.2, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.17, 0.6, 24]} />
            <Mat color="#b3bbc2" metalness={0.8} roughness={0.32} />
          </mesh>
          {[-0.18, -0.04, 0.1].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.135 - x * 0.12, 0.01, 6, 28]} />
              <Mat color="#8a939b" metalness={0.8} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0.02, -0.14, 0]}>
            <boxGeometry args={[0.3, 0.05, 0.2]} />
            <Mat color="#4a5158" metalness={0.6} roughness={0.45} />
          </mesh>
          <mesh position={[-0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.075, 0.14, 18]} />
            <Mat color="#9ca5ad" metalness={0.8} roughness={0.35} />
          </mesh>
        </group>
      </Part>
      <Rod from={[ex - ew / 2 - 0.62, s.clearance + 0.18, 0]} to={[s.rearAxle, R, 0]} radius={0.03} color="#5b636b" metalness={0.75} roughness={0.35} />
      <mesh position={[s.rearAxle, R, 0]} scale={[1, 1, 1.15]}>
        <sphereGeometry args={[0.13, 20, 14]} />
        <meshStandardMaterial color="#565e66" metalness={0.75} roughness={0.4} />
      </mesh>
      <Rod from={[s.rearAxle, R, -(track - 0.1)]} to={[s.rearAxle, R, track - 0.1]} radius={0.035} color="#565e66" metalness={0.75} roughness={0.4} />

      <Part id="exhaust" interaction={interaction}>
        <Tube points={exhaustPath} radius={0.03} color="#9aa1a8" metalness={0.85} roughness={0.3} />
        <mesh position={catAt} rotation={[0, 0, Math.PI / 2]} scale={[0.7, 1, 1]}>
          <cylinderGeometry args={[0.075, 0.075, 0.34, 20]} />
          <Mat color="#c9ced3" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[s.rearAxle - 0.3, s.clearance + 0.07, -0.38]} rotation={[0, 0, Math.PI / 2]} scale={[0.62, 1, 1]}>
          <cylinderGeometry args={[0.13, 0.13, 0.55, 24]} />
          <Mat color="#b0b6bc" metalness={0.85} roughness={0.3} />
        </mesh>
        <Rod from={[s.rearAxle - 0.55, s.clearance + 0.06, -0.42]} to={[-half + 0.12, s.clearance + 0.05, -0.48]} radius={0.032} color="#a3a9af" metalness={0.85} roughness={0.3} />
        <mesh position={[-half + 0.07, s.clearance + 0.05, -0.48]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.042, 0.12, 24, 1, true]} />
          <Mat color={CHROME} metalness={1} roughness={0.1} side={THREE.DoubleSide} />
        </mesh>
      </Part>

      <Part id="steering" interaction={interaction}>
        <Rod from={[s.frontAxle - 0.18, R * 0.95, -0.36]} to={[s.frontAxle - 0.18, R * 0.95, 0.36]} radius={0.034} color="#b8c0c7" metalness={0.85} roughness={0.28} />
        {[-1, 1].map((side) => (
          <group key={side}>
            {[0, 0.03, 0.06].map((offset) => (
              <mesh key={offset} position={[s.frontAxle - 0.18, R * 0.95, side * (0.38 + offset)]}>
                <torusGeometry args={[0.03, 0.012, 8, 18]} />
                <Mat color="#17191c" roughness={0.8} />
              </mesh>
            ))}
            <Rod from={[s.frontAxle - 0.18, R * 0.95, side * 0.42]} to={[s.frontAxle - 0.14, R * 0.92, side * (track - 0.14)]} radius={0.015} color="#8d959c" metalness={0.85} roughness={0.3} />
          </group>
        ))}
        <Rod from={[s.frontAxle - 0.18, R * 0.95, -0.3]} to={[wsX - 0.45, wsY + 0.05, -width * 0.2]} radius={0.022} color="#6e767e" metalness={0.8} roughness={0.3} />
        <group position={[wsX - 0.5, wsY + 0.08, -width * 0.2]} rotation={[0, Math.PI / 2, 0.45]}>
          <mesh>
            <torusGeometry args={[0.17, 0.022, 12, 40]} />
            <Mat color="#1f2226" roughness={0.65} />
          </mesh>
          {[0, Math.PI, -Math.PI / 2].map((angle) => (
            <mesh key={angle} position={[Math.cos(angle) * 0.085, Math.sin(angle) * 0.085, 0]} rotation={[0, 0, angle]}>
              <boxGeometry args={[0.15, 0.03, 0.016]} />
              <Mat color="#aab2b9" metalness={0.85} roughness={0.25} />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.04, 24]} />
            <Mat color="#25292e" roughness={0.5} />
          </mesh>
        </group>
      </Part>

      <Part id="suspension" interaction={interaction}>
        {axles.map((axle) => [-1, 1].map((side) => (
          <group key={`${axle}${side}`}>
            <Spring geometry={spring} position={[axle - 0.04, R, side * (track - 0.3)]} />
            <Rod from={[axle, R * 0.72, side * (track - 0.12)]} to={[axle + 0.22, R * 0.72, side * 0.3]} radius={0.02} color="#3e454c" metalness={0.7} roughness={0.4} />
            <Rod from={[axle, R * 0.72, side * (track - 0.12)]} to={[axle - 0.22, R * 0.72, side * 0.3]} radius={0.02} color="#3e454c" metalness={0.7} roughness={0.4} />
            <Rod from={[axle - 0.04, R * 0.98, side * (track - 0.3)]} to={[axle, R * 0.72, side * (track - 0.12)]} radius={0.022} color="#3e454c" metalness={0.7} roughness={0.4} />
          </group>
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

      <group visible={!assetReady}>
      {wheels.map(([id, axle, side]) => (
        <Part key={id} id={id} interaction={interaction}>
          <Wheel position={[axle, R, wheelZ[side]]} radius={R} width={tireWidth} side={side === 'left' ? -1 : 1} spokes={s.spokes} rimColor={s.rimColor} />
        </Part>
      ))}

      <Part id="lighting" interaction={interaction}>
        {s.styling && <LeaderHeadlamps s={s} noseAt={noseAt} halfWidth={noseHalf} />}
        {[-1, 1].map((side) => {
          const frontX = noseAt(s.lamps.front)
          const rearX = tailAt(s.lamps.rear)
          const frontZ = side * (halfWidthAt(frontX) - 0.27)
          const rearZ = side * (halfWidthAt(rearX) - 0.24)
          return (
            <group key={side}>
              <group position={[frontX, s.lamps.front, frontZ]} visible={!s.styling}>
                <mesh position={[-0.02, 0, 0]}>
                  <boxGeometry args={[0.06, 0.13, 0.38]} />
                  <Mat color="#1b1f23" metalness={0.7} roughness={0.25} />
                </mesh>
                <mesh position={[0.014, 0, 0]}>
                  <boxGeometry args={[0.012, 0.115, 0.36]} />
                  <Mat color="#dfe8ef" metalness={0.3} roughness={0.08} />
                </mesh>
                {[-0.08, 0.06].map((offset) => (
                  <mesh key={offset} position={[0.022, -0.01, side * offset]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.035, 0.035, 0.01, 24]} />
                    <Mat color="#f5f9ff" emissive="#d6ecff" emissiveIntensity={0.9} metalness={0.4} roughness={0.1} />
                  </mesh>
                ))}
                <mesh position={[0.024, 0.044, 0]}>
                  <boxGeometry args={[0.008, 0.014, 0.33]} />
                  <Mat color="#ffffff" emissive="#ffffff" emissiveIntensity={1.4} />
                </mesh>
                <mesh position={[0.022, -0.035, side * 0.15]}>
                  <boxGeometry args={[0.008, 0.03, 0.05]} />
                  <Mat color="#ffb347" emissive="#ff9a1f" emissiveIntensity={0.5} />
                </mesh>
              </group>
              <group position={[rearX, s.lamps.rear, rearZ]}>
                <mesh position={[0.012, 0, 0]}>
                  <boxGeometry args={[0.05, 0.13, 0.42]} />
                  <Mat color="#7a1010" roughness={0.18} metalness={0.2} emissive="#c81d1d" emissiveIntensity={0.35} />
                </mesh>
                <mesh position={[-0.016, 0.02, 0]}>
                  <boxGeometry args={[0.008, 0.02, 0.38]} />
                  <Mat color="#ff3b3b" emissive="#ff2222" emissiveIntensity={1.6} />
                </mesh>
                <mesh position={[-0.016, -0.035, -side * 0.12]}>
                  <boxGeometry args={[0.008, 0.035, 0.1]} />
                  <Mat color="#f2f4f6" roughness={0.15} />
                </mesh>
              </group>
            </group>
          )
        })}
      </Part>
      </group>
    </group>
  )
}

// Cars with a real 3D asset. VehicleModel.jsx routes them here; every other vehicle uses its carBody.js shell.
export default function FortunerModel(props) {
  return <CarModel {...props} />
}
