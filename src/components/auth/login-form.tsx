"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ViewTabs, cn } from "@/components/blocks/primitives";
import { signIn, signUp } from "@/lib/auth-client";

type Mode = "in" | "up";

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese correo.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  INVALID_EMAIL: "Ese correo no es válido.",
};

export function LoginForm({ google, allowSignUp }: { google: boolean; allowSignUp: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const password = String(f.get("password"));
    setBusy(true);
    setError(undefined);
    const { error } =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(f.get("name")).trim() || email.split("@")[0] });
    if (error) {
      setError(ERRORS[error.code ?? ""] || error.message || `No se pudo continuar (${error.status}). Intenta de nuevo.`);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-[20px] font-medium">{mode === "in" ? "Hola de nuevo" : "Crea tu cuenta"}</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">
        {mode === "in" ? "Entra para ver tus materias, tareas y notas." : "Tu espacio académico, solo para ti."}
      </p>

      {allowSignUp ? (
        <ViewTabs
          views={[{ id: "in", label: "Iniciar sesión" }, { id: "up", label: "Crear cuenta" }]}
          value={mode}
          onChange={(m) => { setMode(m); setError(undefined); }}
        />
      ) : null}

      <form method="post" onSubmit={submit} className="mt-1 flex flex-col gap-3">
        {mode === "up" ? <Field name="name" label="Nombre" autoComplete="name" /> : null}
        <Field name="email" label="Correo" type="email" autoComplete="email" required />
        <Field
          name="password"
          label="Contraseña"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-10 items-center justify-center gap-2 rounded-full bg-accent text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "in" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      {google ? (
        <>
          <div className="my-4 flex items-center gap-3 text-[12px] text-faint">
            <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setBusy(true); signIn.social({ provider: "google", callbackURL: "/" }); }}
            className="flex h-10 w-full items-center justify-center rounded-full bg-pill text-[13.5px] transition-colors hover:bg-pill-hover disabled:opacity-60"
          >
            Continuar con Google
          </button>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, className, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[12.5px] text-muted">{label}</span>
      <input
        {...input}
        className="h-10 w-full rounded-[12px] border border-border bg-surface-2 px-3 text-[13.5px] outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}
