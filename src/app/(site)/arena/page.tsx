import { ArenaExperience } from "@/components/arena/arena-experience";
import { getArenaLiveData } from "@/lib/data/arena-live";

export const metadata = { title: "Arena" };
export const dynamic = "force-dynamic";

export default function ArenaPage() {
  const data = getArenaLiveData();
  return <ArenaExperience initial={data} />;
}
