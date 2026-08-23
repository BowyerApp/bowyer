/**
 * BOWYER — "deploy an agent, trade perps" promo.
 * 1920x1080 @ 30fps. All market numbers are real Hyperliquid prints
 * captured from bowyer.app/api/trading/hyperliquid at build time.
 */

import React from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const DURATION = 1290;

/* ---------- palette (matches the terminal) ---------- */
const BG = "#0a0d0c";
const PANEL = "#10514108";
const CARD = "#101614";
const BORDER = "#1e2a26";
const FG = "#e8f4ef";
const MUTED = "#8aa39a";
const SUBTLE = "#5c736b";
const UP = "#2dd4a7";
const DOWN = "#f45d7e";
const GOLD = "#e8b04b";
const ANALYST = "#8ee83d";
const HL = "#97fce4";

const MONO = "'SF Mono', 'Menlo', 'Consolas', monospace";
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/* ---------- real Hyperliquid prints (2026-08-23) ---------- */
const PERPS = [
  { symbol: "BTC", price: "77,028", chg: -1.97, vol: "$3.13b" },
  { symbol: "ETH", price: "2,415.38", chg: -4.39, vol: "$2.00b" },
  { symbol: "HYPE", price: "78.89", chg: +4.12, vol: "$1.22b" },
  { symbol: "ZEC", price: "793.35", chg: +7.83, vol: "$855m" },
  { symbol: "XRP", price: "1.461", chg: +0.56, vol: "$720m" },
];

const MANDATE =
  "Trade momentum on majors. Follow the whale wallet — if it accumulates, I accumulate. Cut anything -8%. Stay in cash when nothing is moving.";

const BULL =
  "HYPE is +4.1% on $1.2b volume with rising open interest — the whale wallet added to its position 40 minutes ago. Funding is flat, so longs aren't crowded. This is the cleanest momentum setup on the board.";
const BEAR =
  "BTC and ETH are red on the day; if majors roll over, alts follow. ZEC's +7.8% looks extended. If you must deploy, size small and respect the stop.";
const VERDICT =
  "Bull case is data-backed: whale accumulation plus volume confirmation on HYPE. Bear's concern is real but the mandate's -8% stop covers it. Opening a starter long, $100.";

/* ---------- primitives ---------- */

const useAppear = (delay: number, damp = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: damp } });
};

const Type: React.FC<{ text: string; start: number; cps?: number; style?: React.CSSProperties }> = ({
  text,
  start,
  cps = 1.4,
  style,
}) => {
  const frame = useCurrentFrame();
  const chars = Math.max(0, Math.floor((frame - start) * cps));
  const shown = text.slice(0, chars);
  const done = chars >= text.length;
  return (
    <span style={style}>
      {shown}
      {!done && frame >= start && (
        <span style={{ opacity: frame % 16 < 8 ? 1 : 0, color: UP }}>▌</span>
      )}
    </span>
  );
};

const Grid: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage: `linear-gradient(${BORDER}22 1px, transparent 1px), linear-gradient(90deg, ${BORDER}22 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
      maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
    }}
  />
);

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
      pointerEvents: "none",
    }}
  />
);

const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 4px)",
      opacity: 0.35,
      pointerEvents: "none",
    }}
  />
);

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    style={{
      border: `2px solid ${color}66`,
      background: `${color}14`,
      color,
      borderRadius: 6,
      padding: "4px 12px",
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 2,
      fontFamily: MONO,
    }}
  >
    {children}
  </span>
);

const Panel: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({
  style,
  children,
}) => (
  <div
    style={{
      background: CARD,
      border: `2px solid ${BORDER}`,
      borderRadius: 16,
      boxShadow: `0 0 80px ${PANEL}, inset 0 1px 0 rgba(255,255,255,0.03)`,
      ...style,
    }}
  >
    {children}
  </div>
);

const StepTag: React.FC<{ n: string; label: string }> = ({ n, label }) => {
  const s = useAppear(0);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        marginBottom: 34,
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px)`,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          color: BG,
          background: UP,
          fontWeight: 900,
          fontSize: 26,
          borderRadius: 8,
          padding: "6px 16px",
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontFamily: MONO,
          color: SUBTLE,
          fontSize: 26,
          letterSpacing: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
    </div>
  );
};

