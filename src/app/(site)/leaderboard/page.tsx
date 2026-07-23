import { permanentRedirect } from "next/navigation";

/** The leaderboard now lives under the desk: /desk/leaders. */
export default function LeaderboardRedirect() {
  permanentRedirect("/desk/leaders");
}
