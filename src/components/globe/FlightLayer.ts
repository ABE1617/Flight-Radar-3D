import * as THREE from 'three';
import { latLngToVector3 } from '@/data/countries';
import type { FlightData } from '@/types/flights';

const MAX_INSTANCES = 6000;

interface LiveFlight {
  id: string;
  lat: number;
  lng: number;
  alt: number;
  vel: number;
  hdg: number;
  vr: number;
  cs: string;
  origin: string;
  squawk: string;
  cat: number;
  lastContact: number;
  baroAlt: number;
  spi: boolean;
}

export class FlightLayer {
  private R: number;

  // Own scene — rendered after bloom so no glow
  readonly scene: THREE.Scene;
  readonly group: THREE.Group;

  // Depth-only globe sphere — occludes back-side flights without drawing color
  private depthSphere: THREE.Mesh;

  private mesh: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture;

  private selMesh: THREE.Mesh;
  private selMat: THREE.MeshBasicMaterial;
  private selTex: THREE.CanvasTexture;

  // Stem lines from globe surface to each flight icon
  private stemGeo: THREE.BufferGeometry;
  private stemMat: THREE.LineBasicMaterial;
  private stems: THREE.LineSegments;

  private live: LiveFlight[] = [];
  private selectedId: string | null = null;
  private color = new THREE.Color();

  private _pos = new THREE.Vector3();
  private _surfacePos = new THREE.Vector3();
  private _normal = new THREE.Vector3();
  private _north = new THREE.Vector3();
  private _east = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _northRef = new THREE.Vector3();
  private _basis = new THREE.Matrix4();