/* ---------- scene 1: cold open ---------- */

const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const sub = spring({ frame: frame - 28, fps, config: { damping: 200 } });
  const flicker = frame < 12 && frame % 4 < 2 ? 0.25 : 1;

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 148,
            fontWeight: 900,
            letterSpacing: 30,
            color: FG,
            opacity: logo * flicker,
            transform: `scale(${0.9 + logo * 0.1})`,
            textShadow: `0 0 60px ${UP}44`,
          }}
        >
          BOWYER
        </div>
        <div
          style={{
            marginTop: 20,
            fontFamily: MONO,
            fontSize: 34,
            color: UP,
            letterSpacing: 10,
            opacity: sub,
          }}
        >
          DEPLOY AN AGENT. TRADE PERPS. SLEEP.
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 2: mandate ---------- */

const Mandate: React.FC = () => {
  const s = useAppear(6);
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1250 }}>
        <StepTag n="01" label="WRITE THE MANDATE" />
        <Panel style={{ padding: 46, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
          <div
            style={{
              fontFamily: SANS,
              color: SUBTLE,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              marginBottom: 22,
            }}
          >
            MANDATE — WHAT SHOULD IT TRADE AND WHY?
          </div>
          <div
            style={{
              border: `2px solid ${BORDER}`,
              borderRadius: 10,
              background: BG,
              padding: 32,
              minHeight: 170,
              fontFamily: MONO,
              fontSize: 32,
              lineHeight: 1.6,
              color: FG,
            }}
          >
            <Type text={MANDATE} start={22} cps={1.6} />
          </div>
        </Panel>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 3: sources ---------- */

const SOURCES = [
  { icon: "◈", label: "wallet://0x9c47…e21a", note: "whale wallet, watched live" },
  { icon: "✆", label: "telegram://alpha-calls", note: "channel read every decision" },
  { icon: "⛁", label: "api.fundingdata.io/rates", note: "live funding + OI feed" },
];

const Sources: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1250 }}>
        <StepTag n="02" label="FEED IT INTELLIGENCE" />
        {SOURCES.map((src, i) => {
          const delay = 14 + i * 16;
          return (
            <SourceRow key={src.label} {...src} delay={delay} />
          );
        })}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

const SourceRow: React.FC<{ icon: string; label: string; note: string; delay: number }> = ({
  icon,
  label,
  note,
  delay,
}) => {
  const s = useAppear(delay, 16);
  return (
    <Panel
      style={{
        padding: "30px 40px",
        marginBottom: 22,
        display: "flex",
        alignItems: "center",
        gap: 30,
        opacity: Math.min(1, s * 1.2),
        transform: `translateX(${(1 - s) * -80}px)`,
      }}
    >
      <span style={{ fontSize: 44, color: UP }}>{icon}</span>
      <span style={{ fontFamily: MONO, fontSize: 34, color: FG, fontWeight: 700 }}>{label}</span>
      <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 24, color: SUBTLE }}>
        {note}
      </span>
      <span style={{ color: UP, fontSize: 34, fontWeight: 900 }}>✓</span>
    </Panel>
  );
};

/* ---------- scene 4: venue ---------- */

const Venue: React.FC = () => {
  const frame = useCurrentFrame();
  const pick = frame > 45;
  const pulse = pick ? 1 + Math.sin((frame - 45) / 5) * 0.012 : 1;
  const s = useAppear(6);
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1250 }}>
        <StepTag n="03" label="PICK THE VENUE" />
        <div style={{ display: "flex", gap: 30, opacity: s }}>
          <Panel
            style={{
              flex: 1,
              padding: 44,
              textAlign: "center",
              opacity: pick ? 0.35 : 1,
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 38, color: FG, fontWeight: 800 }}>
              ROBINHOOD CHAIN
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, color: SUBTLE, marginTop: 12 }}>
              onchain spot · USDG pairs
            </div>
          </Panel>
          <Panel
            style={{
              flex: 1,
              padding: 44,
              textAlign: "center",
              border: pick ? `3px solid ${HL}` : `2px solid ${BORDER}`,
              boxShadow: pick ? `0 0 90px ${HL}33` : undefined,
              transform: `scale(${pulse})`,
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 38, color: pick ? HL : FG, fontWeight: 800 }}>
              HYPERLIQUID PERPS
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, color: SUBTLE, marginTop: 12 }}>
              real perp execution · IOC fills
            </div>
            {pick && (
              <div
                style={{
                  marginTop: 20,
                  fontFamily: MONO,
                  fontSize: 26,
                  color: HL,
                  fontWeight: 800,
                  letterSpacing: 4,
                }}
              >
                ✓ SELECTED
              </div>
            )}
          </Panel>
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 5: deploy ---------- */

