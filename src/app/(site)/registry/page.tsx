import { permanentRedirect } from "next/navigation";

/** The registry now lives under the desk: /desk/registry. */
export default function RegistryRedirect() {
  permanentRedirect("/desk/registry");
}
