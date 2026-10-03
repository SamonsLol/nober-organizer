import Link from "next/link";
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="text-[44px]">🧭</div>
        <h1 className="mt-2 text-[26px] font-medium">Página no encontrada</h1>
        <Link href="/" className="mt-3 inline-block text-[13px] text-accent-text hover:underline">Volver al inicio</Link>
      </div>
    </div>
  );
}
