import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

/** Pantallas que se construyen en la siguiente iteración del prototipo. */
export function ComingNext({ emoji, title, subtitle, items }: { emoji: string; title: string; subtitle: string; items: string[] }) {
  return (
    <div className="pb-16">
      <PageHeader emoji={emoji} title={title} subtitle={subtitle} />
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <div className="glass max-w-[560px] p-6">
          <p className="text-[13.5px] text-muted">Esta pantalla llega en la siguiente iteración del prototipo. Tendrá:</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px]">
            {items.map((i) => (
              <li key={i} className="flex gap-2"><span className="text-faint">·</span>{i}</li>
            ))}
          </ul>
          <Link href="/" className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-accent-text hover:underline">
            <ArrowLeft className="size-3.5" /> Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