const Deploy: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const btn = spring({ frame, fps, config: { damping: 200 } });
  const press = frame > 30 && frame < 38;
  const card = spring({ frame: frame - 42, fps, config: { damping: 14, mass: 0.9 } });

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1250 }}>
        {frame < 42 && (
          <div style={{ textAlign: "center", opacity: btn }}>
            <div
              style={{
                display: "inline-block",
                background: UP,
                color: BG,
                fontFamily: MONO,
                fontWeight: 900,
                fontSize: 44,
                letterSpacing: 4,
                borderRadius: 14,
                padding: "28px 80px",
                transform: press ? "scale(0.94)" : "scale(1)",
                boxShadow: `0 0 100px ${UP}55`,
              }}
            >
              DEPLOY ANALYST
            </div>
          </div>
        )}
        {frame >= 42 && (
          <Panel
            style={{
              padding: 44,
              opacity: card,
              transform: `translateY(${(1 - card) * 60}px) scale(${0.96 + card * 0.04})`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 12,
                  border: `2px solid ${ANALYST}66`,
                  background: `${ANALYST}14`,
                  color: ANALYST,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                }}
              >
                ⊛
              </div>
              <div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontFamily: SANS, fontSize: 42, fontWeight: 800, color: FG }}>
                    Signal Analyst
                  </span>
                  <Badge color={MUTED}>SIM</Badge>
                  <Badge color={HL}>HYPERLIQUID</Badge>
                  <Badge color={UP}>ACTIVE</Badge>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 24, color: SUBTLE, marginTop: 10 }}>
                  premium LLM · 15-min decisions · hard risk rails always on
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontFamily: MONO, fontSize: 52, fontWeight: 900, color: FG }}>
                  $1,000.00
                </div>
                <div style={{ fontFamily: MONO, fontSize: 24, color: SUBTLE }}>starting equity</div>
              </div>
            </div>
          </Panel>
        )}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 6: the debate ---------- */

const Debate: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bull = spring({ frame: frame - 8, fps, config: { damping: 16 } });
  const bear = spring({ frame: frame - 20, fps, config: { damping: 16 } });
  const verdict = spring({ frame: frame - 150, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1500 }}>
        <div
          style={{
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 30,
            letterSpacing: 10,
            color: SUBTLE,
            fontWeight: 800,
            marginBottom: 36,
          }}
        >
          THE DESK DEBATES YOUR MONEY
        </div>
        <div style={{ display: "flex", gap: 30 }}>
          <Panel
            style={{
              flex: 1,
              padding: 40,
              border: `2px solid ${UP}55`,
              opacity: bull,
              transform: `translateX(${(1 - bull) * -120}px)`,
            }}
          >
            <div
              style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: UP, marginBottom: 20 }}
            >
              ▲ BULL
            </div>
            <div style={{ fontFamily: SANS, fontSize: 27, lineHeight: 1.65, color: MUTED }}>
              <Type text={BULL} start={16} cps={4} />
            </div>
          </Panel>
          <Panel
            style={{
              flex: 1,
              padding: 40,
              border: `2px solid ${DOWN}55`,
              opacity: bear,
              transform: `translateX(${(1 - bear) * 120}px)`,
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 30,
                fontWeight: 900,
                color: DOWN,
                marginBottom: 20,
              }}
            >
              ▼ BEAR
            </div>
            <div style={{ fontFamily: SANS, fontSize: 27, lineHeight: 1.65, color: MUTED }}>
              <Type text={BEAR} start={28} cps={4} />
            </div>
          </Panel>
        </div>
        <Panel
          style={{
            marginTop: 30,
            padding: "34px 40px",
            border: `2px solid ${GOLD}66`,
            opacity: verdict,
            transform: `translateY(${(1 - verdict) * 40}px)`,
          }}
        >
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            <span
              style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: GOLD, whiteSpace: "nowrap" }}
            >
              ⚖ RISK OFFICER
            </span>
            <span style={{ fontFamily: SANS, fontSize: 27, lineHeight: 1.6, color: FG }}>
              <Type text={VERDICT} start={158} cps={5} />
            </span>
          </div>
        </Panel>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 7: execution ---------- */

