import { Phone } from 'lucide-react';
import { SUPPORT_LINES, SUPPORT_LINES_CHECKED_AT } from '@/lib/kiriSafety';

// 危機の言葉を拾ったときに、読み解きより先に出す相談窓口カード。
export default function SupportCard({ compact = false }) {
  return (
    <section aria-label="相談窓口" className="kiri-card-strong rounded-xl p-4 text-white border border-kiri-gold/40">
      {!compact && (
        <>
          <h2 className="font-display text-base font-bold text-kiri-gold mb-2">ひとりで抱えなくていいよ</h2>
          <p className="kiri-voice text-sm text-kiri-fog mb-3">
            とても苦しい気持ちを書いてくれたみたい。話を聞いてくれる人の声に、いつ頼ってもいいからね。
          </p>
        </>
      )}
      <ul className="space-y-2! list-none! pl-0!">
        {SUPPORT_LINES.map((line) => (
          <li key={line.tel}>
            <a
              href={`tel:${line.tel.replace(/-/g, '')}`}
              className="flex items-center gap-3 rounded-lg bg-white/10 p-3 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-kiri-gold"
            >
              <Phone className="w-5 h-5 shrink-0 text-kiri-gold" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold">{line.name}</span>
                <span className="block text-xs text-kiri-fog">{line.tel}　{line.hours}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-kiri-fog">今すぐ危ないと感じるときは、迷わず119へ。</p>
      <p className="mt-1 text-[11px] text-kiri-lilac/70">窓口情報は{SUPPORT_LINES_CHECKED_AT.replace(/-/g, '/')}に厚生労働省の案内で確認しました。</p>
    </section>
  );
}
