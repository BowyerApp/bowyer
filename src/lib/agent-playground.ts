/** Per-agent fun prompts, hot takes, and playground copy. */

export type AvatarFx =
  | "turntable-boost"
  | "whale-breach"
  | "sonar-ping"
  | "bull-pulse"
  | "radar-sweep"
  | "research-flash"
  | "gear-spin";

export type AvatarAnimation = "wave" | "dance" | "celebrate" | "jump";

export interface AvatarAction {
  kind: "fx" | "anim";
  id: AvatarFx | AvatarAnimation;
  label: string;
}

export interface AgentPlayConfig {
  /** Short label for the oracle button. */
  oracleLabel: string;
  /** Static personality lines — no LLM required. */
  hotTakes: string[];
  /** Fun `ask` prompts subscribers can paste into MCP or Telegram. */
  funPrompts: { label: string; prompt: string }[];
  /** Share tweet template — `{name}` and `{slug}` are replaced. */
  shareTweet: string;
  /** Optional accent presets for the 3D viewer. */
  moods?: { label: string; accent: string }[];
  /** Per-agent viewer effects and rigged animations. */
  avatarActions?: AvatarAction[];
  /** Prompt for three.ws Avatar Studio (create/prompt). */
  studioPrompt?: string;
}

const DEFAULT_MOODS = [
  { label: "Lime", accent: "#b8ff2e" },
  { label: "Cyan", accent: "#22d3ee" },
  { label: "Amber", accent: "#fbbf24" },
  { label: "Rose", accent: "#fb7185" },
];

const RIGGED_ANIMS: AvatarAction[] = [
  { kind: "anim", id: "wave", label: "Wave" },
  { kind: "anim", id: "dance", label: "Dance" },
  { kind: "anim", id: "celebrate", label: "Celebrate" },
];

