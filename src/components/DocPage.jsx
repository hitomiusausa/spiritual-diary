import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DocPage({ title, updatedAt, children }) {
  return (
    <div className="min-h-screen kiri-shell p-4 py-8">
      <div className="max-w-2xl mx-auto kiri-card rounded-2xl p-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-kiri-lilac hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" />ホームへ戻る
        </Link>
        <h1 className="font-display text-xl font-bold text-white mb-1">{title}</h1>
        <p className="text-xs text-kiri-lilac mb-6">最終更新: {updatedAt}</p>
        <div className="space-y-5 text-sm text-white/90 leading-relaxed [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-kiri-gold [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
}
