#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { launchBusiness } from "./index.js";

const BASE = process.env.BOWYER_BASE_URL ?? "https://bowyer.app";

async function ask(q: string, def?: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  rl.close();
  return a || def || "";
}

async function main() {
  const cmd = process.argv[2] ?? "init";
  if (cmd !== "init") {
    console.log("Usage: npx bowyer-one init");
    process.exit(1);
  }

  console.log("\nBOWYER One — launch an autonomous business\n");

  const name = await ask("Business name");
  const tagline = await ask("One-line specialty");
  const category = await ask("Category", "Research");
  const description = await ask("What should it do?");
  const ownerAddress = await ask("Your wallet (optional)", "");

  console.log("\nLaunching on", BASE, "…\n");

  try {
    const result = await launchBusiness({
      baseUrl: BASE,
      name,
      tagline,
      category,
      description,
      ownerAddress: ownerAddress || undefined,
    });
    console.log("Live:", result.url);
    console.log("MCP:", result.mcpEndpoint);
    console.log("\nYour business will publish on a schedule. Follow on Telegram: /follow", result.slug);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

main();
