import * as THREE from 'three';
import { CONFIG, DT } from '../../../shared/src/config.js';
import { angleDelta } from '../../../shared/src/math.js';
import { drivingTelemetry } from '../../../shared/src/movement.js';
import { groundHeight, PICKUP_POSITIONS } from '../../../shared/src/arena.js';
import { clipCameraRay } from './camera.js';
import type { Input, PlayerState, Snapshot } from '../../../shared/src/types.js';
import { connection } from '../networking/connection.js';
import { Interpolation, Prediction } from '../networking/prediction.js';
import { Controls } from './input.js';
import { buildArena } from '../maps/arena.js';
import { createKart, type KartVisual } from '../vehicles/kart.js';
import { createPickup, createProjectile } from '../weapons/visuals.js';
import { updatePickupVisual } from '../weapons/pickup-visual.js';
import { Particles } from '../effects/particles.js';
import { GameAudio } from '../effects/audio.js';
import { IslandBackdrop } from '../maps/island-backdrop.js';
import { animateSuspension } from '../vehicles/animation.js';
import { PickupBatch } from '../weapons/pickup-batch.js';
import { addIslandLighting } from './presentation.js';
import { ballisticPosition } from '../../../shared/src/weapon-physics.js';
import { weaponAim } from '../../../shared/src/aim.js';
import { WEAPONS } from '../../../shared/src/weapons.js';

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.LineSegments || child instanceof THREE.Points) {
      if ('geometry' in child) geometries.add(child.geometry);
      for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
      if(child instanceof THREE.InstancedMesh)child.dispose();
    }
  });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
}

