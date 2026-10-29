import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import VehicleModel from './VehicleModel.jsx'
import { paintColor } from './rigs.js'
import { markerTone, TONE_LABELS } from './status.js'

const OVERVIEW_DIRECTION = new THREE.Vector3(1, 0.42, -1.15).normalize()
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const COMPACT_WIDTH = 760

/** Camera position and orbit target that frame the whole vehicle in the current viewport. */
function rigRadius(rig) {
  const width = rig.kind === 'motorcycle' ? 0.8 : rig.spec.width
  return Math.hypot(rig.spec.length / 2, rig.height / 2, width / 2)
}

function overviewPose(rig, camera, size) {
  const radius = rigRadius(rig)
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height))
  const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 0.98
  const target = new THREE.Vector3(0, rig.height * 0.42, 0)
  return { target, position: target.clone().addScaledVector(OVERVIEW_DIRECTION, distance), distance }
}

/**
 * Frames a component and leaves room for the callout: on wide viewports the
 * component sits left of centre (callout on the right); on compact viewports
 * it sits in the upper half (callout as a bottom sheet).
 */
function focusPose(focus, camera, size) {
  const anchor = new THREE.Vector3(...focus.anchor)
  const direction = new THREE.Vector3(...focus.view).normalize()
  const forward = direction.clone().negate()
  const right = forward.clone().cross(WORLD_UP).normalize()
  const up = right.clone().cross(forward).normalize()
  const halfHeight = focus.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  const halfWidth = halfHeight * (size.width / size.height)
  const [ndcX, ndcY] = size.width < COMPACT_WIDTH ? [0, 0.42] : [-0.34, 0.05]
  const target = anchor.clone()
    .addScaledVector(right, -ndcX * halfWidth)
    .addScaledVector(up, -ndcY * halfHeight)
  return { target, position: target.clone().addScaledVector(direction, focus.distance) }
}

/** Smoothly moves camera and orbit target toward a goal; user input cancels the move. */
const CameraRig = forwardRef(function CameraRig({ rig, focus }, ref) {
  const { camera, size, controls, invalidate } = useThree()
  const goal = useRef(null)

  useImperativeHandle(ref, () => ({
    reset() {
      goal.current = overviewPose(rig, camera, size)
      invalidate()
    },
    zoom(factor) {
      if (!controls) return
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor)
      const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance)
      goal.current = { target: controls.target.clone(), position: controls.target.clone().add(offset.setLength(distance)) }
      invalidate()
    },
    orbit(angle) {
      if (!controls) return
      const offset = camera.position.clone().sub(controls.target).applyAxisAngle(WORLD_UP, angle)
      goal.current = { target: controls.target.clone(), position: controls.target.clone().add(offset) }
      invalidate()
    },
  }), [rig, camera, size, controls, invalidate])

  // Fly to the selected component, or back to the overview when it is closed.
  useEffect(() => {
    goal.current = focus ? focusPose(focus, camera, size) : overviewPose(rig, camera, size)
    invalidate()
    // Re-framing on resize is intentional; the overview should always fit.
  }, [focus, rig, camera, size, invalidate])

  useEffect(() => {
    if (!controls) return undefined
    const cancel = () => { goal.current = null }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])

  // Start already framed rather than flying in from the default camera (applied on the next frame).
  const snap = useRef(true)
  useEffect(() => { snap.current = true; invalidate() }, [rig, invalidate])

  // Panning is allowed but the orbit target stays within the vehicle's bounds.
  const bounds = useMemo(() => {
    const halfLength = rig.spec.length / 2
    const halfWidth = (rig.kind === 'motorcycle' ? 0.8 : rig.spec.width) / 2
    return new THREE.Box3(new THREE.Vector3(-halfLength, 0.05, -halfWidth), new THREE.Vector3(halfLength, rig.height, halfWidth))
  }, [rig])

  useFrame((_, delta) => {
    if (snap.current && controls) {
      const pose = overviewPose(rig, camera, size)
      camera.position.copy(pose.position)
      controls.target.copy(pose.target)
      controls.update()
      snap.current = false
      goal.current = null
    }
    if (controls && !bounds.containsPoint(controls.target)) {
      const clamped = bounds.clampPoint(controls.target, new THREE.Vector3())
      camera.position.add(clamped.clone().sub(controls.target))
      controls.target.copy(clamped)
    }
    if (!goal.current || !controls) return
    const blend = 1 - Math.exp(-delta * 4.2)
    camera.position.lerp(goal.current.position, blend)
    controls.target.lerp(goal.current.target, blend)
    controls.update()
    if (camera.position.distanceToSquared(goal.current.position) < 1e-5 && controls.target.distanceToSquared(goal.current.target) < 1e-5) {
      goal.current = null
    } else {
      invalidate() // on-demand rendering: keep frames coming until the move finishes
    }
  })

  return null
})

/**
 * Projects component anchors to screen space every frame and writes the
 * result straight to the overlay DOM nodes (markers, callout, leader line).
 */
