import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Root: Leitet serverseitig je nach Session weiter.
 * - Kunde eingeloggt  -> /assign
 * - Admin eingeloggt  -> /admin
 * - sonst             -> /login
 */
export default function Index() {
  // wird nie sichtbar, da SSR-Redirect
  return null;
}

export async function getServerSideProps({ req, res }) {
  const session = await getIronSession(req, res, sessionOptions);
  if (session?.admin) {
    return { redirect: { destination: "/admin", permanent: false } };
  }
  if (session?.customerId) {
    return { redirect: { destination: "/assign", permanent: false } };
  }
  return { redirect: { destination: "/login", permanent: false } };
}