export class ArenaGame {
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.1, 650);
  private environment: IslandBackdrop; private shake = 0;
  private controls = new Controls(() => connection.state.snapshot?.phase === 'playing' && connection.state.status === 'connected' && !document.hidden); private prediction = new Prediction(); private interpolation = new Interpolation();
  private karts = new Map<string, KartVisual>(); private pickups = new Map<number, THREE.Group>();
  private projectiles = new Map<number, THREE.Group>(); private projectileTemplates = new Map<string, THREE.Group>();
  private pickupTemplate = createPickup(); private particles: Particles; readonly audio = new GameAudio();
  private pickupBatch = new PickupBatch(this.scene,this.pickupTemplate,PICKUP_POSITIONS.length);
  private unsubscribe: () => void; private resize: ResizeObserver; private previous = performance.now();
  private accumulator = 0; private outgoing: Input[] = []; private lastEvent = 0; private lastPhase = ''; private lastCode = '';
  private inputTimer: ReturnType<typeof setInterval>; private previousInput = performance.now();
  private renderYaw = 0; private cameraReady = false; private lastFrame = 0;
  private lastShadow = 0; private frames = 0; private statsAt = 0; private frameAverage = 16; private slowSamples = 0;
  private visualTarget = new THREE.Vector3();
  private idleDirty = true; private renderMode = ''; private idleRenders = 0;
  private aim = new THREE.Vector3(); private cameraTarget = new THREE.Vector3();
  constructor(private container: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    const gl=this.renderer.getContext(),gpu=gl.getExtension('WEBGL_debug_renderer_info');
    this.container.dataset.gpu=gpu ? String(gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL)) : 'Renderer unavailable';
    const software=/SwiftShader|llvmpipe|Software Rasterizer/i.test(this.container.dataset.gpu);
    if(software){this.renderer.setPixelRatio(.85);this.renderer.shadowMap.enabled=false;this.container.dataset.reducedGraphics='true';}
    this.renderer.domElement.setAttribute('aria-label', '3D kart combat arena'); this.renderer.domElement.tabIndex = 0; this.container.append(this.renderer.domElement);
    addIslandLighting(this.scene);
    // Tiny original sky cubemap provides broad, soft material reflections, no screen-space pass.
    const faces=Array.from({length:6},(_,i)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d')!;
      const gradient=context.createLinearGradient(0,0,0,32);gradient.addColorStop(0,i===3?'#557b66':'#d6f3fa');gradient.addColorStop(1,i===2?'#8bc8e1':'#598972');context.fillStyle=gradient;context.fillRect(0,0,32,32);return canvas;
    });
    const reflections=new THREE.CubeTexture(faces);reflections.colorSpace=THREE.SRGBColorSpace;reflections.needsUpdate=true;
    if(!software){this.scene.environment=reflections;this.scene.environmentIntensity=.45;}else reflections.dispose();
    this.scene.add(buildArena()); this.environment = new IslandBackdrop(); this.scene.add(this.environment.group); this.particles = new Particles(this.scene);
    this.camera.position.set(70, 65, 72); this.camera.lookAt(0, 0, 0);
    this.resize = new ResizeObserver(() => this.updateSize()); this.resize.observe(container); this.updateSize();
    this.unsubscribe = connection.onSnapshot(s => this.receive(s));
    if (connection.state.snapshot) this.receive(connection.state.snapshot);
    this.renderer.setAnimationLoop(() => this.frame());
    this.inputTimer = setInterval(() => this.stepInputs(), DT * 1000);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
  }
  private contextLost = (event: Event) => { event.preventDefault(); console.error('WebGL context lost. Reload to restore the renderer.'); this.container.dataset.error = 'Graphics connection lost. Reload this page to restore the arena.'; };
  private updateSize() { const width = this.container.clientWidth, height = this.container.clientHeight; if (!width || !height) return; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); this.idleDirty = true; }
  private receive(state: Snapshot) {
    const id = connection.state.id;
    if (state.code !== this.lastCode) this.lastEvent = 0;
    if (state.phase !== this.lastPhase || state.code !== this.lastCode) { this.controls.clear(); this.outgoing = []; this.accumulator = 0; this.previousInput = performance.now(); this.cameraReady = false; this.particles.reset(); this.idleDirty = true; if (state.phase === 'playing') this.renderer.domElement.focus({ preventScroll: true }); }
    this.lastPhase = state.phase; this.lastCode = state.code;
    if (id) this.prediction.reconcile(state, id);
    this.interpolation.push(state);
    const present = new Set(state.players.map(p => p.id));
    for (const [key, kart] of this.karts) if (!present.has(key)) { this.scene.remove(kart.group); disposeObject(kart.group); this.karts.delete(key); this.renderer.shadowMap.needsUpdate = true; this.idleDirty = true; }
    for (const player of state.players) if (!this.karts.has(player.id)) {
      const visual = createKart(player.color, player.name); visual.group.position.set(player.x, player.y, player.z); visual.group.rotation.y = player.yaw; this.scene.add(visual.group); this.karts.set(player.id, visual); this.renderer.shadowMap.needsUpdate = true; this.idleDirty = true;
    }
    for (const box of state.pickups) {
      if (!this.pickups.has(box.id)) { const visual = this.pickupTemplate.clone(); this.pickups.set(box.id, visual); }
      updatePickupVisual(this.pickups.get(box.id)!, box, state.phase === 'playing', state.time, performance.now());
    }
    const activeProjectiles = new Set(state.projectiles.map(p => p.id));
    for (const [key, visual] of this.projectiles) if (!activeProjectiles.has(key)) { this.scene.remove(visual); this.projectiles.delete(key); }
    for (const p of state.projectiles) if (!this.projectiles.has(p.id)) {
      let template = this.projectileTemplates.get(p.kind); if (!template) { template = createProjectile(p.kind); this.projectileTemplates.set(p.kind, template); }
      const visual = template.clone(); this.scene.add(visual); this.projectiles.set(p.id, visual);
    }
    const self = state.players.find(p => p.id === id);
    for (const event of state.events) if (event.id > this.lastEvent) {
      this.lastEvent = event.id;
      if (state.phase !== 'playing') continue;
      if (state.time - event.at > 0.3) continue;
      this.particles.emit(event);
      const distance = self ? Math.hypot(self.x - event.x, self.z - event.z) : 30;
      this.audio.event(event, distance);
      if (event.kind === 'explosion' && distance < 14 || event.kind === 'collision' && event.player === id) this.shake = Math.min(.12, this.shake + .09 / (1 + distance / 5));
    }
    this.lastFrame = performance.now();
  }
  private stepInputs() {
    const now = performance.now(), delta = Math.min(0.1, (now - this.previousInput) / 1000); this.previousInput = now;
    const state = connection.state.snapshot, self = state?.players.find(p => p.id === connection.state.id);
    if (!state || !self || state.phase !== 'playing' || connection.state.status !== 'connected' || document.hidden) { this.accumulator = 0; this.outgoing = []; return; }
    this.accumulator += delta;
    while (this.accumulator >= DT) {
      const input = this.controls.read(this.prediction.sequence + 1);
      this.prediction.step(input, self, state.time + (now - this.lastFrame) / 1000);
      this.outgoing.push(input); this.accumulator -= DT;
      if (this.outgoing.length >= 3) connection.send({ type: 'input', commands: this.outgoing.splice(0, 3) });
    }
  }
  private frame() {
    const now = performance.now();
    const mode = connection.state.snapshot?.phase ?? 'menu';
    if (mode !== this.renderMode) { this.renderMode = mode; this.idleDirty = true; }
    // Menus use a static arena view and redraw only when membership/phase changes.
    // Idle backgrounds must not compete with active game windows for GPU time.
    if (mode !== 'playing' && !this.idleDirty) { this.previous = now; return; }
    // Menus and background tabs do not need a full-speed arena render loop.
    const interval = document.hidden ? 250 : connection.state.snapshot?.phase === 'playing' ? 0 : 250;
    if (now - this.previous < interval) return;
    const elapsed = (now - this.previous) / 1000;
    const delta = Math.min(0.1, elapsed); this.previous = now;
    const state = connection.state.snapshot, id = connection.state.id;
    const self = state?.players.find(p => p.id === id) ?? null;
    const playing = state?.phase === 'playing' && connection.state.status === 'connected';
    if (state) {
      for (const p of state.players) this.renderKart(p, id, now, delta, state);
      for (const box of state.pickups) {
        updatePickupVisual(this.pickups.get(box.id)!, box, state.phase === 'playing', state.time, now);
      }
      const extrapolation = Math.min(0.1, (now - this.lastFrame) / 1000);
      for (const p of state.projectiles) {
        const visual = this.projectiles.get(p.id)!;
        const position = ballisticPosition(p, extrapolation, p.kind === 'cannonball' || p.kind === 'bomb' ? CONFIG.gravity : 0);
        visual.position.set(position.x, position.y, position.z);
        if (p.kind !== 'mine' && p.kind !== 'bomb') visual.lookAt(visual.position.x + p.vx, visual.position.y + p.vy, visual.position.z + p.vz);
        if (p.kind === 'mine') visual.scale.setScalar(state.time >= p.armedAt ? 1 + Math.sin(now / 100) * 0.06 : 0.85);
        if (p.kind === 'bomb') {
          const fuse = Math.max(0, Math.min(1, (p.expires - state.time) / 1.6));
          visual.scale.setScalar(1 + Math.sin(now / (35 + fuse * 100)) * 0.06 * (1 - fuse));
        }
        this.particles.trail({ ...p, x: visual.position.x, y: visual.position.y, z: visual.position.z }, delta);
      }
    }
    if(!state)for(const visual of this.pickups.values())visual.visible=false;
    this.pickupBatch.sync(this.pickups.values());
    if (playing && self) this.followCamera(self, delta);
    else { this.camera.position.set(70, 65, 72); this.camera.lookAt(0, 0, 0); this.cameraReady = false; }
    this.audio.update(self, this.prediction.kart, !!playing, delta);
    this.environment.update(now / 1000, this.camera.position, this.container.dataset.reducedGraphics === 'true');
    this.particles.update(delta);
    if (playing && !document.hidden && now - this.lastShadow >= 1000 / 20) { this.renderer.shadowMap.needsUpdate = true; this.lastShadow = now; }
    this.renderer.render(this.scene, this.camera);
    if (!playing) this.container.dataset.idleRenders = String(++this.idleRenders);
    this.idleDirty = false;
    this.frames++; this.frameAverage += (elapsed * 1000 - this.frameAverage) * 0.05;
    if (now - this.statsAt > 1000) {
      this.container.dataset.drawCalls = String(this.renderer.info.render.calls);
      this.container.dataset.triangles = String(this.renderer.info.render.triangles);
      this.container.dataset.fps = String(Math.round(this.frames * 1000 / (now - this.statsAt)));
      this.container.dataset.audioVoices = String(this.audio.activeVoices);
      this.container.dataset.frameMs = this.frameAverage.toFixed(2);
      this.frames = 0; this.statsAt = now;
      // Foreground measurements only; menu/background throttling never selects low quality.
      this.slowSamples = playing && !document.hidden && this.frameAverage > 50 ? this.slowSamples + 1 : 0;
      if (this.slowSamples >= 3) {
        if (this.renderer.getPixelRatio() > 0.85) { this.renderer.setPixelRatio(0.85); this.updateSize(); }
        this.renderer.shadowMap.enabled = false; this.container.dataset.reducedGraphics = 'true';
      } else if (playing && !document.hidden && this.frameAverage > 36 && this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.updateSize(); }
    }
  }
  private renderKart(p: PlayerState, id: string | null, now: number, dt: number, state: Snapshot) {
    const visual = this.karts.get(p.id)!;
    const position = p.id === id ? this.prediction.kart ?? p : this.interpolation.sample(p.id, now) ?? p;
    const smoothing = p.id === id ? 1 - Math.exp(-22 * dt) : 1;
    const target = this.visualTarget.set(position.x, position.y, position.z);
    if (visual.group.position.distanceTo(target) > 5) visual.group.position.copy(target); else visual.group.position.lerp(target, smoothing);
    visual.group.rotation.y += angleDelta(visual.group.rotation.y, position.yaw) * smoothing;
    visual.group.visible = p.health > 0;
    visual.shield.visible = state.phase === 'playing' && (state.time < p.shieldUntil || state.time < p.invulnerableUntil);
    visual.shield.rotation.y += dt * 0.7;
    const shieldHit = state.events.some(e => e.kind === 'shieldImpact' && e.target === p.id && state.time - e.at < 0.18);
    (visual.shield.material as THREE.MeshBasicMaterial).opacity = shieldHit ? 0.38 : 0.12 + Math.sin(now / 240) * 0.035;
    visual.boost.visible = state.time < p.boostUntil; visual.boost.scale.y = 0.8 + Math.sin(now / 45) * 0.2;
    visual.orbit.visible = state.phase === 'playing' && state.time < (p.orbitUntil ?? 0);
    visual.orbit.rotation.y = state.time * 5;
    visual.label.visible = p.id !== id;
    visual.missileMarker.visible = state.projectiles.some(projectile => projectile.kind === 'homing' && projectile.target === p.id);
    visual.missileMarker.rotation.z = now / 400;
    const telemetry = drivingTelemetry(position);
    if (p.id === id) { this.container.dataset.kartY = String(visual.group.position.y); this.container.dataset.predictionY = String(position.y); }
    if (telemetry.grounded) visual.group.position.y = Math.max(groundHeight(visual.group.position.x, visual.group.position.z), visual.group.position.y);
    visual.contact.visible = !this.renderer.shadowMap.enabled;
    visual.contact.position.y = groundHeight(visual.group.position.x, visual.group.position.z) - visual.group.position.y + 0.025;
    (visual.contact.material as THREE.MeshBasicMaterial).opacity = 0.22 / (1 + Math.max(0, -visual.contact.position.y) * 2);
    const animation = animateSuspension(visual.suspension, position, dt);
    visual.chassis.position.y = visual.suspension.offset;
    if (p.id === id && animation.landing > 2) { this.audio.landing(animation.landing); this.shake = Math.max(this.shake, .035); }
    for (const wheel of visual.wheels) wheel.rotation.x += telemetry.forward * dt / .36;
    const wheelAngle = Math.atan((position.yawRate ?? 0) * CONFIG.wheelbase / (Math.abs(telemetry.forward) > 0.2 ? telemetry.forward : 0.2));
    for (const pivot of visual.steering) pivot.rotation.y += (Math.max(-0.5, Math.min(0.5, wheelAngle)) - pivot.rotation.y) * (1 - Math.exp(-12 * dt));
    const fx = Math.sin(position.yaw), fz = Math.cos(position.yaw);
    const slope = telemetry.grounded ? -Math.atan2(groundHeight(position.x + fx * 0.8, position.z + fz * 0.8) - groundHeight(position.x - fx * 0.8, position.z - fz * 0.8), 1.6) : 0;
    visual.chassis.rotation.x += (Math.max(-0.4, Math.min(0.4, slope + visual.suspension.pitch)) - visual.chassis.rotation.x) * (1 - Math.exp(-12 * dt));
    for (const wheel of visual.wheels) {
      const pivot = wheel.parent!;
      const contact = groundHeight(position.x + Math.cos(position.yaw) * pivot.position.x + fx * pivot.position.z, position.z - fx * pivot.position.x + fz * pivot.position.z);
      const wheelHeight = .36 + (telemetry.grounded ? Math.max(-.28, Math.min(.28, contact - position.y)) : -.05);
      pivot.position.y += (wheelHeight - pivot.position.y) * (1 - Math.exp(-18 * dt));
    }
    visual.chassis.rotation.z = visual.suspension.roll;
    const aim = p.weapon && WEAPONS[p.weapon].aimAssist ? weaponAim({ ...p, ...position }, state.players, state.time, p.weapon).direction : null;
    const turretYaw = aim ? angleDelta(position.yaw, Math.atan2(aim.x, aim.z)) : 0;
    visual.turret.rotation.y += (turretYaw - visual.turret.rotation.y) * (1 - Math.exp(-18 * dt));
    visual.turret.rotation.x += ((aim ? -Math.asin(aim.y) : 0) - visual.turret.rotation.x) * (1 - Math.exp(-18 * dt));
    visual.cannon.visible = p.weapon === 'cannon' || state.events.some(e => e.kind === 'fire' && e.player === p.id && e.weapon === 'cannon' && state.time - e.at < 0.6);
    visual.turret.visible = !visual.cannon.visible;
    if (state.time < p.boostUntil && state.phase === 'playing') this.particles.boost(position, dt);
    if (p.health > 0 && state.phase === 'playing') this.particles.drive(position, p.id, dt);
  }
  private followCamera(self: PlayerState, dt: number) {
    const visual = this.karts.get(self.id)!;
    const pos = visual.group.position;
    if (!this.cameraReady) this.renderYaw = visual.group.rotation.y;
    this.renderYaw += angleDelta(this.renderYaw, visual.group.rotation.y) * (1 - Math.exp(-9 * dt));
    const fx = Math.sin(this.renderYaw), fz = Math.cos(this.renderYaw);
    this.aim.set(pos.x + fx * 3.6, pos.y + 1.85, pos.z + fz * 3.6);
    const speed = Math.min(1, Math.hypot(self.vx, self.vz) / (CONFIG.maxSpeed * CONFIG.boostMultiplier));
    const distance = 8.8 + speed * 2.2, fov = 62 + speed * 5;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-3 * dt)); this.camera.updateProjectionMatrix();
    this.cameraTarget.set(pos.x - fx * distance, pos.y + 4.7 + speed * .5, pos.z - fz * distance);
    const anchor = { x: pos.x, y: pos.y + 1.2, z: pos.z };
    Object.assign(this.aim, clipCameraRay(anchor, this.aim));
    Object.assign(this.cameraTarget, clipCameraRay(anchor, this.cameraTarget));
    if (!this.cameraReady || this.camera.position.distanceTo(this.cameraTarget) > 20) this.camera.position.copy(this.cameraTarget);
    else this.camera.position.lerp(this.cameraTarget, 1 - Math.exp(-12 * dt));
    Object.assign(this.camera.position, clipCameraRay(anchor, this.camera.position));
    this.shake *= Math.exp(-12 * dt);
    this.camera.position.x += Math.sin(performance.now() * .045) * this.shake;
    this.camera.position.y += Math.sin(performance.now() * .053) * this.shake * .5;
    Object.assign(this.camera.position, clipCameraRay(anchor, this.camera.position));
    this.camera.lookAt(this.aim); this.cameraReady = true;
    this.container.dataset.cameraY=this.camera.position.y.toFixed(3);
  }
  dispose() {
    this.renderer.setAnimationLoop(null); clearInterval(this.inputTimer); this.unsubscribe(); this.controls.dispose(); this.audio.dispose(); this.resize.disconnect(); this.particles.dispose();
    this.pickupBatch.dispose();
    disposeObject(this.scene); disposeObject(this.pickupTemplate); for (const template of this.projectileTemplates.values()) disposeObject(template);
    this.scene.environment?.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
