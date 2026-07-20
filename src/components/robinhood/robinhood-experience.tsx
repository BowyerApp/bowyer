"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants,
} from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";

/**
 * Premium launch experience for the Robinhood Agentic Trading announcement.
 * Editorial layout, restrained motion, all animations respect
 * prefers-reduced-motion via useReducedMotion.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ============================== hero ============================== */

const heroStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const riseIn: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function RobinhoodHero() {
  const reduced = useReducedMotion();
  return (
    <section className="relative mx-auto max-w-[1220px] px-6 pt-20 lg:px-10 lg:pt-28">
      <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,520px)_1fr]">
        <motion.div
          variants={reduced ? undefined : heroStagger}
          initial={reduced ? undefined : "hidden"}
          animate={reduced ? undefined : "show"}
        >
          <motion.p
            variants={riseIn}
            className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle"
          >
            Robinhood <span className="text-accent">×</span> your agent{" "}
            <span className="text-accent">×</span> BOWYER
          </motion.p>

          <h1 className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[54px] lg:text-[58px]">
            <motion.span variants={riseIn} className="block text-foreground">
              Robinhood is open to AI agents.
            </motion.span>
            <motion.span
              variants={riseIn}
              transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
              className="block text-accent"
            >
              Give your AI a workforce.
            </motion.span>
          </h1>

          <motion.p
            variants={riseIn}
            className="mt-7 max-w-[440px] text-[15.5px] leading-[1.75] text-muted"
          >
            Robinhood&apos;s Trading MCP gives AI agents execution. BOWYER adds autonomous
            businesses for research, macro intelligence, token radar, and market analysis.
            Connect both and give one agent an entire workforce.
          </motion.p>

          <motion.div variants={riseIn} className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/marketplace"
              className="group flex h-12 items-center gap-2.5 rounded-[10px] bg-accent px-7 text-[14px] font-semibold text-background transition-transform duration-200 hover:-translate-y-0.5"
            >
              Hire Your Workforce
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2.25}
              />
            </Link>
            <a
              href="https://robinhood.com/us/en/support/articles/agentic-trading-overview/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-foreground"
            >
              Read Robinhood&apos;s Docs
              <ArrowUpRight className="size-4" strokeWidth={1.75} />
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          initial={reduced ? undefined : { opacity: 0, scale: 0.98 }}
          animate={reduced ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.35 }}
        >
          <InfrastructureVisual />
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------- infrastructure visual ---------------- */

const MODULES = ["Research", "Macro", "Token Radar", "Market Intelligence"];

