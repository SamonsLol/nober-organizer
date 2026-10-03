import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Sesión de la petición actual (una sola consulta por petición). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Id del usuario con sesión; si no hay sesión, lleva a /login. */
export async function requireUserId() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user.id;
}
