import { Phone } from 'lucide-react';
import { SUPPORT_LINES, SUPPORT_LINES_CHECKED_AT, SUPPORT_LINES_SOURCE_URL, YOUTH_SUPPORT_LINES } from '@/lib/kiriSafety';

function SupportLineList({ lines }) {
  return (
    <ul className="space-y-2! list-none! pl-0!">
      {lines.map((line) => (
        <li key={line.tel}>
          <a
            href={`tel:${line.tel.replace(/-/g, '')}`}
            className="flex min-h-11 items-center gap-3 rounded-lg bg-white/[0.055] p-3 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-kiri-gold"
          >
            <Phone className="w-5 h-5 shrink-0 text-kiri-gold" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">{line.name}</span>
              <span className="block text-xs text-kiri-fog">
                <span className="inline-block">{line.tel}</span>{'　'}
                {/* 「（通話料有料）」などの括弧書きが途中で割れないよう、まとまりごとに折り返す（UX P2-6） */}
                {line.hours.split(/(?=（)/).map((part) => <span key={part} className="inline-block">{part}</span>)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

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
      <p className="mb-3 text-xs text-kiri-fog">今すぐ危ないと感じるときは、迷わず119へ。</p>
      <SupportLineList lines={SUPPORT_LINES} />
      <h3 className="mt-3 mb-2 text-xs font-bold text-kiri-fog">18歳までの方へ</h3>
      <SupportLineList lines={YOUTH_SUPPORT_LINES} />
      <p className="mt-3 text-xs text-kiri-lilac-ink leading-relaxed">地域やIP電話によって、別の番号になる場合があります。つながらないときやSNSで相談したいときは、<a href={SUPPORT_LINES_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-kiri-gold underline underline-offset-2">厚生労働省の相談窓口案内</a>をご覧ください。</p>
      <p className="mt-1 text-[0.75rem] text-kiri-lilac-ink">窓口情報は{SUPPORT_LINES_CHECKED_AT.replace(/-/g, '/')}に厚生労働省の案内で確認しました。</p>
    </section>
  );
}
