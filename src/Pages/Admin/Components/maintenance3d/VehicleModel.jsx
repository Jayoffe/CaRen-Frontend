import { createContext, useContext, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { archLip, archLiners, bodyGeometry, carSurface, cornerLamp, endPanel, panelSeams, sidePanel, sideWindow, topGlass, wheelGeometry, windowTop } from './carBody.js'

const HIGHLIGHT = '#36b6ff'
const HOVER = '#8fd3ff'

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

function Wheel({ position, radius, width, spokes = 5, rimColor = '#c8ced4', side = 1 }) {
  const parts = useMemo(() => wheelGeometry(radius, width, spokes), [radius, width, spokes])
  useEffect(() => () => {
    Object.values(parts).forEach((part) => part?.dispose?.())
  }, [parts])
  return (
    <group position={position} scale={[1, 1, side]}>
      <mesh geometry={parts.tire}>
        <Mat color="#17181a" roughness={0.88} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.barrel}>
        <Mat color="#2b2f34" metalness={0.65} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, parts.lipZ]}>
        <torusGeometry args={[parts.lipRadius, 0.0095, 8, 56]} />
        <Mat color={rimColor} metalness={0.95} roughness={0.2} />
      </mesh>
      <mesh geometry={parts.spokes}>
        <Mat color={rimColor} metalness={0.95} roughness={0.26} />
      </mesh>
      <mesh geometry={parts.lugs}>
        <Mat color="#3c4147" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh geometry={parts.centre}>
        <Mat color="#1f2226" metalness={0.5} roughness={0.35} />
      </mesh>
    </group>
  )
}

function BrakeAssembly({ position, radius, side, caliperAngle = 0.5 }) {
  const caliper = useMemo(() => {
    const spread = 0.42
    const shape = new THREE.Shape()
    shape.absarc(0, 0, radius * 1.02, caliperAngle - spread, caliperAngle + spread, false)
    shape.absarc(0, 0, radius * 0.66, caliperAngle + spread, caliperAngle - spread, true)
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 })
    geometry.translate(0, 0, -0.035)
    return geometry
  }, [radius, caliperAngle])
  useEffect(() => () => caliper.dispose(), [caliper])
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, 0.026, 40]} />
        <Mat color="#9aa1a8" metalness={0.92} roughness={0.34} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * 0.018]}>
        <cylinderGeometry args={[radius * 0.42, radius * 0.46, 0.026, 28]} />
        <Mat color="#4a5057" metalness={0.75} roughness={0.42} />
      </mesh>
      <mesh geometry={caliper} position={[0, 0, side * 0.005]}>
        <Mat color="#b5322a" metalness={0.35} roughness={0.42} />
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

const noHit = { raycast: () => null }
const GLASS = { color: '#51707f', roughness: 0.16, metalness: 1, envMapIntensity: 0.95 }
const TRIM = { color: '#0d0e10', roughness: 0.62, metalness: 0.15 }
const CHROME = { color: '#d8dde2', roughness: 0.14, metalness: 1 }

