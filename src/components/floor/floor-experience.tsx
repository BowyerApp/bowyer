"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AnimationAction, AnimationClip, Group, Sprite } from "three";
import { resolveMixamoBones, retargetMixamoClip } from "@/components/floor/floor-rig";
import { formatUsd } from "@/lib/utils";

export interface FloorStation {
  slug: string;
  name: string;
  tagline: string;
  glbUrl: string;
  foundedBy?: string | null;
}

interface StrollPoint {
  x: number;
  z: number;
  /** Waypoints mid-stroll get a thinking pause; gates and home don't. */
  pause?: boolean;
}

/** Per-robot animation + wander state, driven inside the render loop. */
interface RobotRig {
  model: Group;
  plate: Sprite;
  idleAction: AnimationAction | null;
  walkAction: AnimationAction | null;
  homeX: number;
  homeZ: number;
  baseYaw: number;
  groundY: number;
  mode: "desk" | "walk" | "pause" | "greet";
  waypoints: StrollPoint[];
  nextAt: number;
  /** After a greet times out, ignore the player briefly so it can walk off. */
  greetMuteUntil: number;
  movingAnim: boolean;
}

interface DeskQuote {
  symbol: string;
  dexPriceUsd: number | null;
  premiumDiscountPct: number | null;
}

interface LeaderRow {
  rank: number;
  name: string;
  revenueUsd: number;
}

/**
 * THE TRADING FLOOR — a walkable 3D room where all nine robots work.
 * Custom three.js scene (the three.ws embed has no first-person mode):
 * WASD + mouse-look, real rigged GLBs, live desk + revenue panels.
 */
