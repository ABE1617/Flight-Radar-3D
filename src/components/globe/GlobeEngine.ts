/**
 * Globe Engine — Premium cinematic 3D globe.
 * Shockwave pulses, particle streams, volumetric glow, holographic rings.
 *
 * Ported from vanilla JS to a class that integrates with React lifecycle.
 * Uses Three.js directly for full shader control.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as topojson from 'topojson-client';
import { COUNTRIES, latLngToVector3 } from '@/data/countries';
import { FlightLayer } from './FlightLayer';
import type { FlightData } from '@/types/flights';

interface ArcData {
  line: THREE.Line;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  pPts: THREE.Points;
  pGeo: THREE.BufferGeometry;
  pMat: THREE.ShaderMaterial;
  pPos: Float32Array;
  pPh: Float32Array;
  pN: number;
  // Spark burst at arrival
  spark: THREE.Points;
  sparkGeo: THREE.BufferGeometry;
  sparkMat: THREE.ShaderMaterial;
  sparkPos: Float32Array;
  sparkVel: Float32Array;
  sparkOrigin: THREE.Vector3;
  curve: THREE.QuadraticBezierCurve3;
  state: string;
  holdT: number;
  draw: number;
  pTime: number;
  delay: number;
}

interface HighlightData {
  idx: number;
  line: THREE.LineSegments;
  mat: THREE.ShaderMaterial;
  geo: THREE.BufferGeometry;
  gL: THREE.LineSegments;
  gM: THREE.LineBasicMaterial;
  gG: THREE.BufferGeometry;
  timer: number;
}



export class GlobeEngine {
  private el: HTMLElement;
  private R = 5;
  private mouse = { x: 0, y: 0 };
  private ms = { x: 0, y: 0 };
  private ld: THREE.Vector3;
  private cv: Float32Array[] = [];
  private cen: THREE.Vector3[] = [];
  private clng: number[] = [];
  private hlOrd: number[] = [];
  private hlS = 0;
  private hlT = 0;
  private aHL: HighlightData | null = null;
  private fHL: HighlightData | null = null;
  private arcs: ArcData[] = [];
  private rdy = false;
  private clk: THREE.Clock;
  private t = 0;
  private vis = true;

  private scene!: THREE.Scene;
  private cam!: THREE.PerspectiveCamera;
  private ren!: THREE.WebGLRenderer;
  private g!: THREE.Group;
  private ag!: THREE.Group;
  private comp!: EffectComposer;
  private useC = false;

  private starM!: THREE.Points;
  private neb!: THREE.Mesh;
  private body!: THREE.Mesh;
  private scanDots!: THREE.Points;
  private outl!: THREE.LineSegments;
  private _outlScene: THREE.Scene | null = null;
  private _outlGroup!: THREE.Group;
  private orb: THREE.Mesh[] = [];
  private orbT!: THREE.LineSegments;

  private _landTex: THREE.Texture | null = null;
  private _flightLayer: FlightLayer | null = null;
  private _selectedFlight: FlightData | null = null;
  private _ambientArcTimer: number | undefined;
  private _frameId = 0;
  private _boundFrame: () => void;
  private _boundResize: () => void;
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundMouseDown: (e: MouseEvent) => void;
  private _boundMouseUp: () => void;
  private _boundMouseLeave: () => void;
  private _boundVisChange: () => void;
  private _boundContextMenu: (e: Event) => void;
  private _boundWheel: (e: WheelEvent) => void;
  private _boundClick: (e: MouseEvent) => void;
  private _boundTouchStart: (e: TouchEvent) => void;
  private _boundTouchMove: (e: TouchEvent) => void;
  private _boundTouchEnd: (e: TouchEvent) => void;
  private _touchStartDist = 0; // pinch-to-zoom baseline
  private _touchStartZoom = 16;
  private _touchStartX = 0;
  private _touchStartY = 0;
  private _touchMoved = false;
  private _paused = false;
  private _disposed = false;

  // Click-to-select
  private _raycaster = new THREE.Raycaster();
  private _clickNDC = new THREE.Vector2();
  private _globeHitSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5 * 1.02);
  private _onFlightClick: ((id: string | null) => void) | null = null;
  private _onReady: (() => void) | null = null;
  private _prevTrackedId: string | null = null;
  private _trackTransition = 0; // counts up after flight switch for fast initial lerp

  // Reusable objects for quaternion-based flight tracking (avoids per-frame allocation)
  private _qTarget = new THREE.Quaternion();
  private _qCenter = new THREE.Quaternion();
  private _qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.18);
  private _pVec = new THREE.Vector3();

  // Drag-to-rotate state
  private _dragging = false;
  private _dragPrevX = 0;
  private _dragPrevY = 0;
  private _dragVelX = 0; // inertia velocity Y-axis
  private _dragVelY = 0; // inertia velocity X-axis
  private _userRotY = 0; // accumulated user rotation around Y
  private _userRotX = 0; // accumulated user rotation around X

  // Zoom state
  private _defaultZoom = typeof window !== 'undefined' && window.innerWidth < 640 ? 22 : 16;
  private _camZ = 16;
  private _targetCamZ = 16;
  private _userZoom = 16;
  private _preTrackZoom = 16;
  private _trackingZoom = false;

  constructor(container: HTMLElement) {
    this.el = container;
    this.ld = new THREE.Vector3(1, 0.6, 0.8).normalize();
    this.clk = new THREE.Clock();

    // Mobile starts more zoomed out so the full globe is visible
    this._camZ = this._defaultZoom;
    this._targetCamZ = this._defaultZoom;
    this._userZoom = this._defaultZoom;
    this._preTrackZoom = this._defaultZoom;
    // Match Three.js v0.149 behavior — newer versions enable color
    // management by default which applies sRGB gamma, making everything
    // brighter and washing out the additive-blending glow effects.
    THREE.ColorManagement.enabled = false;

    this._boundFrame = this._frame.bind(this);
    this._boundResize = this._resize.bind(this);
    this._boundMouseMove = (e: MouseEvent) => {
      this.mouse.x = (e.clientX / innerWidth - 0.5) * 2;
      this.mouse.y = (e.clientY / innerHeight - 0.5) * 2;

      if (this._dragging) {
        const dx = e.clientX - this._dragPrevX;
        const dy = e.clientY - this._dragPrevY;
        const sensitivity = 0.004;
        this._dragVelX = dx * sensitivity;
        this._dragVelY = dy * sensitivity;
        this._userRotY += this._dragVelX;
        this._userRotX += this._dragVelY;
        // Clamp vertical rotation so you can't flip the globe upside down
        this._userRotX = Math.max(-1.5, Math.min(1.5, this._userRotX));
        this._dragPrevX = e.clientX;
        this._dragPrevY = e.clientY;
      }
    };
    this._boundMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        this._dragging = true;
        this._dragPrevX = e.clientX;
        this._dragPrevY = e.clientY;
        this._dragVelX = 0;
        this._dragVelY = 0;
      }
    };
    this._boundMouseUp = () => {
      this._dragging = false;
    };
    this._boundMouseLeave = () => {
      this._dragging = false;
    };
    this._boundVisChange = () => {
      this.vis = !document.hidden;
      if (this.vis) this.clk.getDelta();
    };
    this._boundContextMenu = (e: Event) => e.preventDefault();
    this._boundClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!this._flightLayer || !this._onFlightClick) return;

      this._clickNDC.x = (e.clientX / innerWidth) * 2 - 1;
      this._clickNDC.y = -(e.clientY / innerHeight) * 2 + 1;

      this._raycaster.setFromCamera(this._clickNDC, this.cam);

      // Intersect a sphere matching the globe surface in world space.
      // The globe group may be rotated, so transform the sphere center.
      this.g.updateMatrixWorld(true);
      const worldCenter = new THREE.Vector3(0, 0, 0).applyMatrix4(this.g.matrixWorld);
      const hitSphere = new THREE.Sphere(worldCenter, this.R * 1.02);
      const hitPoint = new THREE.Vector3();

      if (!this._raycaster.ray.intersectSphere(hitSphere, hitPoint)) return;

      // Convert hit point back to globe-local space to get lat/lng
      const invMatrix = new THREE.Matrix4().copy(this.g.matrixWorld).invert();
      hitPoint.applyMatrix4(invMatrix);

      // Convert local xyz to lat/lng
      const r = hitPoint.length();
      const lat = Math.asin(hitPoint.y / r) * (180 / Math.PI);
      let lng = Math.atan2(hitPoint.z, -hitPoint.x) * (180 / Math.PI) - 180;
      if (lng < -180) lng += 360;

      // Find the nearest flight within a click threshold, or deselect
      const nearest = this._flightLayer.findNearest(lat, lng, 5);
      this._onFlightClick(nearest ?? null);
    };
    this._boundWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Normalize delta across input types:
      // deltaMode 0 = pixels (trackpad), 1 = lines (scroll wheel), 2 = pages
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;    // lines → pixels
      else if (e.deltaMode === 2) delta *= 100; // pages → pixels

      // Trackpads send small deltas (1-10px), scroll wheels send large (50-150px).
      // Use a speed that works for both — fast enough for trackpad, not crazy for wheel.
      const zoomSpeed = 0.008;
      this._userZoom += delta * zoomSpeed;
      // Clamp: close enough to see detail, far enough to see whole globe
      this._userZoom = Math.max(6.5, Math.min(30, this._userZoom));
    };

    // ── Touch handlers (mobile globe navigation) ──
    this._boundTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Single finger = potential drag or tap
        this._dragging = false;
        this._touchMoved = false;
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
        this._dragPrevX = e.touches[0].clientX;
        this._dragPrevY = e.touches[0].clientY;
        this._dragVelX = 0;
        this._dragVelY = 0;
      } else if (e.touches.length === 2) {
        // Two fingers = pinch to zoom
        this._dragging = false;
        this._touchMoved = true; // not a tap
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this._touchStartDist = Math.sqrt(dx * dx + dy * dy);
        this._touchStartZoom = this._userZoom;
      }
    };
    this._boundTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - this._touchStartX;
        const dy = t.clientY - this._touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Only start dragging after moving > 8px (tap threshold)
        if (!this._touchMoved && dist > 8) {
          this._touchMoved = true;
          this._dragging = true;
        }

        if (this._dragging) {
          e.preventDefault(); // prevent page scroll only when actually dragging
          const moveDx = t.clientX - this._dragPrevX;
          const moveDy = t.clientY - this._dragPrevY;
          const sensitivity = 0.002;
          this._dragVelX = moveDx * sensitivity;
          this._dragVelY = moveDy * sensitivity;
          this._userRotY += this._dragVelX;
          this._userRotX += this._dragVelY;
          this._userRotX = Math.max(-1.5, Math.min(1.5, this._userRotX));
          this._dragPrevX = t.clientX;
          this._dragPrevY = t.clientY;
        }
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (this._touchStartDist > 0) {
          // Additive: each pixel of pinch spread = direct zoom change
          // Pinch out (spread fingers) → dist grows → negative delta → zoom in (lower value)
          // Pinch in (squeeze fingers) → dist shrinks → positive delta → zoom out (higher value)
          const delta = this._touchStartDist - dist;
          this._userZoom = Math.max(6.5, Math.min(30, this._touchStartZoom + delta * 0.06));
        }
      }
    };
    this._boundTouchEnd = (e: TouchEvent) => {
      // If finger lifted without dragging, treat as a tap → fire click logic
      if (!this._touchMoved && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this._boundClick(new MouseEvent('click', {
          clientX: t.clientX,
          clientY: t.clientY,
          button: 0,
        }));
      }
      this._dragging = false;
      this._touchStartDist = 0;
      this._touchMoved = false;
    };

    this._init();
    this._stars();
    this._nebula();
    this._globeBody();
    this._scanEffect();
    this._atmosphere();
    this._orbitalRings();
    this._bloom();
    this._flightLayer = new FlightLayer(this.R);
    this._setupEvents();
    this._loadCountries();
    this._frame();
  }

  private _init() {
    const w = innerWidth, h = innerHeight;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
    this.cam.position.set(0, 2, 16);
    this.cam.lookAt(0, 0, 0);
    this.ren = new THREE.WebGLRenderer({ antialias: true });
    this.ren.setSize(w, h);
    this.ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.ren.setClearColor(0x010108, 1);
    // Use LinearSRGBColorSpace to match v0.149 output (no auto gamma)
    this.ren.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.ren.toneMapping = THREE.ACESFilmicToneMapping;
    this.ren.toneMappingExposure = 1.2;
    this.el.appendChild(this.ren.domElement);
    this.g = new THREE.Group();
    this.g.rotation.z = -0.18;
    this.g.rotation.x = 0.12;
    this.scene.add(this.g);
    this.ag = new THREE.Group();
    this.g.add(this.ag);
  }

  private _bloom() {
    const w = innerWidth, h = innerHeight;
    try {
      // Use UnsignedByteType render target to match v0.149 bloom behavior.
      // Newer Three.js defaults to HalfFloatType which gives more HDR
      // headroom and makes bloom accumulate much brighter.
      const rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
      });
      this.comp = new EffectComposer(this.ren, rt);
      this.comp.addPass(new RenderPass(this.scene, this.cam));
      this.comp.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 2.2, 0.4, 0.35));
      this.useC = true;
    } catch { this.useC = false; }
  }

  /* ═══════════════ STARS ═══════════════════════════════ */

  private _stars() {
    const N = 4000, p = new Float32Array(N * 3), s = new Float32Array(N),
      c = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * 6.283, pp = Math.acos(2 * Math.random() - 1), r = 25 + Math.random() * 160;
      p[i * 3] = r * Math.sin(pp) * Math.cos(th); p[i * 3 + 1] = r * Math.sin(pp) * Math.sin(th); p[i * 3 + 2] = r * Math.cos(pp);
      s[i] = 0.15 + Math.pow(Math.random(), 2.5) * 3.0;
      ph[i] = Math.random() * 6.283;
      const t = Math.random();
      if (t < 0.5) { c[i * 3] = 0.92; c[i * 3 + 1] = 0.94; c[i * 3 + 2] = 1.0; }
      else if (t < 0.7) { c[i * 3] = 1.0; c[i * 3 + 1] = 0.8; c[i * 3 + 2] = 0.55; }
      else if (t < 0.85) { c[i * 3] = 0.55; c[i * 3 + 1] = 0.78; c[i * 3 + 2] = 1.0; }
      else { c[i * 3] = 0.85; c[i * 3 + 1] = 0.55; c[i * 3 + 2] = 0.95; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(s, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    this.starM = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `
        attribute float size,phase;attribute vec3 color;
        uniform float uT,uPR;varying float vA;varying vec3 vC;
        void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.0);
        float tw=sin(uT*0.25+phase)*0.5+0.5;float tw2=sin(uT*0.6+phase*2.7)*0.5+0.5;
        vA=0.08+0.55*tw*tw2;gl_PointSize=size*uPR*(80.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `
        varying float vA;varying vec3 vC;
        void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;
        float core=exp(-d*d*22.0);float halo=exp(-d*d*3.5)*0.25;
        gl_FragColor=vec4(vC*(1.0+core*0.5),(core+halo)*vA);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.scene.add(this.starM);
  }

  /* ═══════════════ NEBULA ══════════════════════════════ */

  private _nebula() {
    const geo = new THREE.PlaneGeometry(160, 160);
    this.neb = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform float uT;varying vec2 vUv;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*n(p);p*=2.05;a*=0.47;}return v;}
        void main(){
          vec2 uv=vUv-0.5;float d=length(uv);
          float n1=fbm(uv*2.0+uT*0.006);
          float n2=fbm(uv*3.0-uT*0.009+5.0);
          float n3=fbm(uv*1.5+uT*0.004+12.0);
          vec3 c1=vec3(0.08,0.01,0.18)*n1;
          vec3 c2=vec3(0.01,0.07,0.20)*n2;
          vec3 c3=vec3(0.04,0.01,0.10)*n3;
          float glow=exp(-d*d*6.0)*0.12;
          vec3 glowCol=vec3(0.05,0.15,0.35)*glow;
          float mask=smoothstep(0.7,0.02,d)*0.5;
          gl_FragColor=vec4((c1+c2+c3)*mask+glowCol,1.0);}`,
      depthWrite: false
    }));
    this.neb.position.z = -60;
    this.scene.add(this.neb);
  }

  /* ═══════════════ GLOBE SURFACE ═══════════════════════ */

  private _globeBody() {
    const geo = new THREE.SphereGeometry(this.R * 0.996, 96, 96);
    this.body = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: {
        uLD: { value: this.ld }, uT: { value: 0 },
        uLand: { value: null }, uHasLand: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vN,vW,vP;
        varying vec2 vUV;
        void main(){
          vN=normalize(normalMatrix*normal);
          vW=(modelMatrix*vec4(position,1.0)).xyz;
          vP=position;
          vUV=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLD;uniform float uT;
        uniform sampler2D uLand;uniform float uHasLand;
        varying vec3 vN,vW,vP;
        varying vec2 vUV;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec3 N=normalize(vN),V=normalize(cameraPosition-vW);
          float light=dot(normalize(vW),uLD)*0.5+0.5;
          float fresnel=pow(1.0-max(dot(N,V),0.0),5.0);
          vec2 sp=vec2(atan(vP.z,vP.x),asin(clamp(vP.y/length(vP),-1.0,1.0)));
          float pattern=n(sp*8.0+uT*0.02)*0.02;

          // Sample land mask
          float land=0.0;
          if(uHasLand>0.5) land=texture2D(uLand,vUV).r;

          // Ocean colors (original dark blue)
          vec3 darkSea=vec3(0.005,0.005,0.015);
          vec3 litSea=vec3(0.015,0.022,0.05)+pattern;
          // Land colors (slightly brighter, warmer tint)
          vec3 darkLand=vec3(0.015,0.015,0.025);
          vec3 litLand=vec3(0.035,0.04,0.065)+pattern;

          vec3 dark=mix(darkSea,darkLand,land);
          vec3 lit=mix(litSea,litLand,land);

          vec3 col=mix(dark,lit,light);
          col+=vec3(0.04,0.12,0.28)*fresnel*0.8;
          vec3 H=normalize(V+uLD);
          float spec=pow(max(dot(N,H),0.0),60.0)*0.08*light;
          col+=vec3(0.3,0.5,0.8)*spec;
          gl_FragColor=vec4(col,1.0);}`,
      depthWrite: true
    }));
    this.g.add(this.body);
  }

  /* ═══════════════ SCAN EFFECT ═════════════════════════ */

  private _scanEffect() {
    const R = this.R * 1.002, N = 5000, gr = (1 + Math.sqrt(5)) / 2;
    const pos: number[] = [], sz: number[] = [];
    for (let i = 0; i < N; i++) {
      const th = Math.acos(1 - 2 * (i + 0.5) / N), phi = 2 * Math.PI * i / gr;
      pos.push(R * Math.sin(th) * Math.cos(phi), R * Math.cos(th), R * Math.sin(th) * Math.sin(phi));
      sz.push(0.4 + Math.random() * 0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(sz, 1));
    this.scanDots = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uLD: { value: this.ld }, uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `
        attribute float size;
        uniform float uT,uPR;uniform vec3 uLD;
        varying float vA;
        void main(){
          vec4 wp=modelMatrix*vec4(position,1.0);
          vec3 wn=normalize(wp.xyz),vd=normalize(cameraPosition-wp.xyz);
          float facing=dot(wn,vd);
          if(facing<0.0){gl_Position=vec4(0,0,2,1);gl_PointSize=0.0;return;}
          float light=dot(wn,uLD)*0.5+0.5;
          // Scan band: north-to-south sweep, 5s cycle
          float cycle=mod(uT,5.0)/5.0;
          float scanY=1.0-cycle*2.0;
          float scanDist=abs(wn.y-scanY);
          float scanLine=smoothstep(0.18,0.0,scanDist);
          // Only visible at scan line — zero otherwise
          vA=scanLine*(0.4+0.6*light)*smoothstep(0.0,0.12,facing);
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=(size+scanLine*0.8)*uPR*(50.0/-mv.z);
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main(){
          float d=length(gl_PointCoord-0.5);if(d>0.45)discard;
          float a=smoothstep(0.45,0.02,d);
          vec3 col=vec3(0.15,0.7,0.95);
          gl_FragColor=vec4(col,a*vA);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.g.add(this.scanDots);
  }

  /* ═══════════════ ATMOSPHERE ══════════════════════════ */

  private _atmosphere() {
    const mk = (sc: number, pw: number, op: number, col: number) => {
      const g = new THREE.SphereGeometry(this.R * sc, 64, 64);
      const c = new THREE.Color(col);
      this.g.add(new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: { uC: { value: c } },
        vertexShader: `varying vec3 vN,vW;void main(){vN=normalize(normalMatrix*normal);vW=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 uC;varying vec3 vN,vW;void main(){float f=pow(1.0-abs(dot(vN,normalize(cameraPosition-vW))),${pw.toFixed(1)});gl_FragColor=vec4(uC,f*${op.toFixed(3)});}`,
        transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending
      })));
    };
    mk(1.025, 5.5, 0.40, 0x1599ee);
    mk(1.08, 4.5, 0.22, 0x0066bb);
    mk(1.16, 3.5, 0.10, 0x003377);
    mk(1.28, 2.5, 0.04, 0x002244);
  }

  /* ═══════════════ ORBITAL RINGS ═══════════════════════ */

  private _orbitalRings() {
    this.orb = [];
    const cfgs = [
      { r: this.R * 1.32, tb: 0.007, tx: 1.15, tz: 0.3, sp: 0.1, c: 0x1599dd, o: 0.30 },
      { r: this.R * 1.50, tb: 0.005, tx: 0.85, tz: -0.45, sp: -0.06, c: 0x0077bb, o: 0.18 },
      { r: this.R * 1.70, tb: 0.003, tx: 1.55, tz: 0.6, sp: 0.035, c: 0x005599, o: 0.10 },
    ];
    for (const c of cfgs) {
      const geo = new THREE.TorusGeometry(c.r, c.tb, 6, 220);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uOp: { value: c.o }, uC: { value: new THREE.Color(c.c) } },
        vertexShader: `varying vec3 vW;void main(){vW=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `
          uniform float uT,uOp;uniform vec3 uC;varying vec3 vW;
          void main(){
            float a=atan(vW.z,vW.x);
            float dash=sin(a*24.0+uT*2.5)*0.5+0.5;
            float dash2=sin(a*8.0-uT*1.2)*0.5+0.5;
            float fade=0.2+0.5*dash+0.3*dash2;
            gl_FragColor=vec4(uC,uOp*fade);}`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = c.tx; ring.rotation.z = c.tz; (ring as any)._sp = c.sp;
      this.orb.push(ring); this.scene.add(ring);
    }
    const tv: number[] = [], r1 = this.R * 1.31, r2 = this.R * 1.34;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * 6.283, h = i % 5 === 0 ? r2 + 0.08 : r2;
      tv.push(r1 * Math.cos(a), 0, r1 * Math.sin(a), h * Math.cos(a), 0, h * Math.sin(a));
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3));
    this.orbT = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      color: 0x2299dd, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.orbT.rotation.x = 1.15; this.orbT.rotation.z = 0.3;
    this.scene.add(this.orbT);
  }

  /* ═══════════════ COUNTRY DATA ════════════════════════ */

  private async _loadCountries() {
    let feat: any[] | null = null;
    let topoJson: any = null;
    try {
      const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      topoJson = await r.json();
      feat = (topojson.feature(topoJson, topoJson.objects.countries) as any).features;
    } catch { /* fall through to fallback */ }
    if (feat) {
      this._geo(feat);
      this._buildLandTexture(topoJson);
    } else {
      this._fallback(COUNTRIES);
    }
    this.hlOrd = this.clng.map((lng, i) => ({ i, lng, n: this.cv[i].length }))
      .filter(o => o.n > 60).sort((a, b) => a.lng - b.lng).map(o => o.i);
    this.rdy = true;
    this._onReady?.();
    this._ambientArcTimer = 0;
  }

  /** Paint land polygons onto a 2D canvas → equirectangular texture for the globe body. */
  private _buildLandTexture(topoJson: any) {
    if (!topoJson) return;
    const W = 2048, H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Ocean = transparent (shader handles ocean color), land = white
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';

    // Merge all countries into a single land MultiPolygon
    const land = topojson.merge(topoJson, topoJson.objects.countries.geometries);
    const polys = land.type === 'MultiPolygon' ? land.coordinates : [land.coordinates];

    for (const poly of polys) {
      // Outer ring + holes
      for (let ri = 0; ri < poly.length; ri++) {
        const ring = poly[ri];
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [lng, lat] = ring[i] as [number, number];
          // Equirectangular projection: lng [-180,180] → [0, W], lat [90,-90] → [0, H]
          const x = ((lng + 180) / 360) * W;
          const y = ((90 - lat) / 180) * H;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        if (ri === 0) ctx.fill(); // outer ring fills
        else {
          // Holes: clear with destination-out
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Fix north pole cutout: SphereGeometry UVs converge at the pole, so any
    // transparent pixels at the top of the texture create a visible circular hole.
    // Fill the top strip as land — the area is so small on the sphere it's invisible,
    // but it eliminates the pole singularity artifact.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, 6);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this._landTex = tex;

    // Inject texture into globe body shader
    const mat = this.body.material as THREE.ShaderMaterial;
    mat.uniforms.uLand = { value: tex };
    mat.uniforms.uHasLand = { value: 1.0 };
    mat.needsUpdate = true;
  }

  private _geo(features: any[]) {
    const r = this.R * 1.002, all: number[] = [];
    for (const f of features) {
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      const cv: number[] = []; let cx = 0, cy = 0, cz = 0, n = 0, ls = 0, ln = 0;
      for (const poly of polys) {
        const ring = poly[0]; if (ring.length < 4) continue;
        for (let i = 0; i < ring.length - 1; i++) {
          const [g1, a1] = ring[i], [g2, a2] = ring[i + 1];
          if (Math.abs(g2 - g1) > 170) continue;
          const [x1, y1, z1] = latLngToVector3(a1, g1, r), [x2, y2, z2] = latLngToVector3(a2, g2, r);
          all.push(x1, y1, z1, x2, y2, z2); cv.push(x1, y1, z1, x2, y2, z2);
          cx += x1 + x2; cy += y1 + y2; cz += z1 + z2; n += 2; ls += g1 + g2; ln += 2;
        }
      }
      if (n < 12) continue;
      this.cen.push(new THREE.Vector3(cx / n, cy / n, cz / n).normalize().multiplyScalar(r));
      this.cv.push(new Float32Array(cv)); this.clng.push(ls / ln);
    }
    this._outlines(all);
  }

  private _fallback(countries: typeof COUNTRIES) {
    const r = this.R * 1.002, all: number[] = [];
    for (const c of countries) {
      const cv: number[] = []; let cx = 0, cy = 0, cz = 0, n = 0, ls = 0, ln = 0;
      for (const path of c.paths) {
        for (let i = 0; i < path.length - 1; i++) {
          const [g1, a1] = path[i], [g2, a2] = path[i + 1];
          const [ax, ay, az] = latLngToVector3(a1, g1, 1), [bx, by, bz] = latLngToVector3(a2, g2, 1);
          const d = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)), om = Math.acos(d), sn = Math.sin(om);
          for (let s = 0; s < 4; s++) {
            const t1 = s / 4, t2 = (s + 1) / 4; let x1: number, y1: number, z1: number, x2: number, y2: number, z2: number;
            if (om < .001) {
              x1 = ax + (bx - ax) * t1; y1 = ay + (by - ay) * t1; z1 = az + (bz - az) * t1;
              x2 = ax + (bx - ax) * t2; y2 = ay + (by - ay) * t2; z2 = az + (bz - az) * t2;
            } else {
              const a1s = Math.sin((1 - t1) * om) / sn, b1s = Math.sin(t1 * om) / sn;
              const a2s = Math.sin((1 - t2) * om) / sn, b2s = Math.sin(t2 * om) / sn;
              x1 = a1s * ax + b1s * bx; y1 = a1s * ay + b1s * by; z1 = a1s * az + b1s * bz;
              x2 = a2s * ax + b2s * bx; y2 = a2s * ay + b2s * by; z2 = a2s * az + b2s * bz;
            }
            let l1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1), l2 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
            x1 = x1 / l1 * r; y1 = y1 / l1 * r; z1 = z1 / l1 * r;
            x2 = x2 / l2 * r; y2 = y2 / l2 * r; z2 = z2 / l2 * r;
            all.push(x1, y1, z1, x2, y2, z2); cv.push(x1, y1, z1, x2, y2, z2);
            cx += x1 + x2; cy += y1 + y2; cz += z1 + z2; n += 2;
          }
          ls += g1; ln++;
        }
      }
      if (!n) continue;
      this.cen.push(new THREE.Vector3(cx / n, cy / n, cz / n).normalize().multiplyScalar(r));
      this.cv.push(new Float32Array(cv)); this.clng.push(ls / ln);
    }
    this._outlines(all);
  }

  /* ═══════════════ COUNTRY OUTLINES ════════════════════ */

  private _outlines(verts: number[]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.outl = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      uniforms: {
        uC: { value: new THREE.Color(0x3399cc) }, uLD: { value: this.ld }
      },
      vertexShader: `
        uniform vec3 uLD;
        varying float vL,vR,vF;
        void main(){
          vec4 wp=modelMatrix*vec4(position,1.0);
          vec3 wn=normalize(wp.xyz),vd=normalize(cameraPosition-wp.xyz);
          vF=dot(wn,vd); vL=dot(wn,uLD)*0.5+0.5;
          vR=pow(1.0-abs(vF),2.5);
          gl_Position=vF<-0.02?vec4(0,0,2,1):projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 uC;varying float vL,vR,vF;
        void main(){
          float edge=smoothstep(0.0,0.14,vF);
          float alpha=(0.06+0.18*vL)*edge;
          vec3 col=uC*(0.45+0.55*vL);
          gl_FragColor=vec4(col,alpha);}`,
      transparent: true, depthWrite: false, depthTest: false
    }));
    // Render in separate scene after bloom — no glow
    this._outlScene = new THREE.Scene();
    this._outlGroup = new THREE.Group();
    this._outlGroup.add(this.outl);
    this._outlScene.add(this._outlGroup);
  }

  /* ═══════════════ HIGHLIGHT SYSTEM ════════════════════ */

  private _mkHL(idx: number): HighlightData {
    const v = this.cv[idx];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v.slice(), 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(0x00eeff) }, uOp: { value: 0 } },
      vertexShader: `
        varying float vF;void main(){
        vec4 wp=modelMatrix*vec4(position,1.0);vec3 wn=normalize(wp.xyz),vd=normalize(cameraPosition-wp.xyz);
        vF=dot(wn,vd);gl_Position=vF<-0.02?vec4(0,0,2,1):projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform vec3 uC;uniform float uOp;varying float vF;
        void main(){float e=smoothstep(0.0,0.1,vF);gl_FragColor=vec4(uC,uOp*e);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const line = new THREE.LineSegments(geo, mat); this.g.add(line);

    const r = this.R * 1.002;
    const gv = new Float32Array(v.length);
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2], s = (r * 1.006) / Math.sqrt(x * x + y * y + z * z);
      gv[i] = x * s; gv[i + 1] = y * s; gv[i + 2] = z * s;
    }
    const gG = new THREE.BufferGeometry();
    gG.setAttribute('position', new THREE.BufferAttribute(gv, 3));
    const gM = new THREE.LineBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const gL = new THREE.LineSegments(gG, gM); this.g.add(gL);

    return { idx, line, mat, geo, gL, gM, gG, timer: 0 };
  }

  private _rmHL(h: HighlightData) {
    this.g.remove(h.line); this.g.remove(h.gL);
    h.geo.dispose(); h.mat.dispose(); h.gG.dispose(); h.gM.dispose();
  }

  private _applyHL(h: HighlightData, t: number, op: number) {
    const p = 0.82 + 0.18 * Math.sin(t * 4.0);
    h.mat.uniforms.uOp.value = op * 0.85 * p;
    h.gM.opacity = op * 0.55 * p;
  }

  private _updateHL(dt: number) {
    if (!this.rdy || !this.hlOrd.length) return;
    this.hlT += dt * 1000;
    const T = 4800;

    if (!this.aHL) {
      const idx = this.hlOrd[this.hlS % this.hlOrd.length];
      this.aHL = this._mkHL(idx);
      this._spawnArcs(idx);
    }

    const t = this.hlT; let op: number;
    if (t < 1000) op = 1 - Math.pow(1 - t / 1000, 3);
    else if (t < 3000) op = 1.0;
    else if (t < T) op = 1 - Math.pow((t - 3000) / 1800, 2.5);
    else op = 0;
    this._applyHL(this.aHL, this.t, op);

    if (this.fHL) {
      this.fHL.timer += dt * 1000;
      const ft = Math.min(this.fHL.timer / 1500, 1);
      this._applyHL(this.fHL, this.t, 1 - Math.pow(ft, 2));
      if (ft >= 1) { this._rmHL(this.fHL); this.fHL = null; }
    }

    if (t >= T - 1000 && !this.fHL) {
      this.fHL = this.aHL; this.fHL.timer = 0;
      this.hlS++; this.hlT = 0;
      const ni = this.hlOrd[this.hlS % this.hlOrd.length];
      this.aHL = this._mkHL(ni);
      this._spawnArcs(ni);
    }
  }

  /* ═══════════════ FLIGHT ARCS + PARTICLE STREAM ══════ */

  private _spawnArcs(ci: number) {
    if (!this.cen[ci]) return;
    const from = this.cen[ci], cnt = 10 + Math.floor(Math.random() * 6), used = new Set([ci]);
    for (let a = 0; a < cnt; a++) {
      let to: number, att = 0;
      do { to = this.hlOrd[Math.floor(Math.random() * this.hlOrd.length)]; att++; } while (used.has(to) && att < 20);
      used.add(to);
      if (this.cen[to]) this._mkArc(from, this.cen[to], a * 0.2 + Math.random() * 0.2);
    }
  }

  private _spawnAmbientArc() {
    if (!this.rdy || this.hlOrd.length < 2) return;
    // Spawn a batch of 2-4 ambient arcs at once
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const a = this.hlOrd[Math.floor(Math.random() * this.hlOrd.length)];
      let b: number;
      do { b = this.hlOrd[Math.floor(Math.random() * this.hlOrd.length)]; } while (b === a);
      if (this.cen[a] && this.cen[b]) this._mkArc(this.cen[a], this.cen[b], Math.random() * 0.5);
    }
  }

  private _mkArc(from: THREE.Vector3, to: THREE.Vector3, delay: number) {
    delay = delay || 0;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(this.R + from.distanceTo(to) * 0.55);
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
    const total = 150, pts = curve.getPoints(total);
    const prog = new Float32Array(total + 1);
    for (let i = 0; i <= total; i++) prog[i] = i / total;

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('lineProgress', new THREE.BufferAttribute(prog, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uD: { value: 0 }, uT1: { value: new THREE.Color(0x004488) }, uT2: { value: new THREE.Color(0x00eeff) }, uOp: { value: 1 } },
      vertexShader: `
        attribute float lineProgress;uniform float uD;
        varying float vA,vTip;
        void main(){float drawn=step(lineProgress,uD);float dist=uD-lineProgress;
        vTip=smoothstep(0.035,0.0,dist)*drawn;
        float trail=smoothstep(0.35,0.0,dist)*drawn;
        vA=trail;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform vec3 uT1,uT2;uniform float uOp;varying float vA,vTip;
        void main(){vec3 c=mix(uT1,uT2,vTip);float b=1.0+vTip*3.0;
        gl_FragColor=vec4(c*b,vA*uOp);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const line = new THREE.Line(geo, mat);
    line.visible = delay <= 0;
    this.ag.add(line);

    const pN = 6, pPos = new Float32Array(pN * 3), pSz = new Float32Array(pN), pPh = new Float32Array(pN);
    for (let i = 0; i < pN; i++) { pSz[i] = 0.3 + Math.random() * 0.4; pPh[i] = i / pN; }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSz, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: Math.min(devicePixelRatio, 2) }, uOp: { value: 1 } },
      vertexShader: `attribute float size;uniform float uPR,uOp;varying float vA;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vA=uOp;
        gl_PointSize=size*uPR*(60.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;
        float a=exp(-d*d*12.0);gl_FragColor=vec4(0.2,0.8,1.0,a*vA);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pPts = new THREE.Points(pGeo, pMat);
    pPts.visible = delay <= 0;
    this.ag.add(pPts);

    // Spark burst — 1 bright core + 5 scattered sparks
    const sparkN = 6;
    const sparkPos = new Float32Array(sparkN * 3);
    const sparkVel = new Float32Array(sparkN * 3);
    const sparkSz = new Float32Array(sparkN);
    // Place all at origin initially, will be set on arrival
    const toNorm = to.clone().normalize();
    // Build a tangent basis on the globe surface at landing point
    const tangentU = new THREE.Vector3(0, 1, 0).cross(toNorm).normalize();
    if (tangentU.length() < 0.1) tangentU.set(1, 0, 0).cross(toNorm).normalize();
    const tangentV = toNorm.clone().cross(tangentU).normalize();
    sparkSz[0] = 1.2; // core spark (bigger)
    for (let i = 1; i < sparkN; i++) {
      sparkSz[i] = 0.3 + Math.random() * 0.5;
      // Random velocity along globe surface tangent
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.5;
      sparkVel[i * 3] = (tangentU.x * Math.cos(angle) + tangentV.x * Math.sin(angle)) * speed;
      sparkVel[i * 3 + 1] = (tangentU.y * Math.cos(angle) + tangentV.y * Math.sin(angle)) * speed;
      sparkVel[i * 3 + 2] = (tangentU.z * Math.cos(angle) + tangentV.z * Math.sin(angle)) * speed;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute('size', new THREE.BufferAttribute(sparkSz, 1));
    const sparkMat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: Math.min(devicePixelRatio, 2) }, uOp: { value: 0 } },
      vertexShader: `attribute float size;uniform float uPR,uOp;varying float vA;varying float vSz;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vA=uOp;vSz=size;
        gl_PointSize=size*uPR*(40.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying float vA;varying float vSz;
        void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;
        float core=exp(-d*d*18.0);
        // Brighter center for the core spark
        float bright=vSz>1.0?1.5:1.0;
        vec3 col=mix(vec3(0.1,0.6,0.9),vec3(0.5,0.95,1.0),core)*bright;
        gl_FragColor=vec4(col,core*vA);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const spark = new THREE.Points(sparkGeo, sparkMat);
    spark.visible = false;
    this.ag.add(spark);

    const initState = delay > 0 ? 'waiting' : 'growing';
    this.arcs.push({
      line, geo, mat, pPts, pGeo, pMat, pPos, pPh, pN,
      spark, sparkGeo, sparkMat, sparkPos, sparkVel, sparkOrigin: to.clone(),
      curve, state: initState, holdT: 0, draw: 0, pTime: 0, delay
    });
  }

  private _updateArcs(dt: number) {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      if (a.state === 'waiting') {
        a.delay -= dt;
        if (a.delay <= 0) { a.state = 'growing'; a.line.visible = true; a.pPts.visible = true; }
        continue;
      }
      if (a.state === 'growing') {
        a.draw = Math.min(a.draw + dt * 0.7, 1);
        a.mat.uniforms.uD.value = a.draw;
        a.pTime += dt * 0.1;
        for (let j = 0; j < a.pN; j++) {
          const t = ((a.pPh[j] + a.pTime) % 1) * a.draw;
          const pt = a.curve.getPoint(Math.min(t, 0.999));
          a.pPos[j * 3] = pt.x; a.pPos[j * 3 + 1] = pt.y; a.pPos[j * 3 + 2] = pt.z;
        }
        a.pGeo.attributes.position.needsUpdate = true;
        a.pMat.uniforms.uOp.value = a.draw * 0.4;
        if (a.draw >= 1) {
          a.state = 'hold'; a.holdT = 0;
          // Initialize spark positions at landing point
          a.spark.visible = true;
          for (let s = 0; s < 6; s++) {
            a.sparkPos[s * 3] = a.sparkOrigin.x;
            a.sparkPos[s * 3 + 1] = a.sparkOrigin.y;
            a.sparkPos[s * 3 + 2] = a.sparkOrigin.z;
          }
          a.sparkGeo.attributes.position.needsUpdate = true;
          a.sparkMat.uniforms.uOp.value = 0.6;
        }
      } else if (a.state === 'hold') {
        a.holdT += dt;
        // Animate sparks outward from landing point
        for (let s = 1; s < 6; s++) {
          a.sparkPos[s * 3] += a.sparkVel[s * 3] * dt;
          a.sparkPos[s * 3 + 1] += a.sparkVel[s * 3 + 1] * dt;
          a.sparkPos[s * 3 + 2] += a.sparkVel[s * 3 + 2] * dt;
        }
        a.sparkGeo.attributes.position.needsUpdate = true;
        // Fade sparks: quick flash then fade
        const sparkLife = Math.max(0, 1 - a.holdT / 0.6);
        a.sparkMat.uniforms.uOp.value = sparkLife * 0.5;
        // Also fade the trail particles
        a.pMat.uniforms.uOp.value = sparkLife * 0.3;
        if (a.holdT > 0.7) a.state = 'fading';
      } else {
        const fade = dt * 2.5;
        a.mat.uniforms.uOp.value -= fade; a.pMat.uniforms.uOp.value -= fade; a.sparkMat.uniforms.uOp.value -= fade;
        if (a.mat.uniforms.uOp.value <= 0) {
          this.ag.remove(a.line); this.ag.remove(a.pPts); this.ag.remove(a.spark);
          a.geo.dispose(); a.mat.dispose();
          a.pGeo.dispose(); a.pMat.dispose();
          a.sparkGeo.dispose(); a.sparkMat.dispose();
          this.arcs.splice(i, 1);
        }
      }
    }
  }

  /* ═══════════════ EVENTS ═══════════════════════════════ */

  private _setupEvents() {
    window.addEventListener('mousemove', this._boundMouseMove);
    window.addEventListener('mousedown', this._boundMouseDown);
    window.addEventListener('mouseup', this._boundMouseUp);
    window.addEventListener('mouseleave', this._boundMouseLeave);
    window.addEventListener('resize', this._boundResize);
    document.addEventListener('visibilitychange', this._boundVisChange);
    this.ren.domElement.addEventListener('contextmenu', this._boundContextMenu);
    this.ren.domElement.addEventListener('wheel', this._boundWheel, { passive: false });
    this.ren.domElement.addEventListener('click', this._boundClick);
    this.ren.domElement.addEventListener('touchstart', this._boundTouchStart, { passive: true });
    this.ren.domElement.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    this.ren.domElement.addEventListener('touchend', this._boundTouchEnd, { passive: true });
  }

  private _resize() {
    const w = innerWidth, h = innerHeight;
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.ren.setSize(w, h); if (this.useC) this.comp.setSize(w, h);
  }

  /* ═══════════════ CORE LOOP ═══════════════════════════ */

  private _frame() {
    if (this._disposed) return;
    this._frameId = requestAnimationFrame(this._boundFrame);
    if (!this.vis) return;
    const dt = Math.min(this.clk.getDelta(), 0.05);
    this.t += dt;

    if (this.starM) (this.starM.material as THREE.ShaderMaterial).uniforms.uT.value = this.t;
    if (this.neb) (this.neb.material as THREE.ShaderMaterial).uniforms.uT.value = this.t;
    if (this.body) (this.body.material as THREE.ShaderMaterial).uniforms.uT.value = this.t;
    if (this.scanDots) (this.scanDots.material as THREE.ShaderMaterial).uniforms.uT.value = this.t;
    if (this.orb) for (const r of this.orb) {
      r.rotation.y += (r as any)._sp * dt;
      (r.material as THREE.ShaderMaterial).uniforms.uT.value = this.t;
    }
    if (this.orbT) this.orbT.rotation.y += 0.1 * dt;

    // Update flight positions (extrapolate along heading every frame)
    if (this._flightLayer) this._flightLayer.update(dt);

    // Check for selected flight — lock globe rotation + zoom
    const selFlight = this._selectedFlight;
    const livePos = selFlight
      ? this._flightLayer?.getLiveFlight(selFlight.id) ?? null
      : null;

    // --- Globe rotation ---
    // Tracking uses quaternion slerp (no Euler coupling / clamp issues).
    // Everything else uses the existing Euler angle system.
    let useQuaternion = false;

    if (selFlight && livePos && !this._dragging) {
      // Detect flight switch — use fast slerp for the first ~0.6s
      if (selFlight.id !== this._prevTrackedId) {
        this._prevTrackedId = selFlight.id;
        this._trackTransition = 0;
      }
      this._trackTransition += dt;

      // Flight's 3D position in globe-local space
      const [px, py, pz] = latLngToVector3(livePos.lat, livePos.lng, this.R);

      // Quaternion that rotates the flight point onto the +Z axis.
      // setFromUnitVectors(from, to) gives Q where Q * from = to.
      // After Q, the point sits at (0, 0, R) — directly facing the camera.
      this._pVec.set(px, py, pz).normalize();
      this._qCenter.setFromUnitVectors(this._pVec, new THREE.Vector3(0, 0, 1));

      // Apply the cosmetic z-tilt (-0.18 rad) on top.
      // Rotating around Z doesn't move a point on the Z axis, so
      // centering stays perfect while the globe keeps its tilted look.
      this._qTarget.multiplyQuaternions(this._qTilt, this._qCenter);

      // Smooth slerp — fast (8x) during first 0.6s, then normal (3x)
      const speed = this._trackTransition < 0.6 ? 8 : 3;
      const t = 1 - Math.exp(-speed * dt);
      this.g.quaternion.slerp(this._qTarget, t);

      // Kill inertia & parallax
      this._dragVelX = 0;
      this._dragVelY = 0;
      this.ms.x = 0;
      this.ms.y = 0;

      this._targetCamZ = this._userZoom;
      useQuaternion = true;
    } else if (selFlight && !livePos) {
      // Flight selected but position not available yet — hold current orientation
      // without falling through to Euler angles (which would snap to stale values)
      useQuaternion = true;
      this._targetCamZ = this._userZoom;
    } else if (!this._dragging) {
      // Auto-rotate (skip when paused)
      if (!this._paused) this._userRotY += (Math.PI * 2 / 100) * dt;
      // Decay inertia from drag release
      this._userRotY += this._dragVelX;
      this._userRotX += this._dragVelY;
      this._userRotX = Math.max(-1.5, Math.min(1.5, this._userRotX));
      this._dragVelX *= 0.95;
      this._dragVelY *= 0.95;
      if (Math.abs(this._dragVelX) < 0.0001) this._dragVelX = 0;
      if (Math.abs(this._dragVelY) < 0.0001) this._dragVelY = 0;

      this._targetCamZ = this._userZoom;
    }

    // When NOT tracking via quaternion, apply Euler angles as before
    if (!useQuaternion) {
      this.g.rotation.x = 0.12 + this._userRotX;
      this.g.rotation.y = this._userRotY;
      this.g.rotation.z = -0.18;
    }

    // Smooth camera zoom
    this._camZ += (this._targetCamZ - this._camZ) * 3 * dt;

    // Camera parallax (disabled when tracking a flight)
    if (!selFlight) {
      if (!this._dragging) {
        this.ms.x += (this.mouse.x - this.ms.x) * dt * 2.5;
        this.ms.y += (this.mouse.y - this.ms.y) * dt * 2.5;
      } else {
        this.ms.x *= 0.95;
        this.ms.y *= 0.95;
      }
    }

    // Camera position — when tracking, sits at exactly (0, 0, Z)
    // so the quaternion centering is pixel-perfect at any zoom.
    this.cam.position.x = this.ms.x * 0.6;
    const camYBase = selFlight ? 0 : 2;
    this.cam.position.y = camYBase - this.ms.y * 0.35;
    this.cam.position.z = this._camZ;
    this.cam.lookAt(0, 0, 0);

    // Country highlight glow disabled — arcs restored
    // this._updateHL(dt);
    this._updateArcs(dt);

    if (this._ambientArcTimer !== undefined) {
      this._ambientArcTimer += dt;
      if (this._ambientArcTimer > 0.4) {
        this._ambientArcTimer = 0;
        this._spawnAmbientArc();
      }
    }

    if (this.useC) this.comp.render();
    else this.ren.render(this.scene, this.cam);

    // Render country outlines AFTER bloom — flat lines, no glow.
    if (this._outlScene) {
      this._outlGroup.rotation.copy(this.g.rotation);
      this._outlGroup.position.copy(this.g.position);
      this._outlGroup.scale.copy(this.g.scale);
      this.ren.autoClear = false;
      this.ren.render(this._outlScene, this.cam);
    }

    // Render flights AFTER bloom — normal colors, no glow.
    // The flight scene has its own depth-only globe sphere for back-face occlusion.
    if (this._flightLayer) {
      this._flightLayer.syncTransform(this.g);
      // Keep the bloomed color buffer, clear only depth so the flight scene's
      // depth-only sphere can write fresh occlusion data.
      this.ren.autoClear = false;
      this.ren.clearDepth();
      this.ren.render(this._flightLayer.scene, this.cam);
      this.ren.autoClear = true;
    }
  }

  setFlights(flights: FlightData[]) {
    this._flightLayer?.setFlights(flights);
  }

  setOnFlightClick(cb: ((id: string | null) => void) | null) {
    this._onFlightClick = cb;
  }

  setOnReady(cb: (() => void) | null) {
    this._onReady = cb;
    if (cb && this.rdy) cb();
  }

  /** Select a flight — always highlights + centers camera on it */
  setSelectedFlight(f: FlightData | null) {
    const wasTracking = this._selectedFlight !== null;
    this._selectedFlight = f;
    if (!f) {
      this._prevTrackedId = null;

      // Capture current globe orientation so it doesn't jump.
      // The globe is positioned by quaternion slerp during tracking.
      // We need to extract Euler angles that reproduce the same visual
      // orientation when applied as rotation.x = 0.12 + _userRotX,
      // rotation.y = _userRotY, rotation.z = -0.18.
      if (wasTracking) {
        // Read the Euler decomposition from the current quaternion
        // using the same order Three.js uses internally (XYZ).
        const euler = new THREE.Euler().setFromQuaternion(this.g.quaternion, 'XYZ');
        this._userRotY = euler.y;
        this._userRotX = euler.x - 0.12;
        // Kill any inertia so the globe stays perfectly still
        this._dragVelX = 0;
        this._dragVelY = 0;
      }

      // Restore zoom when deselecting
      if (this._trackingZoom) {
        this._userZoom = this._preTrackZoom;
        this._trackingZoom = false;
      }
    }
    this._flightLayer?.setSelectedId(f?.id ?? null);
  }

  /** Zoom the camera in close to the current tracked flight */
  zoomIn() {
    if (!this._trackingZoom) {
      this._preTrackZoom = this._userZoom;
      this._trackingZoom = true;
    }
    this._userZoom = Math.min(this._userZoom, 9);
  }

  /** Step zoom in (negative) or out (positive) by a fixed amount */
  stepZoom(delta: number) {
    this._userZoom = Math.max(6.5, Math.min(30, this._userZoom + delta));
  }

  togglePause() { this._paused = !this._paused; }
  get paused() { return this._paused; }

  dispose() {
    this._disposed = true;
    this._flightLayer?.dispose();
    this._flightLayer = null;
    cancelAnimationFrame(this._frameId);
    window.removeEventListener('mousemove', this._boundMouseMove);
    window.removeEventListener('mousedown', this._boundMouseDown);
    window.removeEventListener('mouseup', this._boundMouseUp);
    window.removeEventListener('mouseleave', this._boundMouseLeave);
    window.removeEventListener('resize', this._boundResize);
    document.removeEventListener('visibilitychange', this._boundVisChange);
    this.ren.domElement.removeEventListener('contextmenu', this._boundContextMenu);
    this.ren.domElement.removeEventListener('wheel', this._boundWheel);
    this.ren.domElement.removeEventListener('click', this._boundClick);
    this.ren.domElement.removeEventListener('touchstart', this._boundTouchStart);
    this.ren.domElement.removeEventListener('touchmove', this._boundTouchMove);
    this.ren.domElement.removeEventListener('touchend', this._boundTouchEnd);
    this.ren.dispose();
    this.scene.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose());
        else o.material.dispose();
      }
    });
    if (this.el.contains(this.ren.domElement)) {
      this.el.removeChild(this.ren.domElement);
    }
  }
}
