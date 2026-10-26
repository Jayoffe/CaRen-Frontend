import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const CAMERA_POSITION = [4.8, 2.8, 5.8]

function vehicleColor(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim()
  const colors = {
    black: '#26313d',
    blue: '#2366bd',
    gray: '#8b99a7',
    grey: '#8b99a7',
    red: '#b94640',
    silver: '#abb7c1',
    white: '#d6dde2',
  }
  return colors[String(value || '').trim().toLowerCase()] || '#477d9c'
}

function bodyShape() {
  const shape = new THREE.Shape()
  shape.moveTo(-2.25, 0.3)
  shape.lineTo(-2.23, 0.53)
  shape.quadraticCurveTo(-1.95, 0.68, -1.55, 0.7)
  shape.lineTo(-1.02, 1.2)
  shape.quadraticCurveTo(-0.8, 1.34, -0.42, 1.35)
  shape.lineTo(0.48, 1.35)
  shape.quadraticCurveTo(0.78, 1.31, 0.96, 1.08)
  shape.lineTo(1.35, 0.72)
  shape.quadraticCurveTo(1.78, 0.69, 2.12, 0.57)
  shape.lineTo(2.25, 0.38)
  shape.lineTo(2.22, 0.26)
  shape.lineTo(-2.2, 0.26)
  shape.closePath()
  return shape
}

function cabinShape() {
  const shape = new THREE.Shape()
  shape.moveTo(-1.36, 0.77)
  shape.lineTo(-0.92, 1.17)
  shape.quadraticCurveTo(-0.78, 1.25, -0.48, 1.25)
  shape.lineTo(0.42, 1.25)
  shape.quadraticCurveTo(0.64, 1.21, 0.79, 1.05)
  shape.lineTo(1.08, 0.78)
  shape.closePath()
  return shape
}

function ComponentPin({ component, selected, onSelect }) {
  const color = selected ? '#7de4ff' : '#81a8bb'
  return (
    <group
      position={component.position}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(component.key)
      }}
    >
      <mesh castShadow>
        <sphereGeometry args={[0.085, 18, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.1 : 0.5} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.18, 12]} />
        <meshStandardMaterial color={selected ? '#dff9ff' : '#a7c7d5'} metalness={0.55} roughness={0.34} />
      </mesh>
    </group>
  )
}

function Wheel({ position, selected, componentKey, onSelect }) {
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]} onClick={(event) => {
      event.stopPropagation()
      onSelect(componentKey)
    }}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.39, 0.39, 0.23, 40]} />
        <meshStandardMaterial color={selected ? '#48b8ef' : '#111923'} roughness={0.88} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.124, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.024, 32]} />
        <meshStandardMaterial color={selected ? '#c0f2ff' : '#95a9b8'} metalness={0.76} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.142, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.03, 24]} />
        <meshStandardMaterial color="#283847" metalness={0.55} roughness={0.4} />
      </mesh>
      {[0, 1, 2, 3, 4].map((spoke) => (
        <mesh key={spoke} position={[0, 0.143, 0]} rotation={[0, 0, spoke * Math.PI * 0.4]}>
          <boxGeometry args={[0.035, 0.17, 0.022]} />
          <meshStandardMaterial color="#c5d3dc" metalness={0.7} roughness={0.33} />
        </mesh>
      ))}
    </group>
  )
}