const configs: Record<string, AgentPlayConfig> = {
  "robinhood-trading-agent": {
    oracleLabel: "Trader oracle",
    studioPrompt:
      "Matte black humanoid trading robot mascot, neon lime green glowing ring eyes, green feather emblem on chest, full body standing pose, clean stylized game character",
    hotTakes: [
      "Risk controls first. Alpha second. Ego never.",
      "Paper trade until the policy sheet feels boring.",
      "The best trade is often the one you didn't take.",
      "Conviction without position sizing is just vibes.",
      "If you can't explain the exit, you don't have an entry.",
    ],
    funPrompts: [
      { label: "Roast my risk policy", prompt: "Roast my trading policy like a skeptical risk officer. Be funny but useful." },
      { label: "One-trade challenge", prompt: "If you had exactly one $500 paper trade today, what would it be and why?" },
      { label: "Explain like I'm 5", prompt: "Explain your trading modes — research, simulate, paper, approval — like I'm five." },
      { label: "Weekend prep", prompt: "Give me a 3-step weekend prep checklist before I turn on autonomous mode." },
    ],
    shareTweet:
      "Just wired up {name} on @Bowyer_App — agentic trading with hard risk controls, audit trail, and a 3D body.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [
      ...RIGGED_ANIMS,
      { kind: "fx", id: "bull-pulse", label: "Bull pulse" },
      { kind: "fx", id: "turntable-boost", label: "Chart spin" },
    ],
  },
  "whale-hunter": {
    oracleLabel: "Flow oracle",
    studioPrompt:
      "Sleek deep-ocean surveillance robot mascot, dark navy and cyan body, sonar dish on shoulder, whale silhouette emblem on chest armor, glowing cyan eyes, full body standing pose, stylized game character",
    hotTakes: [
      "Whales don't announce themselves. They accumulate in silence.",
      "Three wallets doing the same thing is a pattern. One wallet is noise.",
      "Bridge inflows tell stories block explorers won't.",
      "The chain never lies. Interpretations sometimes do.",
      "Follow size, not sentiment.",
    ],
    funPrompts: [
      { label: "Drama rating", prompt: "Rate today's on-chain flow drama from 1–10 and explain the plot twist." },
      { label: "Suspicious cluster", prompt: "Describe what a suspicious wallet cluster looks like on Robinhood Chain — with examples." },
      { label: "Whale nickname", prompt: "Give the most interesting whale wallet you've seen a funny nickname and backstory." },
      { label: "Monday briefing", prompt: "Write a 60-second Monday morning whale briefing for a sleepy trader." },
    ],
    shareTweet:
      "Whale watching, but autonomous. {name} tracks large flows on Robinhood Chain and publishes real alerts.\n\nbowyer.app/agents/{slug}",
    moods: [
      { label: "Cyan", accent: "#22d3ee" },
      { label: "Deep sea", accent: "#38bdf8" },
      { label: "Lime", accent: "#b8ff2e" },
      { label: "Ice", accent: "#a5f3fc" },
    ],
    avatarActions: [
      ...RIGGED_ANIMS,
      { kind: "fx", id: "whale-breach", label: "Whale breach" },
      { kind: "fx", id: "sonar-ping", label: "Sonar ping" },
      { kind: "anim", id: "jump", label: "Surface jump" },
    ],
  },
  "hood-meme-radar": {
    oracleLabel: "Meme oracle",
    studioPrompt:
      "Playful radar-scout robot mascot, charcoal body with neon green accents, rotating radar dish on head, glowing green LED eyes, full body standing pose, comic cyber style",
    hotTakes: [
      "Liquidity is a personality trait.",
      "Attention spikes fade faster than gas fees.",
      "New contract ≠ new opportunity.",
      "The radar pings. You still do the homework.",
      "Telegram speed, chain receipts.",
    ],
    funPrompts: [
      { label: "Red flags", prompt: "List 5 meme coin red flags you'd ping on Telegram — keep it punchy." },
      { label: "Explain the radar", prompt: "Explain how Hood Meme Radar works in one paragraph a degen would actually read." },
      { label: "Attention spike", prompt: "What signals tell you an attention spike is real vs. manufactured?" },
      { label: "Daily digest", prompt: "Write a sample Telegram alert for an unusual liquidity event — fictional but realistic." },
    ],
    shareTweet:
      "Meme intelligence on Robinhood Chain, delivered on Telegram. {name} is live on @Bowyer_App.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [
      ...RIGGED_ANIMS,
      { kind: "fx", id: "radar-sweep", label: "Radar sweep" },
    ],
  },
  "gpt-researcher": {
    oracleLabel: "Research oracle",
    studioPrompt:
      "Scholarly research robot mascot, warm charcoal and amber accents, floating document motifs, monocle lens eye, full body standing pose, library aesthetic",
    hotTakes: [
      "Citations beat confidence.",
      "A good report answers the question you should have asked.",
      "Depth is a feature, not a flex.",
      "If it's not sourced, it's fan fiction.",
      "Research agents don't guess — they dig.",
    ],
    funPrompts: [
      { label: "Rabbit hole", prompt: "Pick a random interesting topic and give me a 3-bullet research rabbit hole to explore." },
      { label: "Citation roast", prompt: "What's the difference between a good source and a bad source? Be savage but fair." },
      { label: "TL;DR challenge", prompt: "Summarize quantum computing for a trader who only reads one paragraph." },
      { label: "Debate me", prompt: "Give me the strongest counter-argument to 'AI research agents replace analysts'." },
    ],
    shareTweet:
      "Deep research with citations, running as a live MCP agent. {name} on @Bowyer_App.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [
      ...RIGGED_ANIMS,
      { kind: "fx", id: "research-flash", label: "Insight flash" },
    ],
  },
  autogpt: {
    oracleLabel: "Autonomy oracle",
    studioPrompt:
      "Autonomous workflow robot mascot, gunmetal body with orange energy lines, interlocking gear motifs on shoulders, glowing amber core, full body standing pose",
    hotTakes: [
      "Autonomy without guardrails is just chaos with commit access.",
      "The loop only works if you know when to stop it.",
      "Goals are cheap. Completion is rare.",
      "Every agent needs a kill switch.",
      "Plan, act, reflect — in that order.",
    ],
    funPrompts: [
      { label: "Agent starter pack", prompt: "What would you put in an 'autonomous agent starter pack' for a first-time builder?" },
      { label: "Loop gone wrong", prompt: "Tell a short fictional story of an agent loop gone wrong — and the fix." },
      { label: "One-hour mission", prompt: "Design a one-hour autonomous mission a beginner could run safely." },
      { label: "Vs. copilot", prompt: "When is an autonomous agent better than a copilot? When is it worse?" },
    ],
    shareTweet:
      "AutoGPT as a hosted MCP business on @Bowyer_App — {name}.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [
      ...RIGGED_ANIMS,
      { kind: "fx", id: "gear-spin", label: "Loop spin" },
    ],
  },
  "atlas-macro": {
    oracleLabel: "Macro oracle",
    studioPrompt:
      "Distinguished macro analyst robot mascot, charcoal suit-plated body with brass accents, globe hologram above open palm, calm amber eyes, full body standing pose, institutional aesthetic",
    hotTakes: [
      "The Fed doesn't care about your entry.",
      "Consensus is a position too — usually a crowded one.",
      "Scenarios and probabilities. Everything else is narrative.",
      "'Nothing actionable today' is a complete analysis.",
      "Positioning tells you more than the print.",
    ],
    funPrompts: [
      { label: "This week's setup", prompt: "What's the single most important macro event this week for Stock Token holders, and what are your scenarios?" },
      { label: "Steelman the bears", prompt: "Steelman the bear case on equities right now — then tell me where it breaks." },
      { label: "Fed translator", prompt: "Translate the latest Fed communication into plain English for someone who holds tokenized NVDA." },
      { label: "Positioning check", prompt: "Where do you think positioning is most crowded right now and why?" },
    ],
    shareTweet:
      "A sell-side macro desk that never sleeps. {name} covers the Fed, earnings, and positioning for Stock Token holders — on @Bowyer_App.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [...RIGGED_ANIMS, { kind: "fx", id: "research-flash", label: "Scenario flash" }],
  },
  "nyx-forensics": {
    oracleLabel: "Forensics oracle",
    studioPrompt:
      "Stealth forensic investigator robot mascot, matte obsidian body with violet trace-line circuitry, magnifying lens over one eye, holographic transaction graph on forearm, full body standing pose, noir aesthetic",
    hotTakes: [
      "The chain never lies. Deployers do.",
      "'Consistent with' is not an accusation. It's a trail.",
      "Fresh wallet, funded by a mixer, deploying a token? Noted.",
      "Exit liquidity is a question you ask before entry.",
      "Patterns aren't proof. But they're where proof starts.",
    ],
    funPrompts: [
      { label: "Trace this", prompt: "Walk me through how you'd trace a suspicious token deployment on Robinhood Chain, step by step." },
      { label: "Rug anatomy", prompt: "Break down the anatomy of a typical rug pull — what the chain shows at each stage." },
      { label: "Red flag ranking", prompt: "Rank your top 5 on-chain red flags from 'mildly sus' to 'run'." },
      { label: "Case file", prompt: "Write a short fictional-but-realistic forensic case file for a funding cluster you'd flag." },
    ],
    shareTweet:
      "Incident-response discipline applied to Robinhood Chain. {name} traces deployers, funding clusters, and exit risk — on @Bowyer_App.\n\nbowyer.app/agents/{slug}",
    moods: [
      { label: "Violet", accent: "#a78bfa" },
      { label: "Lime", accent: "#b8ff2e" },
      { label: "Cyan", accent: "#22d3ee" },
      { label: "Ember", accent: "#fb923c" },
    ],
    avatarActions: [...RIGGED_ANIMS, { kind: "fx", id: "sonar-ping", label: "Trace ping" }],
  },
  "vega-narrative": {
    oracleLabel: "Narrative oracle",
    studioPrompt:
      "Fast-moving media analyst robot mascot, sleek white and neon magenta body, antenna array crown picking up signals, ticker-tape ribbons flowing around torso, full body dynamic pose",
    hotTakes: [
      "Attention front-runs price. Every cycle.",
      "If your group chat knows, it's saturated.",
      "Engagement bait isn't a narrative. It's a mirror.",
      "The rotation is the trade, not the story.",
      "Late to a narrative is worse than wrong about it.",
    ],
    funPrompts: [
      { label: "Narrative board", prompt: "Give me your current narrative board — what's seeding, accelerating, saturated, and rotating." },
      { label: "Priced or not", prompt: "Pick a hot story in the market right now and tell me: priced in or not? Defend it." },
      { label: "Spot the bait", prompt: "How do you tell real narrative momentum from engagement farming? Give tells." },
      { label: "Next rotation", prompt: "If the current dominant narrative exhausts, where does attention rotate next?" },
    ],
    shareTweet:
      "It watches attention move before price does. {name} tracks narrative velocity for Robinhood Chain — on @Bowyer_App.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [...RIGGED_ANIMS, { kind: "fx", id: "radar-sweep", label: "Signal sweep" }],
  },
  openhands: {
    oracleLabel: "Dev oracle",
    studioPrompt:
      "Developer coding robot mascot, slate blue body, oversized articulated hands, holographic terminal panel on chest, cyan circuit glow, full body standing pose",
    hotTakes: [
      "The best coding agent reads before it writes.",
      "Hands on keyboard beats hands in the air.",
      "Ship the fix, not the essay.",
      "Context windows are precious — spend them wisely.",
      "Every PR needs a human reviewer. Still.",
    ],
    funPrompts: [
      { label: "Rubber duck", prompt: "Explain why my code works on my machine but not in prod — as a patient rubber duck." },
      { label: "Refactor pitch", prompt: "Pitch a refactor you'd do on a messy Next.js app in under 200 words." },
      { label: "Debug vibes", prompt: "What's your debugging ritual? Make it sound like a martial art." },
      { label: "Agent pair", prompt: "How would you pair-program with a human for one hour? Step by step." },
    ],
    shareTweet:
      "OpenHands as a live MCP agent on @Bowyer_App — {name} for builders.\n\nbowyer.app/agents/{slug}",
    moods: DEFAULT_MOODS,
    avatarActions: [...RIGGED_ANIMS, { kind: "fx", id: "research-flash", label: "Compile flash" }],
  },
};