/** Pulse that travels along an SVG path every few seconds. */
function PathPulse({ path, delay = 0 }: { path: string; delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.circle
      r="2.5"
      fill="#c8ff00"
      initial={{ offsetDistance: "0%", opacity: 0 }}
      animate={{ offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
      transition={{
        duration: 1.6,
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 2.4,
        delay,
      }}
      style={{ offsetPath: `path("${path}")` }}
    />
  );
}

function InfrastructureVisual() {
  // Geometry on a 560x540 canvas.
  // Central robot portrait: rect(196,120 → 364,330) · nodes top corners · modules row y=470
  const linkRobinhood = "M 236 132 L 95 92";
  const linkBowyer = "M 324 132 L 465 92";
  const moduleLinks = [
    "M 236 310 C 190 390, 70 410, 70 470",
    "M 262 330 C 248 400, 210 425, 210 470",
    "M 298 330 C 312 400, 350 425, 350 470",
    "M 324 310 C 370 390, 490 410, 490 470",
  ];

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      {/* very subtle ambient light */}
      <div className="pointer-events-none absolute left-1/2 top-[40%] h-[340px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.05] blur-[100px]" />

      <svg
        viewBox="0 0 560 540"
        className="relative w-full"
        role="img"
        aria-label="Diagram: your agent connects to Robinhood for execution and BOWYER for intelligence"
      >
        {/* connection lines */}
        {[linkRobinhood, linkBowyer, ...moduleLinks].map((d) => (
          <path key={d} d={d} fill="none" stroke="#232623" strokeWidth="1" />
        ))}

        {/* pulses */}
        <PathPulse path={linkRobinhood} delay={0.5} />
        <PathPulse path={linkBowyer} delay={1.8} />
        <PathPulse path={moduleLinks[1]} delay={3.1} />
        <PathPulse path={moduleLinks[2]} delay={4.2} />

        {/* Robinhood node */}
        <g>
          <rect x="20" y="52" width="150" height="60" rx="10" fill="#0c0d0c" stroke="#262926" />
          <text x="95" y="79" textAnchor="middle" fill="#f2f2f0" fontSize="13" fontWeight="600" letterSpacing="0.06em">
            ROBINHOOD
          </text>
          <text x="95" y="97" textAnchor="middle" fill="#6b6f6a" fontSize="9.5" letterSpacing="0.18em">
            EXECUTION
          </text>
        </g>

        {/* BOWYER node */}
        <g>
          <rect x="390" y="52" width="150" height="60" rx="10" fill="#0c0d0c" stroke="#3d4a1e" />
          <text x="465" y="79" textAnchor="middle" fill="#c8ff00" fontSize="13" fontWeight="600" letterSpacing="0.06em">
            BOWYER
          </text>
          <text x="465" y="97" textAnchor="middle" fill="#6b6f6a" fontSize="9.5" letterSpacing="0.18em">
            INTELLIGENCE
          </text>
        </g>

        {/* module nodes */}
        {MODULES.map((label, i) => {
          const cx = [70, 210, 350, 490][i];
          const w = Math.max(label.length * 7.2 + 28, 76);
          return (
            <g key={label}>
              <rect x={cx - w / 2} y={470} width={w} height={38} rx="8" fill="#0c0d0c" stroke="#232623" />
              <circle cx={cx - w / 2 + 14} cy={489} r="2.5" fill="#c8ff00" />
              <text x={cx + 6} y={493} textAnchor="middle" fill="#a3a7a1" fontSize="10.5" letterSpacing="0.04em">
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* central robot portrait — positioned in SVG coordinate space via percentages */}
      <div
        className="absolute overflow-hidden rounded-2xl border border-[#242724] bg-[#0a0b0a] shadow-[0_0_70px_-18px_rgba(200,255,0,0.28)]"
        style={{ left: "35%", top: "22.2%", width: "30%", height: "38.9%" }}
      >
        <Image
          src="/images/robinhood/robot-hero.png"
          alt="BOWYER robot"
          fill
          sizes="(max-width: 1024px) 40vw, 220px"
          className="object-cover"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
        <p className="absolute inset-x-0 bottom-2.5 text-center text-[9.5px] font-medium uppercase tracking-[0.22em] text-white/70">
          Your agent
        </p>
      </div>
    </div>
  );
}

/* ============================== proof strip ============================== */

const STRIP = [
  ["4", "Businesses live"],
  ["24/7", "Intelligence"],
  ["MCP", "Native"],
  ["4663", "Robinhood Chain"],
];

export function ProofStrip() {
  const reduced = useReducedMotion();
  return (
    <motion.section
      initial={reduced ? undefined : { opacity: 0, y: 14 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="mx-auto mt-24 max-w-[1220px] px-6 lg:px-10"
    >
      <div className="grid grid-cols-2 border-y border-white/[0.07] lg:grid-cols-4">
        {STRIP.map(([value, label], i) => (
          <div
            key={label}
            className={`flex flex-col items-center gap-1 py-8 ${
              i > 0 ? "border-l border-white/[0.07]" : ""
            } ${i === 2 ? "max-lg:border-l-0" : ""}`}
          >
            <p className="text-[26px] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
              {value}
            </p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">{label}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

/* ============================== equation ============================== */

function EquationCard({
  label,
  title,
  items,
  accent,
  from,
}: {
  label: string;
  title: string;
  items: string[];
  accent?: boolean;
  from: "left" | "right";
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? undefined : { opacity: 0, x: from === "left" ? -28 : 28 }}
      whileInView={reduced ? undefined : { opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`rounded-xl border p-8 lg:p-10 ${
        accent ? "border-accent/25 bg-accent/[0.03]" : "border-white/[0.09] bg-white/[0.015]"
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-[0.2em] ${
          accent ? "text-accent" : "text-subtle"
        }`}
      >
        {label}
      </p>
      <p className="mt-2.5 text-[24px] font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3 text-[14px] text-muted">
            <span className={`size-1 rounded-full ${accent ? "bg-accent" : "bg-white/30"}`} />
            {item}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function EquationSection() {
  const reduced = useReducedMotion();
  return (
    <section className="mx-auto mt-36 max-w-[1220px] px-6 lg:px-10">
      <motion.h2
        initial={reduced ? undefined : { opacity: 0, y: 16 }}
        whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: EASE }}
        className="text-center text-[13px] font-semibold uppercase tracking-[0.3em] text-subtle"
      >
        Execution <span className="mx-2 text-accent">+</span> Intelligence
      </motion.h2>

      <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-[1fr_64px_1fr] lg:gap-0">
        <EquationCard
          from="left"
          label="Robinhood"
          title="Trading MCP"
          items={[
            "Portfolio access",
            "Quotes and positions",
            "Order execution",
            "User-controlled account",
          ]}
        />

        {/* connector */}
        <div className="relative hidden items-center justify-center lg:flex">
          <motion.div
            initial={reduced ? undefined : { scaleX: 0 }}
            whileInView={reduced ? undefined : { scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
            className="h-px w-full origin-left bg-[#2a2d29]"
          />
          {!reduced && (
            <motion.span
              initial={{ left: "0%", opacity: 0 }}
              whileInView={{ left: ["0%", "92%"], opacity: [0, 1, 0] }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: "easeInOut", delay: 1.1 }}
              className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent"
            />
          )}
        </div>

        <EquationCard
          from="right"
          accent
          label="BOWYER"
          title="Autonomous Businesses"
          items={["Research", "Macro reports", "Token radar", "Market intelligence"]}
        />
      </div>

      <motion.p
        initial={reduced ? undefined : { opacity: 0 }}
        whileInView={reduced ? undefined : { opacity: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.4 }}
        className="mt-12 text-center text-[17px] text-muted"
      >
        One agent. Two MCP servers.{" "}
        <span className="text-foreground">A complete trading stack.</span>
      </motion.p>
    </section>
  );
}

/* ============================== marketplace preview ============================== */

const PRODUCTS = [
  {
    href: "/agents/robinhood-trading-agent",
    name: "Robinhood Trading Agent",
    line: "Daily trading briefings with confidence scores.",
  },
  {
    href: "/agents/whale-hunter",
    name: "Whale Hunter",
    line: "Large-transfer surveillance on Robinhood Chain.",
  },
  {
    href: "/agents/castles-trading",
    name: "Macro Reports",
    line: "Creator-run daily macro radar for traders.",
  },
  {
    href: "/agents/hood-meme-radar",
    name: "Token Radar",
    line: "On-chain scanner for new tokens and risk flags.",
  },
];

export function MarketplacePreview() {
  const reduced = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <section className="mx-auto mt-36 max-w-[1220px] px-6 lg:px-10">
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 16 }}
        whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <h2 className="text-[32px] font-semibold tracking-[-0.025em] text-foreground sm:text-[40px]">
          Build your workforce.
        </h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          Subscribe to creator-built autonomous businesses and connect them to the same
          agent.
        </p>
      </motion.div>

      <div ref={constraintsRef} className="mt-12 overflow-hidden">
        <motion.div
          ref={rowRef}
          drag={reduced ? false : "x"}
          dragConstraints={constraintsRef}
          dragElastic={0.08}
          className="flex cursor-grab gap-5 active:cursor-grabbing max-lg:overflow-x-auto max-lg:pb-4 lg:cursor-grab"
        >
          {PRODUCTS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={reduced ? undefined : { opacity: 0, y: 20 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.08 }}
              className="shrink-0 basis-[280px] sm:basis-[300px]"
            >
              <Link
                href={p.href}
                draggable={false}
                className="group relative block h-full rounded-xl border border-white/[0.09] bg-[#0b0c0a] p-7 transition-all duration-200 hover:-translate-y-1 hover:border-accent/35"
              >
                {/* subtle inner light on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(ellipse_at_top,rgba(200,255,0,0.06),transparent_60%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                <div className="relative">
                  <span className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.16em] text-subtle">
                    <span className="size-1.5 rounded-full bg-accent" />
                    Live
                  </span>
                  <p className="mt-16 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                    {p.name}
                  </p>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{p.line}</p>
                  <p className="mt-7 flex items-center gap-1.5 text-[12.5px] font-medium text-subtle transition-colors group-hover:text-accent">
                    View business <ArrowRight className="size-3.5" strokeWidth={2} />
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ============================== setup steps ============================== */

const STEPS = [
  {
    n: "01",
    title: "Connect Robinhood",
    body: "Add Robinhood's Trading MCP to your preferred MCP-compatible agent.",
  },
  {
    n: "02",
    title: "Choose businesses",
    body: "Subscribe to the intelligence your strategy needs.",
  },
  {
    n: "03",
    title: "Add both servers",
    body: "One agent now has execution from Robinhood and intelligence from BOWYER.",
  },
];

function SetupStep({ n, title, body }: { n: string; title: string; body: string }) {
  const ref = useRef<HTMLLIElement>(null);
  const active = useInView(ref, { margin: "-50% 0px -50% 0px" });
  return (
    <li ref={ref} className="flex gap-8 py-14 first:pt-4 last:pb-4 lg:gap-14">
      <span
        className={`font-mono text-[52px] font-semibold leading-none tracking-[-0.03em] transition-colors duration-500 lg:text-[72px] ${
          active ? "text-accent" : "text-white/[0.13]"
        }`}
      >
        {n}
      </span>
      <div className="pt-2 lg:pt-4">
        <p
          className={`text-[22px] font-semibold tracking-[-0.02em] transition-colors duration-500 lg:text-[26px] ${
            active ? "text-foreground" : "text-white/40"
          }`}
        >
          {title}
        </p>
        <p
          className={`mt-2.5 max-w-[400px] text-[14.5px] leading-relaxed transition-colors duration-500 ${
            active ? "text-muted" : "text-white/25"
          }`}
        >
          {body}
        </p>
      </div>
    </li>
  );
}

export function SetupSteps() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start center", "end center"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });

  return (
    <section className="mx-auto mt-36 max-w-[1220px] px-6 lg:px-10">
      <motion.p
        initial={reduced ? undefined : { opacity: 0, y: 14 }}
        whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: EASE }}
        className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle"
      >
        Setup
      </motion.p>

      <div ref={sectionRef} className="relative mt-6">
        {/* progress line */}
        <div className="absolute bottom-6 left-[26px] top-6 hidden w-px bg-white/[0.08] lg:left-[35px] lg:block">
          <motion.div
            className="w-full origin-top bg-accent"
            style={{ scaleY: reduced ? 1 : progress, height: "100%" }}
          />
        </div>
        <ol className="relative">
          {STEPS.map((s) => (
            <SetupStep key={s.n} {...s} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ============================== final cta ============================== */

export function FinalCta() {
  const reduced = useReducedMotion();
  return (
    <section className="relative mx-auto mt-40 max-w-[1220px] px-6 pb-44 lg:px-10">
      {/* subtle radial glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[110px]" />

      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 20 }}
        whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.65, ease: EASE }}
        className="relative py-20 text-center lg:py-28"
      >
        <h2 className="text-[38px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[52px]">
          <span className="block text-foreground">Your AI shouldn&apos;t trade alone.</span>
          <span className="block text-accent">Give it a workforce.</span>
        </h2>

        <div className="mt-12 flex justify-center">
          <Link
            href="/marketplace"
            className="group relative flex h-[52px] items-center gap-2.5 overflow-hidden rounded-[10px] bg-accent px-9 py-4 text-[14.5px] font-semibold text-background transition-transform duration-200 hover:-translate-y-0.5"
          >
            {/* slow light sweep every 6s */}
            {!reduced && (
              <motion.span
                className="pointer-events-none absolute inset-y-0 w-16 -skew-x-12 bg-white/35"
                initial={{ left: "-25%" }}
                animate={{ left: ["-25%", "115%"] }}
                transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity, repeatDelay: 6 }}
              />
            )}
            <span className="relative">Browse the Marketplace</span>
            <ArrowRight className="relative size-4" strokeWidth={2.25} />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
