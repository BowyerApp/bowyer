/**
 * BOWYER — "IT'S LIVE" hype trailer.
 * 1920x1080 @ 30fps, ~53s. ElevenLabs VO (vo.mp3) + generated pulse bed
 * (pulse.mp3). Scene cuts are timed to the narration.
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const LIVE_DURATION = 1780;

const BG = "#0a0d0c";
const CARD = "#101614";
const BORDER = "#1e2a26";
const FG = "#e8f4ef";
const MUTED = "#8aa39a";
const SUBTLE = "#5c736b";
const UP = "#2dd4a7";
const DOWN = "#f45d7e";
const GOLD = "#e8b04b";

const MONO = "'SF Mono', 'Menlo', 'Consolas', monospace";
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const WALLET = "0x305939b7601998a358baa1a3924cc4cd4f18e3fc";

const useAppear = (delay: number, damp = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: damp } });
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
    }}
  />
);

const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 4px)",
      opacity: 0.35,
    }}
  />
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
      boxShadow: `0 0 80px #10514108, inset 0 1px 0 rgba(255,255,255,0.03)`,
      ...style,
    }}
  >
    {children}
  </div>
);

/* Big centered statement with glitch-in. */
const Statement: React.FC<{ lines: { text: string; color?: string; size?: number }[]; stagger?: number }> = ({
  lines,
  stagger = 18,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ textAlign: "center", padding: "0 120px" }}>
        {lines.map((l, i) => {
          const d = i * stagger;
          const s = spring({ frame: frame - d, fps, config: { damping: 14, mass: 0.7 } });
          const flicker = frame - d < 8 && (frame - d) % 4 < 2 ? 0.3 : 1;
          return (
            <div
              key={i}
              style={{
                fontFamily: MONO,
                fontSize: l.size ?? 76,
                fontWeight: 900,
                letterSpacing: 6,
                lineHeight: 1.25,
                color: l.color ?? FG,
                opacity: Math.min(1, s * 1.2) * flicker,
                transform: `scale(${0.94 + s * 0.06})`,
                textShadow: l.color === UP ? `0 0 70px ${UP}66` : undefined,
                marginBottom: 18,
              }}
            >
              {l.text}
            </div>
          );
        })}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: wallet reveal with typing address. */
const WalletReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useAppear(4, 14);
  const chars = Math.max(0, Math.floor((frame - 18) * 2.2));
  const shown = WALLET.slice(0, chars);
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 86,
            fontWeight: 900,
            letterSpacing: 8,
            color: FG,
            opacity: s,
            marginBottom: 50,
          }}
        >
          SO WE GAVE IT A WALLET.
        </div>
        <Panel
          style={{
            display: "inline-block",
            padding: "30px 50px",
            border: `2px solid ${UP}55`,
            opacity: s,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 40, color: UP, fontWeight: 700 }}>
            {shown}
            {chars < WALLET.length && (
              <span style={{ opacity: frame % 14 < 7 ? 1 : 0 }}>▌</span>
            )}
          </span>
        </Panel>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: LIVE on Robinhood Chain. */
const LiveNow: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useAppear(4);
  const pulse = 1 + Math.sin(frame / 6) * 0.04;
  const rows = [
    ["MODE", "LIVE — REAL CAPITAL", UP],
    ["VENUE", "ROBINHOOD CHAIN", FG],
    ["BRAIN", "PREMIUM LLM + DESK DEBATE", FG],
    ["HUMAN OVERRIDE", "NONE. JUST A MANDATE.", GOLD],
  ] as const;
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26, marginBottom: 40, opacity: s }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              background: DOWN,
              display: "inline-block",
              transform: `scale(${pulse})`,
              boxShadow: `0 0 30px ${DOWN}`,
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 56, fontWeight: 900, color: FG, letterSpacing: 10 }}>
            LIVE RIGHT NOW
          </span>
        </div>
        {rows.map(([k, v, c], i) => {
          const d = 14 + i * 13;
          const rs = spring({
            frame: frame - d,
            fps: 30,
            config: { damping: 16 },
          });
          return (
            <Panel
              key={k}
              style={{
                padding: "26px 40px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                opacity: Math.min(1, rs * 1.2),
                transform: `translateX(${(1 - rs) * -90}px)`,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 26, color: SUBTLE, letterSpacing: 4, width: 380 }}>
                {k}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 36, color: c, fontWeight: 800 }}>{v}</span>
            </Panel>
          );
        })}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: the debate. */
const DebateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bull = spring({ frame: frame - 6, fps, config: { damping: 15 } });
  const bear = spring({ frame: frame - 16, fps, config: { damping: 15 } });
  const verdict = spring({ frame: frame - 100, fps, config: { damping: 13 } });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ width: 1500 }}>
        <div
          style={{
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 34,
            letterSpacing: 12,
            color: SUBTLE,
            fontWeight: 800,
            marginBottom: 40,
          }}
        >
          EVERY TRADE GETS ARGUED FIRST
        </div>
        <div style={{ display: "flex", gap: 30 }}>
          <Panel
            style={{
              flex: 1,
              padding: 44,
              border: `3px solid ${UP}66`,
              opacity: bull,
              transform: `translateX(${(1 - bull) * -140}px) rotate(${(1 - bull) * -2}deg)`,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 60, fontWeight: 900, color: UP }}>▲ BULL</div>
            <div style={{ fontFamily: SANS, fontSize: 28, color: MUTED, marginTop: 18 }}>
              argues the strongest case FOR
            </div>
          </Panel>
          <Panel
            style={{
              flex: 1,
              padding: 44,
              border: `3px solid ${DOWN}66`,
              opacity: bear,
              transform: `translateX(${(1 - bear) * 140}px) rotate(${(1 - bear) * 2}deg)`,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 60, fontWeight: 900, color: DOWN }}>▼ BEAR</div>
            <div style={{ fontFamily: SANS, fontSize: 28, color: MUTED, marginTop: 18 }}>
              argues everything that can go wrong
            </div>
          </Panel>
        </div>
        <Panel
          style={{
            marginTop: 30,
            padding: "38px 44px",
            border: `3px solid ${GOLD}77`,
            textAlign: "center",
            opacity: verdict,
            transform: `translateY(${(1 - verdict) * 60}px) scale(${0.95 + verdict * 0.05})`,
            boxShadow: `0 0 100px ${GOLD}22`,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 44, fontWeight: 900, color: GOLD, letterSpacing: 6 }}>
            ⚖ THE RISK OFFICER MAKES THE CALL
          </span>
        </Panel>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: adaptive risk + kill switch. */
const AdaptiveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useAppear(2);
  // budget bar breathes up then gets slammed by the kill switch
  const budget = interpolate(frame, [10, 80, 125, 170], [0.5, 1.35, 1.35, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const killAt = 170;
  const kill = spring({ frame: frame - killAt, fps, config: { damping: 10, mass: 0.6 } });
  const shake = frame >= killAt && frame < killAt + 12 ? Math.sin(frame * 3) * 6 : 0;
  return (
    <AbsoluteFill
      style={{
        background: BG,
        justifyContent: "center",
        alignItems: "center",
        transform: `translateX(${shake}px)`,
      }}
    >
      <Grid />
      <div style={{ width: 1300, opacity: s }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 34,
            letterSpacing: 12,
            color: SUBTLE,
            fontWeight: 800,
            marginBottom: 44,
            textAlign: "center",
          }}
        >
          THE RAILS LEARN. WINS EARN ROPE. LOSSES LOSE IT.
        </div>
        <Panel style={{ padding: 50 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontFamily: MONO, fontSize: 28, color: MUTED }}>RISK BUDGET</span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 34,
                fontWeight: 900,
                color: budget > 1 ? UP : DOWN,
              }}
            >
              {budget.toFixed(2)}x
            </span>
          </div>
          <div
            style={{
              height: 46,
              borderRadius: 10,
              border: `2px solid ${BORDER}`,
              background: BG,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(budget / 2) * 100}%`,
                height: "100%",
                background: budget > 1 ? UP : DOWN,
                boxShadow: `0 0 50px ${budget > 1 ? UP : DOWN}77`,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: 40,
              marginTop: 34,
              fontFamily: MONO,
              fontSize: 25,
              color: SUBTLE,
            }}
          >
            <span>stops tighten on losses</span>
            <span>·</span>
            <span>winners get room to run</span>
            <span>·</span>
            <span>breakeven lock at +8%</span>
          </div>
        </Panel>
        {frame >= killAt && (
          <div
            style={{
              textAlign: "center",
              marginTop: 40,
              opacity: kill,
              transform: `scale(${0.7 + kill * 0.3}) rotate(-3deg)`,
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontFamily: MONO,
                fontSize: 72,
                fontWeight: 900,
                letterSpacing: 10,
                color: DOWN,
                border: `6px solid ${DOWN}`,
                borderRadius: 14,
                padding: "16px 48px",
                textShadow: `0 0 60px ${DOWN}`,
                boxShadow: `0 0 120px ${DOWN}44`,
              }}
            >
              KILL SWITCH ARMED
            </span>
          </div>
        )}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: public wallet tracker. */
const PublicWallet: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useAppear(4, 14);
  const glow = 1 + Math.sin(frame / 8) * 0.15;
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ textAlign: "center", width: 1500 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 70,
            fontWeight: 900,
            color: FG,
            letterSpacing: 8,
            marginBottom: 44,
            opacity: s,
          }}
        >
          THE WALLET IS PUBLIC.
        </div>
        <Panel
          style={{
            display: "inline-block",
            padding: "36px 54px",
            border: `3px solid ${UP}`,
            boxShadow: `0 0 ${90 * glow}px ${UP}44`,
            opacity: s,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 38, color: UP, fontWeight: 800 }}>{WALLET}</div>
          <div style={{ fontFamily: MONO, fontSize: 24, color: SUBTLE, marginTop: 16 }}>
            robinhoodchain.blockscout.com — every fill, forever
          </div>
        </Panel>
        <div
          style={{
            marginTop: 44,
            fontFamily: MONO,
            fontSize: 34,
            color: MUTED,
            letterSpacing: 4,
            opacity: useAppear(40),
          }}
        >
          TRACK IT. VERIFY IT. FRONT-RUN IT IF YOU CAN.
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: receipts stamps. */
const Receipts: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamps = ["NO SCREENSHOTS", "NO TRUST ME BRO", "THE CHAIN IS THE RECORD"];
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <Grid />
      <div style={{ textAlign: "center" }}>
        {stamps.map((t, i) => {
          const d = 8 + i * 26;
          const st = spring({ frame: frame - d, fps, config: { damping: 9, mass: 0.5 } });
          const last = i === stamps.length - 1;
          return (
            <div
              key={t}
              style={{
                fontFamily: MONO,
                fontSize: last ? 84 : 64,
                fontWeight: 900,
                letterSpacing: 8,
                color: last ? UP : FG,
                opacity: Math.min(1, st * 1.3),
                transform: `scale(${0.6 + st * 0.4}) rotate(${(1 - st) * (i % 2 ? 4 : -4)}deg)`,
                marginBottom: 40,
                textShadow: last ? `0 0 80px ${UP}66` : undefined,
              }}
            >
              {t}
            </div>
          );
        })}
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* Scene: outro. */
const LiveOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const b = spring({ frame: frame - 60, fps, config: { damping: 200 } });
  const c = spring({ frame: frame - 130, fps, config: { damping: 14 } });
  const fade = interpolate(frame, [250, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", opacity: fade }}>
      <Grid />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 150,
            fontWeight: 900,
            letterSpacing: 30,
            color: FG,
            opacity: a,
            transform: `scale(${0.9 + a * 0.1})`,
            textShadow: `0 0 90px ${UP}55`,
          }}
        >
          BOWYER
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: MONO,
            fontSize: 38,
            color: MUTED,
            letterSpacing: 8,
            opacity: b,
          }}
        >
          DEPLOY YOUR OWN AGENT IN 2 MINUTES
        </div>
        <div
          style={{
            marginTop: 50,
            fontFamily: MONO,
            fontSize: 66,
            fontWeight: 900,
            color: UP,
            letterSpacing: 10,
            opacity: c,
            transform: `scale(${0.9 + c * 0.1})`,
            textShadow: `0 0 80px ${UP}77`,
          }}
        >
          THE FUTURE DOESN&apos;T ASK PERMISSION.
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------- timeline (synced to the 50s VO) ---------- */

export const BowyerLive: React.FC = () => {
  const frame = useCurrentFrame();
  const musicVolume = interpolate(frame, [0, 30, LIVE_DURATION - 90, LIVE_DURATION], [0, 0.32, 0.32, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Audio src={staticFile("vo.mp3")} />
      <Audio src={staticFile("pulse.mp3")} loop volume={musicVolume} />
      <Sequence durationInFrames={118}>
        <Statement
          lines={[
            { text: "THEY SAID AI COULD NEVER BE TRUSTED", size: 72 },
            { text: "WITH REAL MONEY.", size: 72, color: DOWN },
          ]}
        />
      </Sequence>
      <Sequence from={118} durationInFrames={96}>
        <WalletReveal />
      </Sequence>
      <Sequence from={214} durationInFrames={258}>
        <LiveNow />
      </Sequence>
      <Sequence from={472} durationInFrames={208}>
        <DebateScene />
      </Sequence>
      <Sequence from={680} durationInFrames={247}>
        <AdaptiveScene />
      </Sequence>
      <Sequence from={927} durationInFrames={152}>
        <PublicWallet />
      </Sequence>
      <Sequence from={1079} durationInFrames={169}>
        <Receipts />
      </Sequence>
      <Sequence from={1248} durationInFrames={LIVE_DURATION - 1248}>
        <LiveOutro />
      </Sequence>
      <Scanlines />
    </AbsoluteFill>
  );
};
