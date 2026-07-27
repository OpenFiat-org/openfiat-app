import { permanentRedirect } from "next/navigation";

export default function IdentityRedirect() {
  permanentRedirect("/account/identity");
}