const Execution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const table = spring({ frame, fps, config: { damping: 200 } });
  const fillAt = 70;
  const fill = spring({ frame: frame - fillAt, fps, config: { damping: 13 } });
  const tg = spring({ frame: frame - fillAt - 24, fps, config: { damping: 15 } });
  const flash = frame >= fillAt && frame < fillAt + 10 ? (fillAt + 10 - frame) / 10 : 0;

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <AbsoluteFill style={{ background: `rgba(45,212,167,${flash * 0.08})` }} />
      <div style={{ width: 1400 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 26,
            letterSpacing: 8,
            color: SUBTLE,
            fontWeight: 800,
            marginBottom: 26,
            opacity: table,
          }}
        >
          LIVE HYPERLIQUID TAPE — REAL PRINTS
        </div>
        <Panel style={{ padding: 0, overflow: "hidden", opacity: table }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
              padding: "18px 36px",
              borderBottom: `2px solid ${BORDER}`,
              fontFamily: MONO,
              fontSize: 22,
              color: SUBTLE,
              letterSpacing: 3,
            }}
          >
            <span>PERP</span>
            <span>MARK</span>
            <span>24H</span>
            <span>VOLUME</span>
          </div>
          {PERPS.map((p, i) => {
            const isHype = p.symbol === "HYPE";
            const rowHot = isHype && frame >= fillAt;
            return (
              <div
                key={p.symbol}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
                  padding: "20px 36px",
                  borderBottom: i < PERPS.length - 1 ? `1px solid ${BORDER}` : undefined,
                  fontFamily: MONO,
                  fontSize: 30,
                  background: rowHot ? `${UP}11` : undefined,
                  color: FG,
                }}
              >
                <span style={{ fontWeight: 800, color: rowHot ? UP : FG }}>
                  {p.symbol}
                  {rowHot ? "  ● LONG" : ""}
                </span>
                <span>${p.price}</span>
                <span style={{ color: p.chg >= 0 ? UP : DOWN }}>
                  {p.chg >= 0 ? "+" : ""}
                  {p.chg.toFixed(2)}%
                </span>
                <span style={{ color: MUTED }}>{p.vol}</span>
              </div>
            );
          })}
        </Panel>

        {frame >= fillAt && (
          <Panel
            style={{
              marginTop: 26,
              padding: "28px 36px",
              border: `2px solid ${UP}66`,
              display: "flex",
              alignItems: "center",
              gap: 26,
              opacity: fill,
              transform: `translateY(${(1 - fill) * 40}px)`,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 900, color: UP }}>
              ✓ FILLED
            </span>
            <span style={{ fontFamily: MONO, fontSize: 32, color: FG }}>
              BUY HYPE — $100.00 @ $78.89
            </span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 24, color: SUBTLE }}>
              IOC · reduce-only exits · stop -8%
            </span>
          </Panel>
        )}
      </div>

      {/* telegram alert */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 60,
          width: 560,
          opacity: tg,
          transform: `translateX(${(1 - tg) * 140}px)`,
        }}
      >
        <Panel style={{ padding: 30, border: `2px solid #2ea6da66`, background: "#0e1620" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: "#2ea6da",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 900,
              }}
            >
              ✈
            </div>
            <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 800, color: FG }}>
              Bowyer · Telegram
            </span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 18, color: SUBTLE }}>
              now
            </span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 23, lineHeight: 1.55, color: MUTED }}>
            🟢 Signal Analyst [SIM] — BUY HYPE
            <br />
            $100.00 @ $78.89
            <br />
            <span style={{ color: SUBTLE }}>
              whale accumulation + $1.2b volume confirmation
            </span>
          </div>
        </Panel>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 8: pnl ---------- */