// `layoutKey` changes when the callout resizes so on-demand rendering re-positions it.
// eslint-disable-next-line no-unused-vars
function OverlayProjector({ anchors, markerRefs, calloutRef, leaderRef, selectedKey, layoutKey }) {
  const { camera, size } = useThree()
  const point = useMemo(() => new THREE.Vector3(), [])
  const toCamera = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    anchors.forEach(({ key, position, side }) => {
      const element = markerRefs.current.get(key)
      if (!element) return
      point.set(...position).project(camera)
      const visible = point.z < 1 && Math.abs(point.x) < 1.15 && Math.abs(point.y) < 1.15
      const x = ((point.x + 1) / 2) * size.width
      const y = ((1 - point.y) / 2) * size.height
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (side) {
        toCamera.copy(camera.position).sub(point.set(...position)).normalize()
        element.dataset.behind = toCamera.z * side < -0.2 ? 'true' : 'false'
      }

      if (key === selectedKey && calloutRef.current) {
        positionCallout(calloutRef.current, leaderRef.current, x, y, size, visible)
      }
    })
  })

  return null
}

function positionCallout(callout, leader, x, y, size, visible) {
  if (size.width < COMPACT_WIDTH) {
    callout.style.transform = ''
    if (leader) leader.style.visibility = 'hidden'
    return
  }
  const margin = 16
  const gap = 56
  const { width, height } = callout.pmSize || { width: callout.offsetWidth, height: callout.offsetHeight }
  const placeRight = x + gap + width + margin <= size.width || x < size.width / 2
  const left = THREE.MathUtils.clamp(placeRight ? x + gap : x - gap - width, margin, size.width - width - margin)
  const top = THREE.MathUtils.clamp(y - Math.min(96, height / 2), margin + 48, Math.max(margin + 48, size.height - height - margin))
  callout.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`
  if (leader) {
    const edgeX = placeRight ? left : left + width
    const edgeY = THREE.MathUtils.clamp(y, top + 18, top + Math.min(height - 18, 140))
    leader.setAttribute('x1', x.toFixed(1))
    leader.setAttribute('y1', y.toFixed(1))
    leader.setAttribute('x2', edgeX.toFixed(1))
    leader.setAttribute('y2', edgeY.toFixed(1))
    leader.style.visibility = visible ? 'visible' : 'hidden'
  }
}

function Lights() {
  return (
    <>
      <hemisphereLight intensity={0.85} color="#e8f2ff" groundColor="#1a2129" />
      <directionalLight position={[4, 7, -3]} intensity={2.1} />
      <directionalLight position={[-5, 3, 4]} intensity={0.7} color="#bcd6ff" />
      <directionalLight position={[0, 2, -6]} intensity={0.45} />
    </>
  )
}

function Icon({ name }) {
  const paths = {
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
    xray: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

/**
 * Full-bleed 3D inspection stage. `components` come from the API; only those
 * with an anchor in the rig get a hotspot. `children` is the callout content
 * for the selected component.
 */
export default function InspectionStage({ rig, vehicle, components, selectedKey, onSelect, children }) {
  const [hoveredKey, setHoveredKey] = useState(null)
  const [manualXray, setManualXray] = useState(false)
  const [webglError, setWebglError] = useState(false)
  const [calloutLayout, setCalloutLayout] = useState('')
  const cameraApi = useRef(null)
  const markerRefs = useRef(new Map())
  const calloutRef = useRef(null)
  const leaderRef = useRef(null)

  const selectable = useMemo(() => components.filter((component) => rig.components[component.key]), [components, rig])
  const available = useMemo(() => new Set(selectable.map((component) => component.key)), [selectable])
  const focus = selectedKey ? rig.components[selectedKey] || null : null
  const xray = manualXray || Boolean(focus?.xray)
  const ghosted = useMemo(() => new Set(focus?.ghost || []), [focus])
  const sideThreshold = rig.kind === 'motorcycle' ? 0.08 : 0.4
  const anchors = useMemo(() => selectable.map(({ key }) => {
    const position = rig.components[key].anchor
    return { key, position, side: Math.abs(position[2]) >= sideThreshold ? Math.sign(position[2]) : 0 }
  }), [selectable, rig, sideThreshold])

  // Cache the callout size so the per-frame projector never forces a layout.
  useEffect(() => {
    const callout = calloutRef.current
    if (!callout || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      callout.pmSize = { width: callout.offsetWidth, height: callout.offsetHeight }
      setCalloutLayout(`${callout.pmSize.width}x${callout.pmSize.height}`)
    })
    observer.observe(callout)
    return () => observer.disconnect()
  }, [selectedKey])

  const hover = useCallback((key) => {
    setHoveredKey(key)
    document.body.style.cursor = key ? 'pointer' : ''
  }, [])
  useEffect(() => () => { document.body.style.cursor = '' }, [])

  const interaction = useMemo(() => ({
    selectedKey, hoveredKey, ghosted, available, onHover: hover, onSelect,
  }), [selectedKey, hoveredKey, ghosted, available, hover, onSelect])

  const setMarkerRef = (key) => (element) => {
    if (element) markerRefs.current.set(key, element)
    else markerRefs.current.delete(key)
  }

  if (webglError) {
    return (
      <div className="pm-stage pm-stage-error" role="alert">
        <p>3D rendering is unavailable in this browser. Use the component list to review records.</p>
      </div>
    )
  }

  return (
    <div className={`pm-stage${selectedKey ? ' has-selection' : ''}`}>
      <Canvas
        className="pm-canvas"
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ fov: 34, near: 0.05, far: 80, position: [6, 3, -6] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setWebglError(true) }, { once: true })
        }}
        onPointerMissed={() => hover(null)}
        fallback={<div className="pm-stage-error" role="alert">WebGL is unavailable in this browser.</div>}
      >
        <color attach="background" args={['#14191f']} />
        <fog attach="fog" args={['#14191f', 9, 24]} />
        <Lights />
        <VehicleModel rig={rig} paint={paintColor(vehicle.color)} xray={xray} interaction={interaction} />
        <ContactShadows position={[0, 0.002, 0]} opacity={0.55} scale={rig.kind === 'motorcycle' ? 4 : 9} blur={2.4} far={2.5} resolution={512} frames={1} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} raycast={() => null}>
          <circleGeometry args={[40, 64]} />
          <meshStandardMaterial color="#1d242c" roughness={0.92} metalness={0} />
        </mesh>
        <OrbitControls
          makeDefault
          enablePan
          screenSpacePanning
          panSpeed={0.6}
          enableDamping
          dampingFactor={0.09}
          minDistance={0.7}
          maxDistance={rigRadius(rig) * 6}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI * 0.49}
          rotateSpeed={0.7}
        />
        <CameraRig ref={cameraApi} rig={rig} focus={focus} />
        <OverlayProjector anchors={anchors} markerRefs={markerRefs} calloutRef={calloutRef} leaderRef={leaderRef} selectedKey={selectedKey} layoutKey={calloutLayout} />
      </Canvas>

      <div className="pm-overlay">
        <svg className="pm-leader" aria-hidden="true">
          {selectedKey && <line ref={leaderRef} />}
        </svg>
        {selectable.map((component) => {
          const tone = markerTone(component)
          const active = component.key === selectedKey
          return (
            <button
              key={component.key}
              ref={setMarkerRef(component.key)}
              type="button"
              className={`pm-hotspot tone-${tone}${active ? ' is-active' : ''}${hoveredKey === component.key ? ' is-hovered' : ''}`}
              onClick={() => onSelect(component.key)}
              onPointerEnter={() => setHoveredKey(component.key)}
              onPointerLeave={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(component.key)}
              onBlur={() => setHoveredKey(null)}
              aria-pressed={active}
              aria-label={`${component.name}: ${TONE_LABELS[tone]}`}
            >
              <span className="pm-hotspot-dot" />
              <span className="pm-hotspot-label">{component.name}<small>{TONE_LABELS[tone]}</small></span>
            </button>
          )
        })}
        {selectedKey && (
          <div ref={calloutRef} className="pm-callout" role="dialog" aria-label="Component inspection">
            {children}
          </div>
        )}
      </div>

      <div className="pm-legend" aria-label="Hotspot colours">
        {['good', 'attention', 'critical', 'unknown'].map((tone) => (
          <span key={tone}><i className={`tone-${tone}`} />{TONE_LABELS[tone]}</span>
        ))}
      </div>

      {selectedKey && (
        <button type="button" className="pm-exterior" onClick={() => onSelect(null)}>
          <Icon name="left" />Exterior view
        </button>
      )}

      <div className="pm-controls" role="toolbar" aria-label="Camera controls">
        <button type="button" onClick={() => cameraApi.current?.orbit(-Math.PI / 6)} aria-label="Rotate left" title="Rotate left"><Icon name="left" /></button>
        <button type="button" onClick={() => cameraApi.current?.orbit(Math.PI / 6)} aria-label="Rotate right" title="Rotate right"><Icon name="right" /></button>
        <span className="pm-controls-divider" />
        <button type="button" onClick={() => cameraApi.current?.zoom(0.78)} aria-label="Zoom in" title="Zoom in"><Icon name="plus" /></button>
        <button type="button" onClick={() => cameraApi.current?.zoom(1.28)} aria-label="Zoom out" title="Zoom out"><Icon name="minus" /></button>
        <span className="pm-controls-divider" />
        <button type="button" onClick={() => (selectedKey ? onSelect(null) : cameraApi.current?.reset())} aria-label="Reset to default view" title="Reset to default view"><Icon name="reset" /></button>
        <button type="button" className={manualXray ? 'is-on' : ''} onClick={() => setManualXray((value) => !value)} aria-pressed={manualXray} aria-label="X-ray view" title="X-ray view: see internal components"><Icon name="xray" /></button>
      </div>
    </div>
  )
}
