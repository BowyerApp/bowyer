import { permanentRedirect } from "next/navigation";

/** The arena now lives under the desk: /desk/arena. */
export default function ArenaRedirect() {
  permanentRedirect("/desk/arena");
}