  constructor(R: number) {
    this.R = R;

    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Invisible sphere that only writes depth — hides back-side flights
    this.depthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.996, 48, 48),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
    );
    this.group.add(this.depthSphere);

    // Normal flights: bright white
    this.tex = this._createTexture('#ffffff');
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      alphaTest: 0.1,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_INSTANCES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // Selected flight: bright yellow
    this.selTex = this._createTexture('#ffcc00');
    this.selMat = new THREE.MeshBasicMaterial({
      map: this.selTex,
      transparent: true,
      alphaTest: 0.1,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.selMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.selMat);
    this.selMesh.visible = false;
    this.selMesh.renderOrder = 1;
    this.group.add(this.selMesh);

    // Stem lines — 2 vertices per flight (surface point → icon point)
    this.stemGeo = new THREE.BufferGeometry();
    const stemPositions = new Float32Array(MAX_INSTANCES * 2 * 3);
    this.stemGeo.setAttribute('position', new THREE.BufferAttribute(stemPositions, 3));
    this.stemGeo.setDrawRange(0, 0);
    this.stemMat = new THREE.LineBasicMaterial({
      color: 0x22cccc,
      transparent: true,
      opacity: 0.15,
      depthTest: true,
      depthWrite: false,
    });
    this.stems = new THREE.LineSegments(this.stemGeo, this.stemMat);
    this.stems.frustumCulled = false;
    this.group.add(this.stems);
  }

  setFlights(flights: FlightData[]) {
    const oldMap = new Map<string, LiveFlight>();
    for (const f of this.live) oldMap.set(f.id, f);

    this.live = flights.map((f) => {
      const old = oldMap.get(f.id);
      if (old) {
        old.hdg = f.hdg;
        old.vel = f.vel;
        old.vr = f.vr;
        old.alt = f.alt;
        old.cs = f.cs;
        old.origin = f.origin;
        old.squawk = f.squawk;
        old.cat = f.cat;
        old.lastContact = f.lastContact;
        old.baroAlt = f.baroAlt;
        old.spi = f.spi;
        old.lat += (f.lat - old.lat) * 0.3;
        old.lng += (f.lng - old.lng) * 0.3;
        return old;
      }
      return {
        id: f.id, lat: f.lat, lng: f.lng, alt: f.alt, vel: f.vel,
        hdg: f.hdg, vr: f.vr, cs: f.cs, origin: f.origin, squawk: f.squawk,
        cat: f.cat, lastContact: f.lastContact, baroAlt: f.baroAlt, spi: f.spi,
      };
    });
  }

  setSelectedId(id: string | null) {
    this.selectedId = id;
  }

  update(dt: number) {
    if (this.live.length === 0) return;

    for (const f of this.live) {
      const hdgRad = f.hdg * (Math.PI / 180);
      const cosLat = Math.cos(f.lat * (Math.PI / 180));
      const velMs = f.vel * 0.5144;
      const dLat = velMs * Math.cos(hdgRad) * dt / 111320;
      const dLng = cosLat > 0.001
        ? velMs * Math.sin(hdgRad) * dt / (111320 * cosLat)
        : 0;

      f.lat += dLat;
      f.lng += dLng;
      if (f.lng > 180) f.lng -= 360;
      if (f.lng < -180) f.lng += 360;
    }

    this._rebuildInstances();
  }

  syncTransform(globeGroup: THREE.Group) {
    this.group.rotation.copy(globeGroup.rotation);
    this.group.position.copy(globeGroup.position);
    this.group.scale.copy(globeGroup.scale);
  }

  private _rebuildInstances() {
    const count = Math.min(this.live.length, MAX_INSTANCES);
    this.mesh.count = count;

    const stemPos = this.stemGeo.attributes.position as THREE.BufferAttribute;
    let foundSelected = false;

    for (let i = 0; i < count; i++) {
      const f = this.live[i];
      const isSel = f.id === this.selectedId;

      this._computeBasis(f.lat, f.lng, f.hdg, f.alt, 0.12);
      this.mesh.setMatrixAt(i, this._basis);

      // Stem: surface → icon position
      const si = i * 6;
      stemPos.array[si]     = this._surfacePos.x;
      stemPos.array[si + 1] = this._surfacePos.y;
      stemPos.array[si + 2] = this._surfacePos.z;
      stemPos.array[si + 3] = this._pos.x;
      stemPos.array[si + 4] = this._pos.y;
      stemPos.array[si + 5] = this._pos.z;

      this.color.setRGB(1, 1, 1);
      this.mesh.setColorAt(i, this.color);

      if (isSel) {
        foundSelected = true;
        this._computeBasis(f.lat, f.lng, f.hdg, f.alt, 0.3);
        this.selMesh.matrix.copy(this._basis);
        this.selMesh.matrixAutoUpdate = false;
        this.selMesh.visible = true;
      }
    }

    if (!foundSelected) {
      this.selMesh.visible = false;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }

    stemPos.needsUpdate = true;
    this.stemGeo.setDrawRange(0, count * 2);
  }

  /**
   * Altitude-to-elevation: maps flight altitude to a visual offset above the globe.
   * ~0m → sits on surface (R * 1.005), ~13700m (FL450) → R * 1.06
   */
  private _altToRadius(altMeters: number): number {
    const t = Math.min(Math.max(altMeters, 0) / 13700, 1);
    return this.R * (1.005 + t * 0.055);
  }

  private _computeBasis(lat: number, lng: number, hdg: number, alt: number, scale: number) {
    const elevR = this._altToRadius(alt);
    const [px, py, pz] = latLngToVector3(lat, lng, elevR);
    this._pos.set(px, py, pz);

    // Surface anchor for stem line
    const [sx, sy, sz] = latLngToVector3(lat, lng, this.R * 1.002);
    this._surfacePos.set(sx, sy, sz);

    this._normal.copy(this._pos).normalize();

    const [nx, ny, nz] = latLngToVector3(lat + 0.1, lng, this.R);
    this._northRef.set(nx, ny, nz);
    this._north.subVectors(this._northRef, this._pos).normalize();
    this._north.addScaledVector(this._normal, -this._normal.dot(this._north)).normalize();

    this._east.crossVectors(this._north, this._normal).normalize();

    const hdgRad = hdg * (Math.PI / 180);
    const cosH = Math.cos(hdgRad);
    const sinH = Math.sin(hdgRad);
    this._forward.copy(this._north).multiplyScalar(cosH).addScaledVector(this._east, sinH);
    this._right.copy(this._east).multiplyScalar(cosH).addScaledVector(this._north, -sinH);

    this._basis.makeBasis(this._right, this._forward, this._normal);
    this._basis.scale(new THREE.Vector3(scale, scale, scale));
    this._basis.setPosition(this._pos);
  }

  /** Find the nearest flight to a lat/lng within maxDeg degrees */
  findNearest(lat: number, lng: number, maxDeg: number): string | null {
    let bestId: string | null = null;
    let bestDist = maxDeg * maxDeg;

    for (const f of this.live) {
      let dLng = f.lng - lng;
      if (dLng > 180) dLng -= 360;
      if (dLng < -180) dLng += 360;
      const dLat = f.lat - lat;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = f.id;
      }
    }
    return bestId;
  }

  getLiveFlight(id: string): { lat: number; lng: number } | null {
    const f = this.live.find((l) => l.id === id);
    return f ? { lat: f.lat, lng: f.lng } : null;
  }

  private _createTexture(fillColor: string): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);

    const s = 1.8;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(0, -22 * s);
    ctx.lineTo(3 * s, -10 * s);
    ctx.lineTo(17 * s, 2 * s);
    ctx.lineTo(17 * s, 5 * s);
    ctx.lineTo(3 * s, 1 * s);
    ctx.lineTo(3 * s, 14 * s);
    ctx.lineTo(10 * s, 19 * s);
    ctx.lineTo(10 * s, 21 * s);
    ctx.lineTo(0, 17 * s);
    ctx.lineTo(-10 * s, 21 * s);
    ctx.lineTo(-10 * s, 19 * s);
    ctx.lineTo(-3 * s, 14 * s);
    ctx.lineTo(-3 * s, 1 * s);
    ctx.lineTo(-17 * s, 5 * s);
    ctx.lineTo(-17 * s, 2 * s);
    ctx.lineTo(-3 * s, -10 * s);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();

    this.selMesh.removeFromParent();
    this.selMesh.geometry.dispose();
    this.selMat.dispose();
    this.selTex.dispose();

    this.stems.removeFromParent();
    this.stemGeo.dispose();
    this.stemMat.dispose();

    this.depthSphere.removeFromParent();
    this.depthSphere.geometry.dispose();
    (this.depthSphere.material as THREE.Material).dispose();
  }
}
