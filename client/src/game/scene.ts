import * as THREE from 'three';
import { CONFIG, DT } from '../../../shared/src/config.js';
import { angleDelta } from '../../../shared/src/math.js';
import { clipCameraRay } from './camera.js';
import type { Input, PlayerState, Snapshot } from '../../../shared/src/types.js';
import { connection } from '../networking/connection.js';
import { Interpolation, Prediction } from '../networking/prediction.js';
import { Controls } from './input.js';
import { buildArena } from '../maps/arena.js';
import { createKart, type KartVisual } from '../vehicles/kart.js';
import { createPickup, createProjectile } from '../weapons/visuals.js';
import { Particles } from '../effects/particles.js';
import { GameAudio } from '../effects/audio.js';

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.LineSegments) {
      if ('geometry' in child) geometries.add(child.geometry);
      for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(m); const map = (m as THREE.MeshBasicMaterial).map; if (map) textures.add(map);
      }
    }
  });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
}

export class ArenaGame {
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  private controls = new Controls(); private prediction = new Prediction(); private interpolation = new Interpolation();
  private karts = new Map<string, KartVisual>(); private pickups = new Map<number, THREE.Group>();
  private projectiles = new Map<number, THREE.Group>(); private projectileTemplates = new Map<string, THREE.Group>();
  private pickupTemplate = createPickup(); private particles: Particles; readonly audio = new GameAudio();
  private unsubscribe: () => void; private resize: ResizeObserver; private previous = performance.now();
  private accumulator = 0; private outgoing: Input[] = []; private lastEvent = 0; private lastPhase = ''; private lastCode = '';
  private renderYaw = 0; private cameraReady = false; private lastFrame = 0;
  private aim = new THREE.Vector3(); private cameraTarget = new THREE.Vector3();
  constructor(private container: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label', '3D kart combat arena'); this.container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xbdd8e4); this.scene.fog = new THREE.Fog(0xbdd8e4, 80, 155);
    this.scene.add(new THREE.HemisphereLight(0xedf7ff, 0x777153, 2.1));
    const sun = new THREE.DirectionalLight(0xfff0d3, 2.3); sun.position.set(-25, 50, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45; sun.shadow.camera.far = 110; sun.shadow.bias = -0.001; this.scene.add(sun);
    this.scene.add(buildArena()); this.particles = new Particles(this.scene);
    this.camera.position.set(48, 48, 50); this.camera.lookAt(0, 0, 0);
    this.resize = new ResizeObserver(() => this.updateSize()); this.resize.observe(container); this.updateSize();
    this.unsubscribe = connection.onSnapshot(s => this.receive(s));
    if (connection.state.snapshot) this.receive(connection.state.snapshot);
    this.renderer.setAnimationLoop(() => this.frame());
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
  }
  private contextLost = (event: Event) => { event.preventDefault(); console.error('WebGL context lost. Reload to restore the renderer.'); this.container.dataset.error = 'Graphics connection lost. Reload this page to restore the arena.'; };
  private updateSize() { const width = this.container.clientWidth, height = this.container.clientHeight; if (!width || !height) return; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); }
  private receive(state: Snapshot) {
    const id = connection.state.id;
    if (state.code !== this.lastCode) this.lastEvent = 0;
    if (state.phase !== this.lastPhase || state.code !== this.lastCode) { this.outgoing = []; this.accumulator = 0; this.cameraReady = false; }
    this.lastPhase = state.phase; this.lastCode = state.code;
    if (id) this.prediction.reconcile(state, id);
    this.interpolation.push(state);
    const present = new Set(state.players.map(p => p.id));
    for (const [key, kart] of this.karts) if (!present.has(key)) { this.scene.remove(kart.group); disposeObject(kart.group); this.karts.delete(key); }
    for (const player of state.players) if (!this.karts.has(player.id)) {
      const visual = createKart(player.color, player.name); visual.group.position.set(player.x, player.y, player.z); visual.group.rotation.y = player.yaw; this.scene.add(visual.group); this.karts.set(player.id, visual);
    }
    for (const box of state.pickups) if (!this.pickups.has(box.id)) { const visual = this.pickupTemplate.clone(); this.scene.add(visual); this.pickups.set(box.id, visual); }
    const activeProjectiles = new Set(state.projectiles.map(p => p.id));
    for (const [key, visual] of this.projectiles) if (!activeProjectiles.has(key)) { this.scene.remove(visual); this.projectiles.delete(key); }
    for (const p of state.projectiles) if (!this.projectiles.has(p.id)) {
      let template = this.projectileTemplates.get(p.kind); if (!template) { template = createProjectile(p.kind); this.projectileTemplates.set(p.kind, template); }
      const visual = template.clone(); this.scene.add(visual); this.projectiles.set(p.id, visual);
    }
    const self = state.players.find(p => p.id === id);
    for (const event of state.events) if (event.id > this.lastEvent) {
      this.lastEvent = event.id;
      if (state.time - event.at > 0.3) continue;
      this.particles.emit(event);
      this.audio.event(event, self ? Math.hypot(self.x - event.x, self.z - event.z) : 30);
    }
    this.lastFrame = performance.now();
  }
  private frame() {
    const now = performance.now();
    // Menus and background tabs do not need a full-speed arena render loop.
    const interval = document.hidden ? 250 : connection.state.snapshot?.phase === 'playing' ? 0 : 50;
    if (now - this.previous < interval) return;
    const delta = Math.min(0.1, (now - this.previous) / 1000); this.previous = now;
    const state = connection.state.snapshot, id = connection.state.id;
    const self = state?.players.find(p => p.id === id) ?? null;
    const playing = state?.phase === 'playing' && connection.state.status === 'connected';
    if (state && self && playing && !document.hidden) {
      this.accumulator += delta;
      while (this.accumulator >= DT) {
        const input = this.controls.read(this.prediction.sequence + 1);
        this.prediction.step(input, self, state.time + (now - this.lastFrame) / 1000);
        this.outgoing.push(input); this.accumulator -= DT;
        if (this.outgoing.length >= 3) { connection.send({ type: 'input', commands: this.outgoing.splice(0, 3) }); }
      }
    } else { this.accumulator = 0; this.outgoing = []; }
    if (state) {
      for (const p of state.players) this.renderKart(p, id, now, delta, state);
      for (const box of state.pickups) {
        const visual = this.pickups.get(box.id)!; visual.visible = state.phase === 'playing' && box.availableAt <= state.time;
        visual.position.set(box.x, box.y + 1 + Math.sin(now / 380 + box.id) * 0.15, box.z); visual.rotation.y = now / 1100 + box.id;
      }
      const extrapolation = Math.min(0.1, (now - this.lastFrame) / 1000);
      for (const p of state.projectiles) {
        const visual = this.projectiles.get(p.id)!;
        visual.position.set(p.x + p.vx * extrapolation, p.y + p.vy * extrapolation, p.z + p.vz * extrapolation);
        if (p.kind !== 'mine' && p.kind !== 'bomb') visual.lookAt(visual.position.x + p.vx, visual.position.y + p.vy, visual.position.z + p.vz);
        if (p.kind === 'mine') visual.scale.setScalar(state.time >= p.armedAt ? 1 + Math.sin(now / 100) * 0.06 : 0.85);
      }
    }
    if (playing && self) this.followCamera(self, delta);
    else { const t = now / 50000; this.camera.position.set(Math.sin(t) * 55, 48, Math.cos(t) * 55); this.camera.lookAt(0, 0, 0); this.cameraReady = false; }
    this.audio.update(self, this.prediction.kart ? Math.hypot(this.prediction.kart.vx, this.prediction.kart.vz) : 0, !!playing);
    this.particles.update(delta); this.renderer.render(this.scene, this.camera);
  }
  private renderKart(p: PlayerState, id: string | null, now: number, dt: number, state: Snapshot) {
    const visual = this.karts.get(p.id)!;
    const position = p.id === id ? this.prediction.kart ?? p : this.interpolation.sample(p.id, now) ?? p;
    const smoothing = p.id === id ? 1 - Math.exp(-22 * dt) : 1;
    const target = new THREE.Vector3(position.x, position.y, position.z);
    if (visual.group.position.distanceTo(target) > 5) visual.group.position.copy(target); else visual.group.position.lerp(target, smoothing);
    visual.group.rotation.y += angleDelta(visual.group.rotation.y, position.yaw) * smoothing;
    visual.group.visible = p.health > 0;
    visual.shield.visible = state.time < p.shieldUntil || state.time < p.invulnerableUntil;
    visual.shield.rotation.y += dt * 0.7;
    visual.boost.visible = state.time < p.boostUntil; visual.boost.scale.y = 0.8 + Math.sin(now / 45) * 0.2;
    visual.label.visible = p.id !== id;
    const speed = Math.hypot(position.vx, position.vz);
    for (const wheel of visual.wheels) wheel.rotation.x += speed * dt * 2;
  }
  private followCamera(self: PlayerState, dt: number) {
    const visual = this.karts.get(self.id)!;
    const pos = visual.group.position;
    if (!this.cameraReady) this.renderYaw = visual.group.rotation.y;
    this.renderYaw += angleDelta(this.renderYaw, visual.group.rotation.y) * (1 - Math.exp(-9 * dt));
    const fx = Math.sin(this.renderYaw), fz = Math.cos(this.renderYaw);
    this.aim.set(pos.x + fx * 1.8, pos.y + 1.2, pos.z + fz * 1.8);
    this.cameraTarget.set(pos.x - fx * 8.8, pos.y + 6.1, pos.z - fz * 8.8);
    const anchor = { x: pos.x, y: pos.y + 1.2, z: pos.z };
    Object.assign(this.aim, clipCameraRay(anchor, this.aim));
    Object.assign(this.cameraTarget, clipCameraRay(anchor, this.cameraTarget));
    if (!this.cameraReady || this.camera.position.distanceTo(this.cameraTarget) > 20) this.camera.position.copy(this.cameraTarget);
    else this.camera.position.lerp(this.cameraTarget, 1 - Math.exp(-12 * dt));
    Object.assign(this.camera.position, clipCameraRay(anchor, this.camera.position));
    this.camera.lookAt(this.aim); this.cameraReady = true;
  }
  dispose() {
    this.renderer.setAnimationLoop(null); this.unsubscribe(); this.controls.dispose(); this.audio.dispose(); this.resize.disconnect(); this.particles.dispose();
    disposeObject(this.scene); disposeObject(this.pickupTemplate); for (const template of this.projectileTemplates.values()) disposeObject(template);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