/** Every painted-on and bolted-on exterior detail: glass, trim, seams, mirrors and handles. */
function useExterior(s) {
  const exterior = useMemo(() => {
    const surface = carSurface(s)
    const { belt, sideZ, topY } = surface
    const windowXs = s.windows.map(([x]) => x)
    const windowFront = Math.max(...windowXs)
    const windowRear = Math.min(...windowXs)
    const doorRear = Math.max(windowRear + 0.06, s.rearAxle + surface.archRadius + 0.04)
    const pillarX = (windowFront + doorRear) / 2 - 0.02
    const handleXs = s.type === 'van' ? [pillarX + (windowRear - pillarX) * 0.1] : [pillarX + 0.14, doorRear + 0.14]
    const sills = {
      x0: s.frontAxle - surface.archRadius - 0.01,
      x1: s.rearAxle + surface.archRadius + 0.01,
    }
    const lampFront = {
      y0: s.lamps.front - 0.085,
      y1: s.lamps.front + 0.035,
      inner: s.width * 0.24,
      reach: 0.42,
    }
    const lampRear = {
      y0: s.lamps.rear - 0.08,
      y1: s.lamps.rear + 0.075,
      inner: s.width * 0.2,
      reach: 0.34,
    }
    const noseY = s.lamps.front
    const geometry = {
      body: bodyGeometry(surface),
      seams: panelSeams(surface, s),
      liners: archLiners(surface, s),
      lips: mergeGeometries([s.frontAxle, ...(s.bed ? [] : [s.rearAxle])].flatMap((axle) => [-1, 1].map((side) => archLip(surface, s, axle, side)))),
      glass: [-1, 1].map((side) => sideWindow(surface, s.windows, { side })),
      frames: [-1, 1].map((side) => sideWindow(surface, s.windows, { side, grow: 0.022, offset: 0.0055 })),
      pillars: [-1, 1].map((side) => sidePanel(surface, { x0: pillarX - 0.03, x1: pillarX + 0.03, y0: belt + 0.03, y1: windowTop(s.windows, pillarX) - 0.004, side, offset: 0.0115, columns: 3, rows: 8 })),
      sills: [-1, 1].map((side) => sidePanel(surface, { x0: sills.x0, x1: sills.x1, y0: s.clearance + 0.012, y1: s.clearance + 0.098, side, offset: 0.0045, columns: 30, rows: 4 })),
      windshield: topGlass(surface, { segment: s.windshield, frontU: 0.8, backU: 0.625 }),
      windshieldFrame: topGlass(surface, { segment: s.windshield, frontU: 0.8, backU: 0.625, offset: 0.004, grow: 0.024 }),
      rearGlass: s.rearWindow && topGlass(surface, { segment: s.rearWindow, frontU: 0.62, backU: 0.78 }),
      rearFrame: s.rearWindow && topGlass(surface, { segment: s.rearWindow, frontU: 0.62, backU: 0.78, offset: 0.004, grow: 0.024 }),
      grille: endPanel(surface, { end: 1, width: s.width * 0.235, y0: noseY - 0.19, y1: noseY - 0.055, round: 6, offset: 0.006 }),
      intake: endPanel(surface, { end: 1, width: s.width * 0.3, y0: s.clearance + 0.125, y1: s.clearance + 0.235, round: 5, offset: 0.006 }),
      headlamps: [-1, 1].map((side) => cornerLamp(surface, { end: 1, side, ...lampFront })),
      lampLenses: [-1, 1].map((side) => cornerLamp(surface, { end: 1, side, ...lampFront, y0: lampFront.y0 + 0.018, y1: lampFront.y1 - 0.02, reach: lampFront.reach - 0.035, inner: lampFront.inner + 0.018, offset: 0.0115 })),
      lampStrips: [-1, 1].map((side) => cornerLamp(surface, { end: 1, side, ...lampFront, y0: lampFront.y0 + 0.024, y1: lampFront.y0 + 0.042, reach: lampFront.reach - 0.055, inner: lampFront.inner + 0.03, offset: 0.0145, round: 12 })),
      taillamps: surface.hasTail ? [-1, 1].map((side) => cornerLamp(surface, { end: -1, side, ...lampRear })) : [],
      tailStrips: surface.hasTail ? [-1, 1].map((side) => cornerLamp(surface, { end: -1, side, ...lampRear, y0: lampRear.y0 + 0.058, y1: lampRear.y0 + 0.092, reach: lampRear.reach - 0.04, inner: lampRear.inner + 0.03, offset: 0.0125, round: 12 })) : [],
      slats: mergeGeometries([0.25, 0.5, 0.75].map((t) => {
        const y = noseY - 0.19 + 0.135 * t
        return endPanel(surface, { end: 1, width: s.width * 0.21, y0: y - 0.0045, y1: y + 0.0045, offset: 0.0095, columns: 22, rows: 1 })
      })),
      plate: surface.hasTail ? endPanel(surface, { end: -1, width: 0.24, y0: s.lamps.rear - 0.3, y1: s.lamps.rear - 0.19, round: 8, offset: 0.012, columns: 8, rows: 4 }) : null,
      plateRecess: surface.hasTail ? endPanel(surface, { end: -1, width: 0.27, y0: s.lamps.rear - 0.325, y1: s.lamps.rear - 0.165, round: 8, offset: 0.007, columns: 8, rows: 4 }) : null,
      rearValance: surface.hasTail ? endPanel(surface, { end: -1, width: s.width * 0.34, y0: s.clearance + 0.17, y1: s.clearance + 0.25, round: 5, offset: 0.006 }) : null,
    }
    const wiperBase = s.windshield[0][0] - 0.04
    const wiperPoint = (x, z) => [x, topY(x, Math.abs(z)) + 0.016, z]
    return {
      surface,
      geometry,
      handles: handleXs.flatMap((x) => [-1, 1].map((side) => ({ x, y: belt - 0.1, z: side * (sideZ(x, belt - 0.1) + 0.012), key: `${x}${side}` }))),
      chromeLine: [-1, 1].map((side) => {
        const points = []
        for (let step = 0; step <= 24; step += 1) {
          const x = THREE.MathUtils.lerp(windowFront - 0.1, windowRear + 0.07, step / 24)
          points.push(new THREE.Vector3(x, belt + 0.012, side * (sideZ(x, belt + 0.012) + 0.0065)))
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, 0.0055, 5, false)
      }),
      mirrors: [-1, 1].map((side) => {
        const x = windowFront - 0.12
        const y = belt + 0.1
        const z = sideZ(x, y)
        return { key: side, side, root: [x, y, side * z], housing: [x + 0.015, y + 0.006, side * (z + 0.098)] }
      }),
      wipers: [
        [wiperPoint(wiperBase, -0.34), wiperPoint(wiperBase + 0.01, 0.03)],
        [wiperPoint(wiperBase, 0.2), wiperPoint(wiperBase + 0.01, 0.56)],
      ],
    }
  }, [s])
  useEffect(() => () => {
    const dispose = (value) => {
      if (!value) return
      if (Array.isArray(value)) value.forEach(dispose)
      else if (value.isBufferGeometry) value.dispose()
    }
    Object.values(exterior.geometry).forEach(dispose)
    dispose(exterior.chromeLine)
  }, [exterior])
  return exterior
}