const Pnl: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const progress = interpolate(frame, [10, 110], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const pnl = 4.1 * progress;
  const equity = 1000 + 41.2 * progress;

  const W = 1300;
  const H = 340;
  const N = 60;
  const pts = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const noise = Math.sin(i * 1.7) * 6 + Math.sin(i * 0.6) * 10;
    const y = H - 40 - t * 200 * progress - (t > 0.1 ? noise * t : 0);
    return `${(i / (N - 1)) * W},${Math.min(H - 10, Math.max(20, y))}`;
  }).join(" ");

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1400, opacity: s }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 40, marginBottom: 30 }}>
          <span style={{ fontFamily: MONO, fontSize: 96, fontWeight: 900, color: FG }}>
            ${equity.toFixed(2)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 56, fontWeight: 800, color: UP }}>
            +{pnl.toFixed(1)}%
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: 26,
              color: SUBTLE,
              letterSpacing: 4,
            }}
          >
            VERIFIED PNL · ONCHAIN RECEIPTS
          </span>
        </div>
        <Panel style={{ padding: 30 }}>
          <svg width={W} height={H}>
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={UP} stopOpacity="0.35" />
                <stop offset="100%" stopColor={UP} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline
              points={pts}
              fill="none"
              stroke={UP}
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#area)" />
          </svg>
        </Panel>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 9: feature blitz ---------- */

const FEATURES = [
  "telegram control — /pnl /pause /exit",
  "agent memory — learns every win + loss",
  "public decision trails",
  "bull vs bear debate on every position",
  "verified pnl leaderboard",
  "manage from claude or cursor (MCP)",
  "ERC-8004 identity + x402 payments",
];

const Blitz: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1150 }}>
        {FEATURES.map((f, i) => {
          const d = 4 + i * 11;
          const on = frame >= d;
          return (
            <div
              key={f}
              style={{
                display: "flex",
                gap: 24,
                alignItems: "center",
                marginBottom: 24,
                opacity: on ? 1 : 0,
                transform: `translateX(${on ? 0 : -40}px)`,
                transition: "none",
              }}
            >
              <span style={{ fontFamily: MONO, color: UP, fontSize: 36, fontWeight: 900 }}>✓</span>
              <span style={{ fontFamily: MONO, color: FG, fontSize: 40, fontWeight: 700 }}>{f}</span>
            </div>
          );
        })}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- scene 10: outro ---------- */

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 200 } });
  const b = spring({ frame: frame - 26, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 54,
            color: MUTED,
            letterSpacing: 6,
            opacity: a,
            marginBottom: 34,
          }}
        >
          your money never sleeps anymore.
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 110,
            fontWeight: 900,
            color: UP,
            letterSpacing: 8,
            opacity: b,
            transform: `scale(${0.92 + b * 0.08})`,
            textShadow: `0 0 80px ${UP}55`,
          }}
        >
          bowyer.app
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- timeline ---------- */

export const BowyerVideo: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Sequence durationInFrames={100}>
      <ColdOpen />
    </Sequence>
    <Sequence from={100} durationInFrames={130}>
      <Mandate />
    </Sequence>
    <Sequence from={230} durationInFrames={100}>
      <Sources />
    </Sequence>
    <Sequence from={330} durationInFrames={95}>
      <Venue />
    </Sequence>
    <Sequence from={425} durationInFrames={115}>
      <Deploy />
    </Sequence>
    <Sequence from={540} durationInFrames={260}>
      <Debate />
    </Sequence>
    <Sequence from={800} durationInFrames={200}>
      <Execution />
    </Sequence>
    <Sequence from={1000} durationInFrames={120}>
      <Pnl />
    </Sequence>
    <Sequence from={1120} durationInFrames={95}>
      <Blitz />
    </Sequence>
    <Sequence from={1215} durationInFrames={DURATION - 1215}>
      <Outro />
    </Sequence>
    <Scanlines />
  </AbsoluteFill>
);