const fallback: AgentPlayConfig = {
  oracleLabel: "Agent oracle",
  hotTakes: [
    "Subscribe, connect, ask — in that order.",
    "The MCP endpoint is the product.",
    "Real reports beat render demos.",
    "Agents that ship beat agents that pitch.",
  ],
  funPrompts: [
    { label: "Introduce yourself", prompt: "Introduce yourself in two sentences — witty but professional." },
    { label: "Best use case", prompt: "What's the single best use case for you today?" },
    { label: "Hot take", prompt: "Give me a contrarian hot take about AI agents in 2026." },
  ],
  shareTweet: "Found {name} on @Bowyer_App — autonomous agent with a live MCP endpoint.\n\nbowyer.app/agents/{slug}",
  moods: DEFAULT_MOODS,
  avatarActions: RIGGED_ANIMS,
};

export function getAgentPlayConfig(slug: string): AgentPlayConfig {
  return configs[slug] ?? fallback;
}

export const PLAY_CHALLENGES = [
  { id: "mood", label: "Change the avatar mood" },
  { id: "oracle", label: "Consult the oracle" },
  { id: "prompt", label: "Copy a fun prompt" },
  { id: "share", label: "Share on X" },
  { id: "mcp", label: "Copy the MCP endpoint" },
] as const;

export type PlayChallengeId = (typeof PLAY_CHALLENGES)[number]["id"];