export function FloorExperience({ stations }: { stations: FloorStation[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [nearest, setNearest] = useState<FloorStation | null>(null);
  const [focused, setFocused] = useState<FloorStation | null>(null);
  const [quotes, setQuotes] = useState<DeskQuote[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [webglFailed, setWebglFailed] = useState(false);
  const [fallbackLook, setFallbackLook] = useState(false);
  const nearestRef = useRef<FloorStation | null>(null);
  const lockRef = useRef<(() => void) | null>(null);
  // Latest quotes/leaders, readable from inside the three.js loop (wall
  // ticker + market screens re-render from these without React).
  const quotesRef = useRef<DeskQuote[]>([]);
  const leadersRef = useRef<LeaderRow[]>([]);
  // Pointer lock can be denied (webviews, iOS, rapid relock) — these refs
  // drive the drag-look fallback so the floor never dead-ends on the overlay.
  const fallbackRef = useRef(false);
  const enteredRef = useRef(false);

  // Live panels: desk quotes + revenue leaderboard, refreshed on an interval.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/desk/quotes")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const rows = (data.quotes ?? data ?? []) as DeskQuote[];
          if (Array.isArray(rows)) {
            setQuotes(rows.slice(0, 8));
            quotesRef.current = rows.slice(0, 10);
          }
        })
        .catch(() => {});
      fetch("/api/leaderboard")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const rows = ((data.entries ?? []) as LeaderRow[]).slice(0, 6);
          setLeaders(rows.slice(0, 5));
          leadersRef.current = rows;
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { PointerLockControls } = await import(
        "three/examples/jsm/controls/PointerLockControls.js"
      );
      const { EffectComposer } = await import(
        "three/examples/jsm/postprocessing/EffectComposer.js"
      );
      const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import(
        "three/examples/jsm/postprocessing/UnrealBloomPass.js"
      );
      const { RoomEnvironment } = await import(
        "three/examples/jsm/environments/RoomEnvironment.js"
      );
      const { RGBELoader } = await import("three/examples/jsm/loaders/RGBELoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      } catch {
        setWebglFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020202);
      scene.fog = new THREE.Fog(0x020202, 22, 58);

      // Image-based lighting so metals and glossy surfaces actually reflect.
      // RoomEnvironment fills the first frames; the real warehouse HDRI
      // (Poly Haven, CC0) swaps in as soon as it streams.
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.35;
      new RGBELoader().load("/hdri/warehouse_2k.hdr", (hdr) => {
        if (disposed) return;
        const env = pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        scene.environment = env.texture;
        scene.environmentIntensity = 0.5;
        pmrem.dispose();
      });

      const camera = new THREE.PerspectiveCamera(
        70,
        mount.clientWidth / mount.clientHeight,
        0.1,
        140
      );
      camera.position.set(0, 1.65, 11);

      // Bloom makes every emissive surface (rings, ticker, monitors, holo)
      // read as light instead of flat texture.
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(mount.clientWidth, mount.clientHeight),
        0.32,
        0.4,
        0.85
      );
      composer.addPass(bloom);

      /* ---- room ---- */
      const accent = new THREE.Color(0xb8ff2e);
      const ROOM_RADIUS = 26;

      // Polished dark concrete (Poly Haven PBR set, tinted near-black).
      const texLoader = new THREE.TextureLoader();
      const setupTile = (t: InstanceType<typeof THREE.Texture>, srgb = false) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(7, 7);
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x2e2e30,
        map: setupTile(texLoader.load("/textures/floor/concrete_diff.jpg"), true),
        normalMap: setupTile(texLoader.load("/textures/floor/concrete_nor.jpg")),
        roughnessMap: setupTile(texLoader.load("/textures/floor/concrete_rough.jpg")),
        roughness: 0.55,
        metalness: 0.35,
        envMapIntensity: 0.9,
      });
      const floor = new THREE.Mesh(new THREE.CircleGeometry(ROOM_RADIUS + 2, 72), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      // Curved wall enclosing the floor.
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(ROOM_RADIUS, ROOM_RADIUS, 11, 72, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0x050505,
          roughness: 0.85,
          metalness: 0.3,
          side: THREE.BackSide,
        })
      );
      wall.position.y = 5.5;
      scene.add(wall);

      // Vertical wall ribs give the shell architectural rhythm.
      const ribMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a0b,
        roughness: 0.6,
        metalness: 0.7,
      });
      for (let ri = 0; ri < 24; ri++) {
        const theta = (ri / 24) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 11, 0.3), ribMat);
        rib.position.set(Math.sin(theta) * (ROOM_RADIUS - 0.2), 5.5, Math.cos(theta) * (ROOM_RADIUS - 0.2));
        rib.lookAt(0, 5.5, 0);
        scene.add(rib);
      }

      // Industrial ceiling: dark shell, truss ring, suspended light bars.
      const ceiling = new THREE.Mesh(
        new THREE.CircleGeometry(ROOM_RADIUS + 2, 72),
        new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1 })
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = 11;
      scene.add(ceiling);

      const truss = new THREE.Mesh(
        new THREE.TorusGeometry(15.5, 0.16, 8, 80),
        new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.5, metalness: 0.85 })
      );
      truss.rotation.x = Math.PI / 2;
      truss.position.y = 9.6;
      scene.add(truss);

      const barMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xf2f6e8,
        emissiveIntensity: 2.6,
        roughness: 0.4,
      });
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.8 });
      for (let bi = 0; bi < 10; bi++) {
        const theta = (bi / 10) * Math.PI * 2;
        const bx = Math.sin(theta) * 13;
        const bz = Math.cos(theta) * 13;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.14), barMat);
        bar.position.set(bx, 8.5, bz);
        // Tangent to the circle so the ring of light reads intentionally.
        bar.rotation.y = theta;
        scene.add(bar);
        for (const side of [-1, 1]) {
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.5, 6), cableMat);
          cable.position.set(
            bx + Math.cos(theta) * side * 1.05,
            9.75,
            bz - Math.sin(theta) * side * 1.05
          );
          scene.add(cable);
        }
      }

      /* ---- wall tickers: live stock tape + brand band ---- */
      const makeBand = (
        radius: number,
        y: number,
        height: number,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
      ) => {
        const canvas = document.createElement("canvas");
        canvas.width = 4096;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) draw(ctx, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, height, 96, 1, true),
          new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            transparent: true,
          })
        );
        band.position.y = y;
        // BackSide flips horizontally — mirror the texture back to readable.
        texture.repeat.x = -1;
        texture.offset.x = 1;
        scene.add(band);
        return { canvas, ctx, texture };
      };

      const drawQuoteTape = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "rgba(3,4,2,0.92)";
        ctx.fillRect(0, 0, w, h);
        ctx.font = "600 54px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textBaseline = "middle";
        const rows = quotesRef.current;
        const parts =
          rows.length > 0
            ? rows.map((q) => ({
                sym: q.symbol,
                px: q.dexPriceUsd != null ? `$${q.dexPriceUsd.toFixed(2)}` : "—",
                pct:
                  q.premiumDiscountPct != null
                    ? `${q.premiumDiscountPct >= 0 ? "▲" : "▼"} ${Math.abs(
                        q.premiumDiscountPct
                      ).toFixed(1)}%`
                    : "",
                up: (q.premiumDiscountPct ?? 0) >= 0,
              }))
            : [{ sym: "BOWYER", px: "TRADING FLOOR", pct: "LIVE", up: true }];
        // Draw the sequence twice at half-width offsets so the loop is seamless.
        for (const startX of [0, w / 2]) {
          let x = startX + 40;
          for (const p of parts) {
            if (x > startX + w / 2 - 60) break;
            ctx.fillStyle = "#e8e8ea";
            ctx.fillText(p.sym, x, h / 2);
            x += ctx.measureText(p.sym).width + 22;
            ctx.fillStyle = "#8a8a90";
            ctx.fillText(p.px, x, h / 2);
            x += ctx.measureText(p.px).width + 22;
            ctx.fillStyle = p.up ? "#b8ff2e" : "#ff5c5c";
            ctx.fillText(p.pct, x, h / 2);
            x += ctx.measureText(p.pct).width + 26;
            ctx.fillStyle = "#3a3a3e";
            ctx.fillText("·", x, h / 2);
            x += 40;
          }
        }
      };

      const tape = makeBand(ROOM_RADIUS - 0.15, 3.4, 1.05, drawQuoteTape);
      makeBand(ROOM_RADIUS - 0.15, 8.9, 0.9, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.font = "700 58px -apple-system, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        const phrase = "BOWYER · THE TRADING FLOOR · AUTONOMOUS BUSINESSES · ROBINHOOD CHAIN · ";
        for (const startX of [0, w / 2]) {
          let x = startX + 20;
          while (x < startX + w / 2 - 40) {
            for (const word of phrase.split(" ")) {
              ctx.fillStyle = word === "·" ? "rgba(184,255,46,0.55)" : "rgba(184,255,46,0.32)";
              ctx.fillText(word, x, h / 2);
              x += ctx.measureText(word).width + 24;
              if (x > startX + w / 2 - 40) break;
            }
          }
        }
      });

      /* ---- market wall: big curved screens, like a real floor ---- */
      const makeCurvedScreen = (opts: {
        width: number;
        height: number;
        y: number;
        thetaCenter: number;
        span: number;
        canvasW: number;
        canvasH: number;
      }) => {
        const canvas = document.createElement("canvas");
        canvas.width = opts.canvasW;
        canvas.height = opts.canvasH;
        const ctx = canvas.getContext("2d");
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        texture.offset.x = 1;
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(
            ROOM_RADIUS - 1.2,
            ROOM_RADIUS - 1.2,
            opts.height,
            48,
            1,
            true,
            opts.thetaCenter - opts.span / 2,
            opts.span
          ),
          new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false })
        );
        mesh.position.y = opts.y;
        scene.add(mesh);
        // Slim bezel above and below so it reads as hardware, not wallpaper.
        for (const dy of [-1, 1]) {
          const bezel = new THREE.Mesh(
            new THREE.CylinderGeometry(
              ROOM_RADIUS - 1.15,
              ROOM_RADIUS - 1.15,
              0.09,
              48,
              1,
              true,
              opts.thetaCenter - opts.span / 2,
              opts.span
            ),
            new THREE.MeshStandardMaterial({
              color: 0x0c0c0d,
              roughness: 0.4,
              metalness: 0.8,
              side: THREE.DoubleSide,
            })
          );
          bezel.position.y = opts.y + (dy * (opts.height + 0.09)) / 2;
          scene.add(bezel);
        }
        return { canvas, ctx, texture };
      };

      // Random-walk candles seeded once; each step appends a fresh bar.
      const candles: { o: number; h: number; l: number; c: number }[] = [];
      let px = 100 + Math.random() * 40;
      const pushCandle = () => {
        const o = px;
        const drift = (Math.random() - 0.47) * 2.4;
        const c = Math.max(30, o + drift);
        const h = Math.max(o, c) + Math.random() * 1.1;
        const l = Math.min(o, c) - Math.random() * 1.1;
        candles.push({ o, h, l, c });
        if (candles.length > 46) candles.shift();
        px = c;
      };
      for (let ci = 0; ci < 46; ci++) pushCandle();

      const drawMarketScreen = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#020402";
        ctx.fillRect(0, 0, w, h);
        // Header.
        ctx.fillStyle = "#b8ff2e";
        ctx.font = "700 46px ui-monospace, Menlo, monospace";
        ctx.fillText("BOWYER COMPOSITE", 56, 76);
        ctx.fillStyle = "#3d4d21";
        ctx.font = "500 30px ui-monospace, Menlo, monospace";
        ctx.fillText("AUTONOMOUS BUSINESS INDEX · ROBINHOOD CHAIN", 56, 122);
        const last = candles[candles.length - 1];
        const first = candles[0];
        const chg = ((last.c - first.o) / first.o) * 100;
        ctx.textAlign = "right";
        ctx.fillStyle = "#e8e8ea";
        ctx.font = "700 64px ui-monospace, Menlo, monospace";
        ctx.fillText(last.c.toFixed(2), w - 460, 92);
        ctx.fillStyle = chg >= 0 ? "#b8ff2e" : "#ff5c5c";
        ctx.font = "600 40px ui-monospace, Menlo, monospace";
        ctx.fillText(`${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%`, w - 460, 140);
        ctx.textAlign = "left";
        // Chart region.
        const cx0 = 56;
        const cy0 = 170;
        const cw = w - 560;
        const ch = h - cy0 - 50;
        let min = Infinity;
        let max = -Infinity;
        for (const cd of candles) {
          min = Math.min(min, cd.l);
          max = Math.max(max, cd.h);
        }
        const pad = (max - min) * 0.12 + 0.01;
        min -= pad;
        max += pad;
        const yOf = (v: number) => cy0 + ch - ((v - min) / (max - min)) * ch;
        ctx.strokeStyle = "rgba(184,255,46,0.08)";
        ctx.lineWidth = 2;
        for (let gi = 0; gi <= 4; gi++) {
          const gy = cy0 + (ch * gi) / 4;
          ctx.beginPath();
          ctx.moveTo(cx0, gy);
          ctx.lineTo(cx0 + cw, gy);
          ctx.stroke();
        }
        const bw = cw / candles.length;
        candles.forEach((cd, idx) => {
          const x = cx0 + idx * bw + bw / 2;
          const up = cd.c >= cd.o;
          ctx.strokeStyle = up ? "#b8ff2e" : "#ff5c5c";
          ctx.fillStyle = up ? "#b8ff2e" : "#ff5c5c";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, yOf(cd.h));
          ctx.lineTo(x, yOf(cd.l));
          ctx.stroke();
          const top = yOf(Math.max(cd.o, cd.c));
          const bot = yOf(Math.min(cd.o, cd.c));
          ctx.fillRect(x - bw * 0.32, top, bw * 0.64, Math.max(3, bot - top));
        });
        // Right rail: live desk quotes.
        const rx = w - 430;
        ctx.fillStyle = "#3d4d21";
        ctx.font = "600 28px ui-monospace, Menlo, monospace";
        ctx.fillText("STOCK TOKENS · LIVE", rx, 200);
        ctx.fillStyle = "rgba(184,255,46,0.25)";
        ctx.fillRect(rx, 216, 350, 2);
        const rows = quotesRef.current.slice(0, 6);
        rows.forEach((q, qi) => {
          const ry = 268 + qi * 62;
          ctx.fillStyle = "#e8e8ea";
          ctx.font = "600 34px ui-monospace, Menlo, monospace";
          ctx.fillText(q.symbol, rx, ry);
          ctx.fillStyle = "#8a8a90";
          ctx.font = "400 30px ui-monospace, Menlo, monospace";
          ctx.fillText(q.dexPriceUsd != null ? `$${q.dexPriceUsd.toFixed(2)}` : "—", rx + 130, ry);
          const pct = q.premiumDiscountPct;
          ctx.fillStyle = (pct ?? 0) >= 0 ? "#b8ff2e" : "#ff5c5c";
          ctx.fillText(
            pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "",
            rx + 268,
            ry
          );
        });
      };

      const mainScreen = makeCurvedScreen({
        width: 0,
        height: 5.4,
        y: 4.4,
        thetaCenter: Math.PI,
        span: 1.5,
        canvasW: 2048,
        canvasH: 640,
      });
      if (mainScreen.ctx) drawMarketScreen(mainScreen.ctx, 2048, 640);
      mainScreen.texture.needsUpdate = true;

      const drawLeaderScreen = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#020402";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#b8ff2e";
        ctx.font = "700 52px ui-monospace, Menlo, monospace";
        ctx.fillText("REVENUE LEADERS", 60, 90);
        ctx.fillStyle = "#3d4d21";
        ctx.font = "500 30px ui-monospace, Menlo, monospace";
        ctx.fillText("VERIFIED ON-CHAIN · SUBSCRIPTIONS + X402", 60, 138);
        ctx.fillStyle = "rgba(184,255,46,0.25)";
        ctx.fillRect(60, 160, w - 120, 2);
        const rows = leadersRef.current;
        if (rows.length === 0) {
          ctx.fillStyle = "#6a6a70";
          ctx.font = "400 34px ui-monospace, Menlo, monospace";
          ctx.fillText("SYNCING CHAIN DATA…", 60, 240);
        }
        rows.slice(0, 6).forEach((l, li) => {
          const ry = 236 + li * 74;
          ctx.fillStyle = "#4a5c28";
          ctx.font = "700 38px ui-monospace, Menlo, monospace";
          ctx.fillText(String(l.rank).padStart(2, "0"), 60, ry);
          ctx.fillStyle = "#e8e8ea";
          ctx.font = "600 38px -apple-system, system-ui, sans-serif";
          ctx.fillText(l.name.slice(0, 24), 140, ry);
          ctx.textAlign = "right";
          ctx.fillStyle = "#b8ff2e";
          ctx.font = "600 38px ui-monospace, Menlo, monospace";
          ctx.fillText(
            l.revenueUsd > 0 ? `$${l.revenueUsd.toFixed(0)}` : "$0",
            w - 70,
            ry
          );
          ctx.textAlign = "left";
        });
      };

      const leaderScreen = makeCurvedScreen({
        width: 0,
        height: 3.6,
        y: 4.1,
        thetaCenter: 0,
        span: 0.85,
        canvasW: 1024,
        canvasH: 560,
      });
      if (leaderScreen.ctx) drawLeaderScreen(leaderScreen.ctx, 1024, 560);
      leaderScreen.texture.needsUpdate = true;

      /* ---- lights ---- */
      scene.add(new THREE.AmbientLight(0x3c3c40, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(6, 16, 8);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -16;
      key.shadow.camera.right = 16;
      key.shadow.camera.top = 16;
      key.shadow.camera.bottom = -16;
      scene.add(key);
      const rim = new THREE.DirectionalLight(accent, 0.35);
      rim.position.set(-8, 7, -6);
      scene.add(rim);
      const holoLight = new THREE.PointLight(accent, 6, 18, 1.7);
      holoLight.position.set(0, 4.5, 0);
      scene.add(holoLight);

      /* ---- central hologram (accent, not a floodlight) ---- */
      const holo = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.72, 10.4, 40, 1, true),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0.028,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      beam.position.y = 5.2;
      holo.add(beam);

      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.8, 1),
        new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.5 })
      );
      core.position.y = 4.3;
      holo.add(core);
      const coreInner = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.38, 0),
        new THREE.MeshStandardMaterial({
          color: 0x0a0f04,
          emissive: accent,
          emissiveIntensity: 0.35,
          roughness: 0.3,
          metalness: 0.8,
        })
      );
      coreInner.position.y = 4.3;
      holo.add(coreInner);

      const holoRings: InstanceType<typeof THREE.Mesh>[] = [];
      for (const [r, tilt] of [
        [1.25, 0.45],
        [1.6, -0.3],
      ] as const) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.012, 6, 72),
          new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3 })
        );
        ring.position.y = 4.3;
        ring.rotation.x = Math.PI / 2 + tilt;
        holo.add(ring);
        holoRings.push(ring);
      }

      const padRing = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.32, 64),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.4 })
      );
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.y = 0.02;
      holo.add(padRing);
      scene.add(holo);

      /* ---- drifting dust for depth ---- */
      const dustCount = 450;
      const dustPositions = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        const r = Math.sqrt(Math.random()) * (ROOM_RADIUS - 2);
        const theta = Math.random() * Math.PI * 2;
        dustPositions[i * 3] = Math.cos(theta) * r;
        dustPositions[i * 3 + 1] = Math.random() * 10;
        dustPositions[i * 3 + 2] = Math.sin(theta) * r;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
      const dust = new THREE.Points(
        dustGeo,
        new THREE.PointsMaterial({
          color: 0xb8ff2e,
          size: 0.035,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      scene.add(dust);

      /* ---- robot stations, arranged in a broad arc ---- */
      const loader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("/draco/");
      loader.setDRACOLoader(dracoLoader);
      const mixers: InstanceType<typeof THREE.AnimationMixer>[] = [];
      const stationPositions = new Map<string, { x: number; z: number }>();
      const robots = new Map<string, RobotRig>();
      const radius = 9.5;
      const arc = Math.PI * 1.15;

      // Forged rigs ship without clips — stock Mixamo-style walk/idle cycles
      // (Ready Player Me animation library, MIT) get retargeted onto each
      // robot's anonymized skeleton after it loads.
      let walkClip: AnimationClip | null = null;
      let idleClip: AnimationClip | null = null;
      const clipsReady = Promise.all([
        loader
          .loadAsync("/models/floor/anims/walk.glb")
          .then((g) => (walkClip = g.animations[0] ?? null))
          .catch(() => null),
        loader
          .loadAsync("/models/floor/anims/idle.glb")
          .then((g) => (idleClip = g.animations[0] ?? null))
          .catch(() => null),
      ]);

      /**
       * Bind-pose bounds lie: idle animations sink the rig, so robots clipped
       * into the floor. Sample the actual skinned vertices at the animated
       * pose and shift the model so the lowest point sits on y=0.
       */
      const groundToFloor = (model: InstanceType<typeof THREE.Group>) => {
        model.updateMatrixWorld(true);
        let minY = Infinity;
        const v = new THREE.Vector3();
        model.traverse((child) => {
          if (!(child as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
          const mesh = child as InstanceType<typeof THREE.SkinnedMesh>;
          const count = mesh.geometry.attributes.position.count;
          const step = Math.max(1, Math.floor(count / 2000));
          for (let i = 0; i < count; i += step) {
            mesh.getVertexPosition(i, v);
            v.applyMatrix4(mesh.matrixWorld);
            if (v.y < minY) minY = v.y;
          }
        });
        if (Number.isFinite(minY)) model.position.y -= minY;
      };

      const deskMat = new THREE.MeshStandardMaterial({
        color: 0x0b0b0c,
        roughness: 0.35,
        metalness: 0.75,
      });

      stations.forEach((station, i) => {
        const angle = -arc / 2 + (arc * i) / Math.max(stations.length - 1, 1);
        const x = Math.sin(angle) * radius;
        const z = -Math.cos(angle) * radius;
        stationPositions.set(station.slug, { x, z });
        // Unit direction from the station toward the room center.
        const dirX = -x / radius;
        const dirZ = -z / radius;

        // Station pad: glowing ring + dark disc.
        const ringGlow = new THREE.Mesh(
          new THREE.RingGeometry(1.28, 1.42, 56),
          new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 })
        );
        ringGlow.rotation.x = -Math.PI / 2;
        ringGlow.position.set(x, 0.015, z);
        scene.add(ringGlow);
        const padDisc = new THREE.Mesh(
          new THREE.CircleGeometry(1.28, 48),
          new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.4, metalness: 0.6 })
        );
        padDisc.rotation.x = -Math.PI / 2;
        padDisc.position.set(x, 0.012, z);
        scene.add(padDisc);

        // Workstation desk between robot and center, screen facing visitors.
        const deskX = x + dirX * 1.45;
        const deskZ = z + dirZ * 1.45;
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.7), deskMat);
        deskTop.position.set(deskX, 0.82, deskZ);
        deskTop.lookAt(x, 0.82, z);
        deskTop.castShadow = true;
        scene.add(deskTop);
        const deskBase = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.8, 0.5), deskMat);
        deskBase.position.set(deskX, 0.4, deskZ);
        deskBase.lookAt(x, 0.4, z);
        scene.add(deskBase);

        // Monitor: canvas terminal glowing toward the walkway.
        const monitorCanvas = document.createElement("canvas");
        monitorCanvas.width = 512;
        monitorCanvas.height = 300;
        const mctx = monitorCanvas.getContext("2d");
        if (mctx) {
          mctx.fillStyle = "#030503";
          mctx.fillRect(0, 0, 512, 300);
          mctx.strokeStyle = "rgba(184,255,46,0.65)";
          mctx.lineWidth = 4;
          mctx.strokeRect(4, 4, 504, 292);
          mctx.fillStyle = "#b8ff2e";
          mctx.font = "700 34px ui-monospace, Menlo, monospace";
          mctx.fillText(station.name.slice(0, 20).toUpperCase(), 26, 56);
          mctx.fillStyle = "rgba(184,255,46,0.35)";
          mctx.fillRect(26, 74, 460, 2);
          mctx.font = "400 22px ui-monospace, Menlo, monospace";
          const lines = [
            "> feed ............ LIVE",
            "> reports ......... scheduled",
            "> chain ........... robinhood 46630",
            `> mode ............ ${station.foundedBy ? "AI-FOUNDED" : "autonomous"}`,
          ];
          lines.forEach((line, li) => {
            mctx.fillStyle = li === 0 ? "#d9ffa3" : "#7a9950";
            mctx.fillText(line, 26, 118 + li * 40);
          });
        }
        const monitorTex = new THREE.CanvasTexture(monitorCanvas);
        monitorTex.colorSpace = THREE.SRGBColorSpace;
        const monitor = new THREE.Mesh(
          new THREE.PlaneGeometry(1.15, 0.68),
          new THREE.MeshBasicMaterial({ map: monitorTex, toneMapped: false })
        );
        monitor.position.set(deskX + dirX * 0.1, 1.32, deskZ + dirZ * 0.1);
        monitor.lookAt(deskX + dirX * 6, 1.15, deskZ + dirZ * 6);
        scene.add(monitor);
        const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), deskMat);
        monitorStand.position.set(deskX, 1.0, deskZ);
        scene.add(monitorStand);

        // Floating name plate.
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "rgba(4,5,3,0.88)";
          ctx.beginPath();
          ctx.roundRect(6, 6, 1012, 244, 24);
          ctx.fill();
          ctx.strokeStyle = "rgba(184,255,46,0.55)";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.roundRect(6, 6, 1012, 244, 24);
          ctx.stroke();
          ctx.fillStyle = "#f4f4f5";
          ctx.font = "600 88px -apple-system, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(station.name.slice(0, 22), 512, 118);
          ctx.fillStyle = "#b8ff2e";
          ctx.font = "500 50px -apple-system, system-ui, sans-serif";
          ctx.fillText(station.foundedBy ? "FOUNDED BY AI" : "BOWYER AGENT", 512, 198);
        }
        const plateTex = new THREE.CanvasTexture(canvas);
        plateTex.colorSpace = THREE.SRGBColorSpace;
        const plate = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: plateTex, transparent: true, depthWrite: false })
        );
        plate.scale.set(2.7, 0.68, 1);
        plate.position.set(x, 2.65, z);
        scene.add(plate);

        // Models load after the shared clips so retargeting can run inline.
        clipsReady.then(() => {
          if (disposed) return;
          loader.load(
            station.glbUrl,
            (gltf) => {
              if (disposed) return;
              const model = gltf.scene;
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              const scale = 1.75 / Math.max(size.y, 0.001);
              model.scale.setScalar(scale);
              const scaledBox = new THREE.Box3().setFromObject(model);
              model.position.set(x, -scaledBox.min.y, z);
              // Level target keeps tall/short rigs from pitching forward.
              model.lookAt(0, model.position.y, 0);
              model.traverse((child) => {
                if ((child as { isMesh?: boolean }).isMesh) {
                  child.castShadow = true;
                }
              });
              scene.add(model);

              const rig: RobotRig = {
                model,
                plate,
                idleAction: null,
                walkAction: null,
                homeX: x,
                homeZ: z,
                baseYaw: model.rotation.y,
                groundY: 0,
                mode: "desk",
                waypoints: [],
                nextAt: 5 + i * 6 + Math.random() * 10,
                greetMuteUntil: 0,
                movingAnim: false,
              };

              // Rediscover the Mixamo skeleton inside the anonymized rig and
              // rebase the shared idle/walk clips onto its bind pose. Both
              // retargets must run before the mixer first updates the bones.
              const boneMap = resolveMixamoBones(model);
              if (boneMap && (idleClip || walkClip)) {
                const retargetedIdle = idleClip
                  ? retargetMixamoClip(idleClip, model, boneMap)
                  : null;
                const retargetedWalk = walkClip
                  ? retargetMixamoClip(walkClip, model, boneMap)
                  : null;
                const mixer = new THREE.AnimationMixer(model);
                if (retargetedIdle) {
                  rig.idleAction = mixer.clipAction(retargetedIdle);
                  // Desync so the floor doesn't breathe in unison.
                  rig.idleAction.time = Math.random() * retargetedIdle.duration;
                  rig.idleAction.play();
                }
                if (retargetedWalk) {
                  rig.walkAction = mixer.clipAction(retargetedWalk);
                  rig.walkAction.timeScale = 0.92;
                }
                mixers.push(mixer);
                mixer.update(0);
              }

              // Ground on the real skinned pose — bind-pose bounds lie.
              groundToFloor(model);
              rig.groundY = model.position.y;
              robots.set(station.slug, rig);
              setLoadedCount((n) => n + 1);
            },
            undefined,
            () => setLoadedCount((n) => n + 1)
          );
        });
      });

      /* ---- set dressing: chairs, keyboards, plants (Draco, CC0) ---- */
      // Normalize a prop: wrap so its base sits at y=0 and it measures
      // `target` along the given axis, then clone per station.
      const prepProp = (
        obj: InstanceType<typeof THREE.Group>,
        target: number,
        axis: "x" | "y" = "y"
      ) => {
        const raw = new THREE.Box3().setFromObject(obj);
        const rawSize = raw.getSize(new THREE.Vector3());
        obj.scale.setScalar(target / Math.max(axis === "x" ? rawSize.x : rawSize.y, 1e-4));
        const box = new THREE.Box3().setFromObject(obj);
        obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        obj.traverse((child) => {
          if ((child as { isMesh?: boolean }).isMesh) child.castShadow = true;
        });
        const wrapper = new THREE.Group();
        wrapper.add(obj);
        return wrapper;
      };

      (async () => {
        try {
          const [chairG, keyG, plantG] = await Promise.all([
            loader.loadAsync("/models/floor/office-chair.gltf"),
            loader.loadAsync("/models/floor/keyboard.gltf"),
            loader.loadAsync("/models/floor/plant.gltf"),
          ]);
          if (disposed) return;
          const chair = prepProp(chairG.scene, 0.95);
          const keyboard = prepProp(keyG.scene, 0.5, "x");
          const plant = prepProp(plantG.scene, 1.25);

          stations.forEach((station, i) => {
            const pos = stationPositions.get(station.slug);
            if (!pos) return;
            const dirX = -pos.x / radius;
            const dirZ = -pos.z / radius;
            const tanX = -dirZ;
            const tanZ = dirX;
            const deskX = pos.x + dirX * 1.45;
            const deskZ = pos.z + dirZ * 1.45;

            // Chair pushed out beside the desk, angled back toward it.
            const side = i % 2 === 0 ? 1 : -1;
            const chairClone = chair.clone(true);
            chairClone.position.set(
              deskX + tanX * side * 1.25 + dirX * 0.4,
              0,
              deskZ + tanZ * side * 1.25 + dirZ * 0.4
            );
            chairClone.lookAt(deskX, 0, deskZ);
            scene.add(chairClone);

            const kb = keyboard.clone(true);
            kb.position.set(deskX + dirX * 0.08, 0.86, deskZ + dirZ * 0.08);
            kb.rotation.y = Math.atan2(dirX, dirZ);
            scene.add(kb);

            // A plant every third station, tucked toward the wall.
            if (i % 3 === 0) {
              const plantClone = plant.clone(true);
              const pr = radius + 2.6;
              plantClone.position.set((pos.x / radius) * pr, 0, (pos.z / radius) * pr);
              scene.add(plantClone);
            }
          });
        } catch {
          // Props are garnish — the floor works without them.
        }
      })();

      /* ---- first-person controls ---- */
      const controls = new PointerLockControls(camera, renderer.domElement);
      controls.addEventListener("lock", () => {
        enteredRef.current = true;
        setLocked(true);
      });
      controls.addEventListener("unlock", () => {
        enteredRef.current = false;
        setLocked(false);
      });

      const activateFallback = () => {
        fallbackRef.current = true;
        enteredRef.current = true;
        setFallbackLook(true);
        setLocked(true);
      };
      const onLockError = () => activateFallback();
      document.addEventListener("pointerlockerror", onLockError);

      lockRef.current = () => {
        if (fallbackRef.current) {
          enteredRef.current = true;
          setLocked(true);
          return;
        }
        try {
          controls.lock();
        } catch {
          activateFallback();
          return;
        }
        // Some browsers reject silently — if the lock never engages, degrade
        // to drag-look instead of leaving the visitor stuck on the overlay.
        window.setTimeout(() => {
          if (!controls.isLocked && !fallbackRef.current) activateFallback();
        }, 700);
      };

      // Drag-look for the fallback mode.
      const euler = new THREE.Euler(0, 0, 0, "YXZ");
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const onPointerDown = (e: PointerEvent) => {
        if (!fallbackRef.current || !enteredRef.current) return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx * 0.0045;
        euler.x = Math.max(-1.4, Math.min(1.4, euler.x - dy * 0.0045));
        camera.quaternion.setFromEuler(euler);
      };
      const onPointerUp = () => {
        dragging = false;
      };
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);

      const isEntered = () =>
        controls.isLocked || (fallbackRef.current && enteredRef.current);

      const keys = new Set<string>();
      const onKeyDown = (e: KeyboardEvent) => {
        keys.add(e.code);
        if (e.code === "KeyE" && nearestRef.current && isEntered()) {
          controls.unlock();
          setFocused(nearestRef.current);
        }
        if (e.code === "Escape" && fallbackRef.current && enteredRef.current) {
          enteredRef.current = false;
          setLocked(false);
        }
      };
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);

      const onResize = () => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        composer.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener("resize", onResize);

      /* ---- robot wandering ---- */
      const WALK_SPEED = 1.05;
      const MAX_WALKERS = 3;

      // Distance from the room center to the segment (x1,z1)→(x2,z2); used to
      // keep stroll legs from cutting through the hologram.
      const segDistToCenter = (x1: number, z1: number, x2: number, z2: number) => {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len2 = dx * dx + dz * dz;
        const u = len2 > 0 ? Math.max(0, Math.min(1, -(x1 * dx + z1 * dz) / len2)) : 0;
        return Math.hypot(x1 + dx * u, z1 + dz * u);
      };

      const strollPoint = (fromX: number, fromZ: number): StrollPoint => {
        for (let attempt = 0; attempt < 10; attempt++) {
          const r = 3.4 + Math.random() * 3.6;
          const a = Math.random() * Math.PI * 2;
          const p = { x: Math.sin(a) * r, z: Math.cos(a) * r, pause: true };
          if (segDistToCenter(fromX, fromZ, p.x, p.z) < 2.5) continue;
          // Don't route strolls straight into the visitor's face.
          if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 4.5) continue;
          return p;
        }
        return { x: fromX, z: fromZ, pause: true };
      };

      // A stroll: slip out beside the desk, hit 1–2 spots on the open floor,
      // come back in beside the desk, end on the home pad.
      const buildStroll = (rig: RobotRig): StrollPoint[] => {
        const angle = Math.atan2(rig.homeX, -rig.homeZ);
        const gate = (side: number): StrollPoint => ({
          x: Math.sin(angle + side * 0.17) * 7.4,
          z: -Math.cos(angle + side * 0.17) * 7.4,
        });
        const side = Math.random() < 0.5 ? 1 : -1;
        const points: StrollPoint[] = [gate(side)];
        let last = points[0];
        const hops = 1 + Math.floor(Math.random() * 2);
        for (let h = 0; h < hops; h++) {
          const p = strollPoint(last.x, last.z);
          points.push(p);
          last = p;
        }
        points.push(gate(Math.random() < 0.5 ? side : -side));
        points.push({ x: rig.homeX, z: rig.homeZ });
        return points;
      };

      const setMoving = (rig: RobotRig, walking: boolean) => {
        if (!rig.walkAction || !rig.idleAction || rig.movingAnim === walking) return;
        rig.movingAnim = walking;
        const to = walking ? rig.walkAction : rig.idleAction;
        const from = walking ? rig.idleAction : rig.walkAction;
        to.reset().fadeIn(0.28).play();
        from.fadeOut(0.28);
      };

      /* ---- loop ---- */
      const clock = new THREE.Clock();
      const velocity = new THREE.Vector3();
      let raf = 0;
      let walkPhase = 0;
      let tapeRefreshIn = 8;
      let candleIn = 2.6;
      let leaderIn = 12;

      const animate = () => {
        raf = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        for (const mixer of mixers) mixer.update(dt);

        // Ambient motion: hologram, tickers, dust.
        core.rotation.y += dt * 0.4;
        core.rotation.x += dt * 0.12;
        coreInner.rotation.y -= dt * 0.6;
        holoRings.forEach((ring, ri) => {
          ring.rotation.z += dt * (0.25 + ri * 0.12) * (ri % 2 === 0 ? 1 : -1);
        });
        core.position.y = 4.4 + Math.sin(t * 0.8) * 0.15;
        coreInner.position.y = core.position.y;
        tape.texture.offset.x += dt * 0.012;
        tapeRefreshIn -= dt;
        if (tapeRefreshIn <= 0 && tape.ctx) {
          drawQuoteTape(tape.ctx, tape.canvas.width, tape.canvas.height);
          tape.texture.needsUpdate = true;
          tapeRefreshIn = 10;
        }
        // The composite chart prints a fresh candle every few seconds; the
        // leaderboard wall re-renders as chain data lands.
        candleIn -= dt;
        if (candleIn <= 0 && mainScreen.ctx) {
          pushCandle();
          drawMarketScreen(mainScreen.ctx, mainScreen.canvas.width, mainScreen.canvas.height);
          mainScreen.texture.needsUpdate = true;
          candleIn = 2.6;
        }
        leaderIn -= dt;
        if (leaderIn <= 0 && leaderScreen.ctx) {
          drawLeaderScreen(leaderScreen.ctx, leaderScreen.canvas.width, leaderScreen.canvas.height);
          leaderScreen.texture.needsUpdate = true;
          leaderIn = 20;
        }
        dust.rotation.y += dt * 0.008;

        // Robots live their lives: work the desk, stroll the floor, greet
        // whoever walks up.
        let walkers = 0;
        for (const rig of robots.values()) {
          if (rig.mode !== "desk") walkers++;
        }
        for (const rig of robots.values()) {
          const model = rig.model;
          const pdx = camera.position.x - model.position.x;
          const pdz = camera.position.z - model.position.z;
          const playerDist = Math.hypot(pdx, pdz);
          const faceYaw = (target: number, rate: number) => {
            const delta = Math.atan2(
              Math.sin(target - model.rotation.y),
              Math.cos(target - model.rotation.y)
            );
            model.rotation.y += delta * Math.min(1, dt * rate);
            return delta;
          };

          if (rig.mode === "desk") {
            const near = isEntered() && playerDist < 6;
            faceYaw(near ? Math.atan2(pdx, pdz) : rig.baseYaw, 3.5);
            if (
              rig.walkAction &&
              t >= rig.nextAt &&
              walkers < MAX_WALKERS &&
              (!isEntered() || playerDist > 7)
            ) {
              rig.waypoints = buildStroll(rig);
              rig.mode = "walk";
              walkers++;
              setMoving(rig, true);
            }
          } else if (rig.mode === "greet") {
            faceYaw(Math.atan2(pdx, pdz), 4.5);
            // Lose interest after a beat, even if the visitor doesn't move.
            const done = !isEntered() || playerDist > 4.6 || t >= rig.nextAt;
            if (done) {
              rig.greetMuteUntil = t + 12;
              if (rig.waypoints.length > 0) {
                rig.mode = "walk";
                setMoving(rig, true);
              } else {
                rig.mode = "desk";
                rig.nextAt = t + 12 + Math.random() * 30;
                setMoving(rig, false);
              }
            }
          } else if (isEntered() && playerDist < 3.2 && t >= rig.greetMuteUntil) {
            // Mid-stroll and someone walked up — stop and give them a look.
            rig.mode = "greet";
            rig.nextAt = t + 6 + Math.random() * 5;
            setMoving(rig, false);
          } else if (rig.mode === "pause") {
            if (t >= rig.nextAt) {
              rig.mode = "walk";
              setMoving(rig, true);
            }
          } else if (rig.mode === "walk") {
            const wp = rig.waypoints[0];
            if (!wp) {
              rig.mode = "desk";
              rig.nextAt = t + 15 + Math.random() * 30;
              setMoving(rig, false);
            } else {
              const dx = wp.x - model.position.x;
              const dz = wp.z - model.position.z;
              const dist = Math.hypot(dx, dz);
              if (dist < 0.35) {
                rig.waypoints.shift();
                if (rig.waypoints.length === 0) {
                  model.position.set(rig.homeX, rig.groundY, rig.homeZ);
                  rig.mode = "desk";
                  rig.nextAt = t + 18 + Math.random() * 40;
                  setMoving(rig, false);
                } else if (wp.pause && Math.random() < 0.8) {
                  rig.mode = "pause";
                  rig.nextAt = t + 2.5 + Math.random() * 5;
                  setMoving(rig, false);
                }
              } else {
                // Turn first, walk once roughly facing the waypoint.
                const delta = faceYaw(Math.atan2(dx, dz), 3.2);
                if (Math.abs(delta) < 0.6) {
                  const step = Math.min(WALK_SPEED * dt, dist);
                  model.position.x += Math.sin(model.rotation.y) * step;
                  model.position.z += Math.cos(model.rotation.y) * step;
                }
              }
            }
          }

          // Walkers give everyone room instead of phasing through them.
          if (rig.mode === "walk") {
            for (const other of robots.values()) {
              if (other === rig) continue;
              const ox = model.position.x - other.model.position.x;
              const oz = model.position.z - other.model.position.z;
              const od = Math.hypot(ox, oz);
              if (od > 0.001 && od < 1.3) {
                const push = (1.3 - od) * 0.5;
                model.position.x += (ox / od) * push;
                model.position.z += (oz / od) * push;
              }
            }
          }

          // Name plate travels with its robot.
          rig.plate.position.set(model.position.x, 2.65, model.position.z);
        }

        if (isEntered()) {
          const speed = keys.has("ShiftLeft") ? 7.5 : 4.2;
          velocity.set(0, 0, 0);
          if (keys.has("KeyW") || keys.has("ArrowUp")) velocity.z += 1;
          if (keys.has("KeyS") || keys.has("ArrowDown")) velocity.z -= 1;
          if (keys.has("KeyA") || keys.has("ArrowLeft")) velocity.x -= 1;
          if (keys.has("KeyD") || keys.has("ArrowRight")) velocity.x += 1;
          const moving = velocity.lengthSq() > 0;
          if (moving) {
            velocity.normalize().multiplyScalar(speed * dt);
            controls.moveForward(velocity.z);
            controls.moveRight(velocity.x);
            walkPhase += dt * (keys.has("ShiftLeft") ? 13 : 9.5);
          }

          // Keep the visitor inside the circular room.
          const dist = Math.hypot(camera.position.x, camera.position.z);
          const maxDist = ROOM_RADIUS - 1.5;
          if (dist > maxDist) {
            camera.position.x *= maxDist / dist;
            camera.position.z *= maxDist / dist;
          }
          // Subtle head bob sells the walk.
          camera.position.y = 1.65 + (moving ? Math.sin(walkPhase) * 0.035 : 0);

          // Proximity: which robot is close enough to talk to? Tracks live
          // positions, so a strolling robot can be met anywhere on the floor.
          let best: FloorStation | null = null;
          let bestDist = 4.2;
          for (const station of stations) {
            const rig = robots.get(station.slug);
            const pos = rig
              ? { x: rig.model.position.x, z: rig.model.position.z }
              : stationPositions.get(station.slug);
            if (!pos) continue;
            const d = Math.hypot(camera.position.x - pos.x, camera.position.z - pos.z);
            if (d < bestDist) {
              bestDist = d;
              best = station;
            }
          }
          if (best?.slug !== nearestRef.current?.slug) {
            nearestRef.current = best;
            setNearest(best);
          }
        }
        composer.render();
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        document.removeEventListener("pointerlockerror", onLockError);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("resize", onResize);
        controls.disconnect();
        dracoLoader.dispose();
        composer.dispose();
        renderer.dispose();
        mount.contains(renderer.domElement) && mount.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
    // Stations are stable for the life of the page (server-provided).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#030303]">
      <div ref={mountRef} className="absolute inset-0" />

      {webglFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[16px] text-foreground">3D is unavailable on this device.</p>
          <Link href="/marketplace" className="text-[14px] text-accent underline underline-offset-2">
            Browse the marketplace instead
          </Link>
        </div>
      )}

      {/* Enter overlay */}
      {!locked && !focused && !webglFailed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            {loadedCount < stations.length
              ? `Robots arriving — ${loadedCount}/${stations.length}`
              : "All robots at their desks"}
          </p>
          <h1 className="mt-4 text-[40px] sm:text-[56px] font-semibold tracking-[-0.03em] text-foreground">
            The Trading Floor
          </h1>
          <p className="mt-3 max-w-[440px] text-center text-[15px] leading-relaxed text-muted">
            Walk the floor where {stations.length} autonomous businesses work around the clock.
            Get close to a robot and press E to see what it&apos;s working on.
          </p>
          <button
            type="button"
            onClick={() => lockRef.current?.()}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-sm bg-accent px-10 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Enter the floor
          </button>
          <p className="mt-4 text-[12px] text-subtle">
            {fallbackLook
              ? "WASD move · drag to look · Shift run · E talk · Esc exit"
              : "WASD move · mouse look · Shift run · E talk · Esc exit"}
          </p>
        </div>
      )}

      {/* HUD: crosshair + interact prompt */}
      {locked && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
          {nearest && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-sm border border-accent/40 bg-black/70 px-5 py-3 text-center backdrop-blur-sm">
              <p className="text-[14px] font-medium text-foreground">{nearest.name}</p>
              <p className="mt-0.5 text-[12px] text-accent">
                Press E to see what it&apos;s working on
              </p>
            </div>
          )}
        </>
      )}

      {/* Live panels */}
      {!focused && !webglFailed && (
        <>
          {quotes.length > 0 && (
            <div className="pointer-events-none absolute left-4 top-4 z-10 hidden w-[220px] rounded-sm border border-white/10 bg-black/65 p-4 backdrop-blur-sm lg:block">
              <p className="text-[10.5px] uppercase tracking-wide text-subtle">
                Stock tokens · live
              </p>
              <div className="mt-2.5 space-y-1.5">
                {quotes.map((q) => (
                  <div
                    key={q.symbol}
                    className="flex items-baseline justify-between text-[12px] tabular-nums"
                  >
                    <span className="text-foreground">{q.symbol}</span>
                    <span className="text-muted">
                      {q.dexPriceUsd != null ? `$${q.dexPriceUsd.toFixed(2)}` : "—"}
                    </span>
                    <span
                      className={
                        (q.premiumDiscountPct ?? 0) >= 0 ? "text-accent" : "text-negative"
                      }
                    >
                      {q.premiumDiscountPct != null
                        ? `${q.premiumDiscountPct >= 0 ? "+" : ""}${q.premiumDiscountPct.toFixed(1)}%`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {leaders.length > 0 && (
            <div className="pointer-events-none absolute right-4 top-4 z-10 hidden w-[230px] rounded-sm border border-white/10 bg-black/65 p-4 backdrop-blur-sm lg:block">
              <p className="text-[10.5px] uppercase tracking-wide text-subtle">
                Revenue leaders · on-chain
              </p>
              <div className="mt-2.5 space-y-1.5">
                {leaders.map((l) => (
                  <div
                    key={l.rank}
                    className="flex items-baseline justify-between gap-2 text-[12px]"
                  >
                    <span className="truncate text-foreground">
                      <span className="mr-1.5 font-mono text-subtle">{l.rank}</span>
                      {l.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatUsd(l.revenueUsd, true)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Focused agent panel */}
      {focused && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[440px] rounded-sm border border-border bg-surface p-7">
            <p className="text-[11px] uppercase tracking-wide text-accent">On the floor</p>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
              {focused.name}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{focused.tagline}</p>
            <div className="mt-7 flex flex-col gap-3">
              <Link
                href={`/agents/${focused.slug}`}
                className="inline-flex h-11 items-center justify-center rounded-sm bg-accent text-[14px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Talk to it — live voice call
              </Link>
              <button
                type="button"
                onClick={() => {
                  setFocused(null);
                  lockRef.current?.();
                }}
                className="inline-flex h-11 items-center justify-center rounded-sm border border-border text-[14px] text-muted transition-colors hover:text-foreground"
              >
                Back to the floor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
