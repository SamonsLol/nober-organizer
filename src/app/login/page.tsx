import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { googleEnabled } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { hasDatabase } from "@/lib/db/prisma";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: `Iniciar sesión · ${APP_NAME}` };

export default async function LoginPage() {
  // Sin base de datos (modo prototipo) no hay cuentas: directo a la app.
  if (!hasDatabase() || (await getSession())) redirect("/");

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-[13px] bg-accent text-white">
            <GraduationCap className="size-5" />
          </span>
          <span className="text-[18px] font-semibold tracking-[-0.01em]">{APP_NAME}</span>
        </div>
        <div className="glass p-6 sm:p-7">
          <LoginForm google={googleEnabled} allowSignUp={process.env.AUTH_DISABLE_SIGNUP !== "true"} />
        </div>
      </div>
    </div>
  );
}