function VehicleModel({ car, selectedComponent, transparent, components, onSelect }) {
  const shell = useMemo(() => new THREE.ExtrudeGeometry(bodyShape(), {
    depth: 1.42,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.075,
    bevelThickness: 0.065,
    curveSegments: 10,
  }), [])
  const cabin = useMemo(() => new THREE.ShapeGeometry(cabinShape(), 16), [])
  const paint = vehicleColor(car?.color)

  useEffect(() => () => {
    shell.dispose()
    cabin.dispose()
  }, [shell, cabin])

  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={shell} position={[0, 0, -0.71]} castShadow receiveShadow onClick={() => onSelect('engine')}>
        <meshPhysicalMaterial
          color={paint}
          metalness={0.54}
          roughness={0.31}
          clearcoat={0.85}
          clearcoatRoughness={0.2}
          transparent={transparent}
          opacity={transparent ? 0.23 : 1}
          depthWrite={!transparent}
        />
      </mesh>
      {[-0.714, 0.714].map((z) => (
        <mesh key={z} geometry={cabin} position={[0, 0, z]}>
          <meshPhysicalMaterial color="#0c2539" roughness={0.17} metalness={0.25} transparent opacity={transparent ? 0.13 : 0.86} side={THREE.DoubleSide} />
        </mesh>
      ))}

      <mesh position={[2.145, 0.48, 0]}>
        <boxGeometry args={[0.055, 0.13, 0.62]} />
        <meshStandardMaterial color="#d9f2f6" emissive="#9ac5d0" emissiveIntensity={0.34} />
      </mesh>
      <mesh position={[-2.14, 0.48, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.63]} />
        <meshStandardMaterial color="#c84d4d" emissive="#a11c2e" emissiveIntensity={0.28} />
      </mesh>
      <mesh position={[2.22, 0.38, 0]}>
        <boxGeometry args={[0.08, 0.16, 0.48]} />
        <meshStandardMaterial color="#152432" roughness={0.7} />
      </mesh>
      <mesh position={[-2.16, 0.36, 0]}>
        <boxGeometry args={[0.1, 0.15, 0.5]} />
        <meshStandardMaterial color="#182632" roughness={0.7} />
      </mesh>
      {[-0.92, 0.86].map((x) => (
        <mesh key={x} position={[x, 0.92, 0]} rotation={[0, 0, -0.28]}>
          <boxGeometry args={[0.025, 0.5, 1.42]} />
          <meshStandardMaterial color="#26394a" metalness={0.4} roughness={0.35} transparent opacity={transparent ? 0.16 : 1} />
        </mesh>
      ))}
      {[-1.33, 1.32].map((x) => [-0.76, 0.76].map((z) => {
        const axle = x > 0 ? 'front' : 'rear'
        const side = z > 0 ? 'left' : 'right'
        const tireKey = `tire-${axle}-${side}`
        return (
          <Wheel
            key={tireKey}
            position={[x, 0.42, z]}
            selected={selectedComponent === tireKey || selectedComponent === `brakes-${axle}`}
            componentKey={tireKey}
            onSelect={onSelect}
          />
        )
      }))}
      <mesh position={[1.38, 0.76, 0]} visible={transparent} castShadow>
        <boxGeometry args={[0.58, 0.27, 0.55]} />
        <meshStandardMaterial color="#d6824f" metalness={0.45} roughness={0.48} wireframe />
      </mesh>
      <mesh position={[0.35, 0.56, 0]} visible={transparent}>
        <boxGeometry args={[0.38, 0.13, 0.32]} />
        <meshStandardMaterial color="#39bfe0" emissive="#1684ad" emissiveIntensity={0.4} wireframe />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[3.7, 0.16, 1.1]} />
        <meshStandardMaterial color="#121c26" roughness={0.72} />
      </mesh>
      {components.map((component) => (
        <ComponentPin
          key={component.key}
          component={component}
          selected={selectedComponent === component.key}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

function Scene({ car, selectedComponent, transparent, autoRotate, resetKey, components, onSelect, controlsRef, cameraRef }) {
  const { camera } = useThree()

  useEffect(() => {
    cameraRef.current = camera
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0.6, 0)
      controlsRef.current.update()
    }
  }, [camera, controlsRef, cameraRef])

  useEffect(() => {
    if (!controlsRef.current) return
    camera.position.set(...CAMERA_POSITION)
    controlsRef.current.target.set(0, 0.62, 0)
    controlsRef.current.update()
  }, [resetKey, camera, controlsRef])

  return (
    <>
      <color attach="background" args={['#07111b']} />
      <ambientLight intensity={1.15} />
      <hemisphereLight intensity={0.75} color="#d8efff" groundColor="#15222c" />
      <directionalLight position={[3, 7, 5]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-4, 2.4, -3]} color="#2c83ba" intensity={30} distance={12} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#0b1721" roughness={0.82} metalness={0.12} />
      </mesh>
      <gridHelper args={[18, 36, '#1b3b4d', '#102433']} position={[0, -0.02, 0]} />
      <VehicleModel
        car={car}
        selectedComponent={selectedComponent}
        transparent={transparent}
        components={components}
        onSelect={onSelect}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0.62, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.5}
        maxDistance={9}
        minPolarAngle={0.45}
        maxPolarAngle={Math.PI * 0.48}
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
      />
    </>
  )
}

export default function MaintenanceVehicleViewer({
  car,
  components,
  selectedComponent,
  onSelect,
}) {
  const [transparent, setTransparent] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)

  function zoom(factor) {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const direction = camera.position.clone().sub(controls.target).multiplyScalar(factor)
    camera.position.copy(controls.target.clone().add(direction))
    controls.update()
  }

  return (
    <section className="diag-viewer-panel" aria-label="Interactive vehicle diagnostic viewer">
      <div className="diag-viewer-title">
        <div><span className="diag-kicker">INTERACTIVE VEHICLE VIEW</span><h2>{car?.make} {car?.model}</h2></div>
        <span className="diag-vehicle-representation">Generic 3D representation · not model-specific</span>
      </div>
      <div className="diag-canvas-wrap">
        <Canvas
          dpr={[1, 1.5]}
          shadows
          camera={{ position: CAMERA_POSITION, fov: 38, near: 0.1, far: 100 }}
          fallback={<div className="diag-canvas-fallback" role="status">WebGL is unavailable. Select components from the inspection list to view recorded details.</div>}
        >
          <Scene
            car={car}
            selectedComponent={selectedComponent}
            transparent={transparent}
            autoRotate={autoRotate}
            resetKey={resetKey}
            components={components}
            onSelect={onSelect}
            controlsRef={controlsRef}
            cameraRef={cameraRef}
          />
        </Canvas>
        <div className="diag-canvas-caption">Drag to rotate · Scroll or use controls to zoom · Select a marker to inspect</div>
      </div>
      <div className="diag-viewer-controls" aria-label="Vehicle viewer controls">
        <button type="button" onClick={() => setAutoRotate((value) => !value)} aria-pressed={autoRotate}>{autoRotate ? 'Stop 360°' : '360° view'}</button>
        <button type="button" onClick={() => zoom(0.82)} aria-label="Zoom in">＋</button>
        <button type="button" onClick={() => zoom(1.22)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setResetKey((key) => key + 1)}>Reset camera</button>
        <button type="button" onClick={() => setTransparent((value) => !value)} aria-pressed={transparent}>{transparent ? 'Exterior mode' : 'Technical view'}</button>
      </div>
      {transparent && <p className="diag-technical-note">Technical view reveals schematic engine and electrical-system markers; internal geometry is illustrative, not an X-ray or inspection.</p>}
    </section>
  )
}