function CarModel({ rig, paint, xray, interaction }) {
  const s = rig.spec
  const { half, track, width, wheelRadius: R, tireWidth } = s
  const [ex, ey] = s.engine
  const [ew, eh, ed] = s.engineSize
  const axles = [s.frontAxle, s.rearAxle]

  const { geometry: shell, handles, chromeLine, mirrors, wipers } = useExterior(s)
  const body = shell.body
  const bedSide = useDisposeOnChange(useMemo(() => (s.bed
    ? extrude(profileShape([[s.bed.front, s.clearance + 0.12], [s.bed.front, s.bed.top], [s.bed.rear, s.bed.top], [s.bed.rear, s.clearance + 0.12]], [s.frontAxle, s.rearAxle], s.wheelRadius, s.clearance + 0.12), 0.07, 0.015)
    : new THREE.BufferGeometry()), [s]))
  const spring = useSpringGeometry(R * 1.05, 0.07)

  const bodyMaterial = (
    <meshPhysicalMaterial
      key={xray ? 'xray' : 'solid'}
      color={paint}
      metalness={0.62}
      roughness={0.34}
      clearcoat={1}
      clearcoatRoughness={0.05}
      envMapIntensity={1.15}
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
          {!xray && (
            <group {...noHit}>
              {[-1, 1].map((side) => (
                <mesh key={side} position={[(s.bed.front + s.bed.rear) / 2, s.bed.top + 0.008, side * (width / 2 - 0.035)]} {...noHit}>
                  <boxGeometry args={[s.bed.front - s.bed.rear + 0.02, 0.022, 0.095]} />
                  <meshStandardMaterial {...TRIM} />
                </mesh>
              ))}
              <mesh position={[s.bed.rear + 0.035, s.bed.top + 0.008, 0]} {...noHit}>
                <boxGeometry args={[0.095, 0.022, width - 0.09]} />
                <meshStandardMaterial {...TRIM} />
              </mesh>
              <mesh position={[s.bed.rear - 0.003, s.clearance + 0.2, 0]} {...noHit}>
                <boxGeometry args={[0.03, 0.15, width * 0.96]} />
                <meshStandardMaterial {...TRIM} />
              </mesh>
              <mesh position={[s.bed.rear - 0.002, s.bed.top - 0.32, 0]} {...noHit}>
                <boxGeometry args={[0.012, 0.12, 0.3]} />
                <meshStandardMaterial color="#e6e8e3" emissive="#8b8d89" emissiveIntensity={0.55} roughness={0.5} />
              </mesh>
            </group>
          )}
        </group>
      )}

      {!xray && (
        <group>
          <mesh geometry={shell.liners} {...noHit}>
            <meshStandardMaterial color="#08090a" roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={shell.lips} {...noHit}><meshStandardMaterial {...TRIM} /></mesh>
          <mesh geometry={shell.seams} {...noHit}><meshStandardMaterial color="#050607" roughness={0.9} /></mesh>
          {shell.sills.map((geometry) => (
            <mesh key={geometry.uuid} geometry={geometry} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>
          ))}
          {shell.frames.map((geometry) => (
            <mesh key={geometry.uuid} geometry={geometry} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>
          ))}
          {shell.glass.map((geometry) => (
            <mesh key={geometry.uuid} geometry={geometry} {...noHit}><meshPhysicalMaterial {...GLASS} clearcoat={1} side={THREE.DoubleSide} /></mesh>
          ))}
          {shell.pillars.map((geometry) => (
            <mesh key={geometry.uuid} geometry={geometry} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>
          ))}
          {chromeLine.map((geometry) => (
            <mesh key={geometry.uuid} geometry={geometry} {...noHit}><meshStandardMaterial {...CHROME} /></mesh>
          ))}

          <mesh geometry={shell.windshieldFrame} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>
          <mesh geometry={shell.windshield} {...noHit}><meshPhysicalMaterial {...GLASS} clearcoat={1} side={THREE.DoubleSide} /></mesh>
          {shell.rearGlass && (
            <>
              <mesh geometry={shell.rearFrame} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={shell.rearGlass} {...noHit}><meshPhysicalMaterial {...GLASS} clearcoat={1} side={THREE.DoubleSide} /></mesh>
            </>
          )}
          {wipers.map(([from, to]) => (
            <Rod key={from.join()} from={from} to={to} radius={0.006} color="#08090a" metalness={0.2} roughness={0.7} segments={6} />
          ))}

          <mesh geometry={shell.grille} {...noHit}><meshStandardMaterial color="#08090b" roughness={0.55} metalness={0.3} side={THREE.DoubleSide} /></mesh>
          <mesh geometry={shell.slats} {...noHit}><meshStandardMaterial color="#5a6168" roughness={0.3} metalness={0.9} side={THREE.DoubleSide} /></mesh>
          <mesh geometry={shell.intake} {...noHit}><meshStandardMaterial color="#0a0b0d" roughness={0.75} side={THREE.DoubleSide} /></mesh>
          {shell.rearValance && <mesh geometry={shell.rearValance} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>}
          {shell.plateRecess && <mesh geometry={shell.plateRecess} {...noHit}><meshStandardMaterial {...TRIM} side={THREE.DoubleSide} /></mesh>}
          {shell.plate && <mesh geometry={shell.plate} {...noHit}><meshStandardMaterial color="#e6e8e3" emissive="#8b8d89" emissiveIntensity={0.55} roughness={0.5} side={THREE.DoubleSide} /></mesh>}

          {handles.map(({ x, y, z, key }) => (
            <mesh key={key} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} {...noHit}>
              <capsuleGeometry args={[0.013, 0.095, 4, 10]} />
              <meshPhysicalMaterial color={paint} metalness={0.62} roughness={0.34} clearcoat={1} />
            </mesh>
          ))}
          {mirrors.map(({ key, side, root, housing }) => (
            <group key={key}>
              <Rod from={root} to={housing} radius={0.013} color="#0d0e10" metalness={0.2} roughness={0.6} segments={8} />
              <mesh position={housing} scale={[0.06, 0.052, 0.102]} {...noHit}>
                <sphereGeometry args={[1, 24, 16]} />
                <meshPhysicalMaterial color={paint} metalness={0.62} roughness={0.34} clearcoat={1} />
              </mesh>
              <mesh position={[housing[0] - 0.045, housing[1], housing[2]]} rotation={[0, Math.PI / 2 + side * 0.08, 0]} scale={[0.082, 0.04, 1]} {...noHit}>
                <circleGeometry args={[1, 24]} />
                <meshPhysicalMaterial color="#7f8b92" metalness={1} roughness={0.08} side={THREE.DoubleSide} />
              </mesh>
            </group>
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
          <group key={offset}>
            <mesh position={[ex - ew * 0.15, ey + eh / 2 + 0.06, offset * ed * 0.9]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.03, 0.03, ew * 0.55, 10]} />
              <Mat color="#9aa3ab" metalness={0.8} roughness={0.3} />
            </mesh>
            <Tube points={[[ex - ew * 0.42, ey + eh / 2 + 0.06, offset * ed * 0.9], [ex - ew * 0.56, ey + eh * 0.35, offset * ed * 0.9], [ex - ew * 0.52, ey + eh * 0.05, offset * ed * 0.75]]} radius={0.016} color="#b9bfc5" metalness={0.85} roughness={0.28} />
          </group>
        ))}
        {[-0.22, -0.11, 0, 0.11, 0.22].map((offset) => (
          <mesh key={offset} position={[ex, ey, ed / 2 + 0.004]} rotation={[0, 0, 0]}>
            <boxGeometry args={[ew * 0.9, 0.012, 0.012]} />
            <Mat color="#454b52" metalness={0.7} roughness={0.45} />
          </mesh>
        )).map((rib, index) => <group key={index} position={[0, (index - 2) * 0.06, 0]}>{rib}</group>)}
        <mesh position={[ex + ew / 2 + 0.045, ey + eh * 0.26, -ed * 0.28]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.09, 18]} />
          <Mat color="#9ca4ab" metalness={0.8} roughness={0.32} />
        </mesh>
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
        <Tube points={[[half - 0.31, ey + eh * 0.38, width * 0.2], [ex + ew * 0.6, ey + eh * 0.5, width * 0.14], [ex + ew / 2 - 0.04, ey + eh * 0.42, ed * 0.3]]} radius={0.022} color="#1c1f22" metalness={0.1} roughness={0.75} />
        <Tube points={[[half - 0.31, ey - eh * 0.42, -width * 0.2], [ex + ew * 0.62, ey - eh * 0.46, -width * 0.15], [ex + ew / 2 - 0.02, ey - eh * 0.3, -ed * 0.3]]} radius={0.022} color="#1c1f22" metalness={0.1} roughness={0.75} />
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
          <Wheel position={[axle, R, wheelZ[side]]} radius={R} width={tireWidth} side={side === 'left' ? -1 : 1} />
        </Part>
      ))}

      <Part id="lighting" interaction={interaction}>
        {shell.headlamps.map((geometry) => (
          <mesh key={geometry.uuid} geometry={geometry}>
            <Mat color="#0b0d10" metalness={0.5} roughness={0.25} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {shell.lampLenses.map((geometry) => (
          <mesh key={geometry.uuid} geometry={geometry}>
            <Mat color="#7c8c98" emissive="#9db8cc" emissiveIntensity={0.1} metalness={0.95} roughness={0.08} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {shell.lampStrips.map((geometry) => (
          <mesh key={geometry.uuid} geometry={geometry}>
            <Mat color="#ffffff" emissive="#eaf4ff" emissiveIntensity={1.5} roughness={0.2} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {shell.taillamps.map((geometry) => (
          <mesh key={geometry.uuid} geometry={geometry}>
            <Mat color="#4f0a0e" emissive="#8f141c" emissiveIntensity={0.35} metalness={0.55} roughness={0.14} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {shell.tailStrips.map((geometry) => (
          <mesh key={geometry.uuid} geometry={geometry}>
            <Mat color="#ff3b3f" emissive="#ff2a30" emissiveIntensity={1.15} roughness={0.25} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {s.bed && [-1, 1].map((side) => (
          <mesh key={side} position={[s.bed.rear - 0.004, s.lamps.rear, side * (width / 2 - 0.16)]}>
            <boxGeometry args={[0.03, 0.2, 0.2]} />
            <Mat color="#7d1014" emissive="#d0202a" emissiveIntensity={0.55} roughness={0.2} />
          </mesh>
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
        <Wheel position={[s.frontAxle, R, 0]} radius={R} width={s.tireWidth} spokes={6} rimColor="#30353b" side={-1} />
      </Part>
      <Part id="tire-rear" interaction={interaction}>
        <Wheel position={[s.rearAxle, R, 0]} radius={R} width={s.tireWidth + 0.03} spokes={6} rimColor="#30353b" side={-1} />
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
