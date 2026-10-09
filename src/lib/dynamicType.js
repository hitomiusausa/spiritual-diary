// iOS の「文字を大きく」（Dynamic Type）に、iOS アプリ（Capacitor の WKWebView）でだけ追従する。Web は変えない。
//
// しくみ: WKWebView では `font: -apple-system-body` の文字サイズが端末の設定で変わる（標準 = 17px）。
// その比で html の font-size（Web と同じ 16px が基準）を変えると、rem で組んだ文字（Tailwind の text-*）が
// 一緒に大きくなる。余白（Tailwind の --spacing）は目印のあるときだけ 4px に固定し（globals.css）、
// 画面ごと拡大されるのではなく、文字だけが大きくなるようにする。
// 夜の画面（ロック画面・同意・設定）を崩さないため、倍率は 100%〜135% に収める。
// 測り直し: 前景に戻ったとき（設定アプリで変えて戻る経路）と、前景のまま変わったとき（コントロールセンター）。
// 後者は body に置いた見えない測り用の要素（-apple-system-body）の大きさの変化を ResizeObserver で拾う。
// React 19 は body に外から足された要素をハイドレーションで読み飛ばす。
//
// head の同期スクリプトで最初の描画より前に反映する（あとから変えると文字が跳ねる）。
// Capacitor は window.Capacitor をページのスクリプトより先に注入するので、ここで判定できる。

// false にすると読み込まれず、iOS アプリも Web と同じ固定サイズに戻る。
export const DYNAMIC_TYPE_ENABLED = true;

export const IOS_DEFAULT_BODY_PX = 17;
export const BASE_ROOT_PX = 16;
export const DYNAMIC_TYPE_MIN_SCALE = 1;
export const DYNAMIC_TYPE_MAX_SCALE = 1.35;
export const DYNAMIC_TYPE_ATTR = "data-kiri-dynamic-type";
// この倍率以上（iOS の「さらに大きく」XXL = 124% から）は、狭い画面向けの組み方に切り替える目印も付ける
// （見出しを途中で折らない・ヒントを1列に・同意ボタンは入りきらなければ縦に。globals.css）。
export const DYNAMIC_TYPE_LARGE_SCALE = 1.2;
export const DYNAMIC_TYPE_LARGE_ATTR = "data-kiri-large-text";

// 端末の本文サイズ（px）→ html の font-size（px）。読めなければ null（何もしない）。
export function dynamicTypeRootPx(bodyPx) {
  const px = typeof bodyPx === "number" ? bodyPx : Number.NaN;
  if (!Number.isFinite(px) || px <= 0) return null;
  const scale = Math.min(DYNAMIC_TYPE_MAX_SCALE, Math.max(DYNAMIC_TYPE_MIN_SCALE, px / IOS_DEFAULT_BODY_PX));
  return Math.round(BASE_ROOT_PX * scale * 100) / 100;
}

// layout の <head> に入れる同期スクリプト。外部に依存せず、上の定数を埋め込む。
// 計算は dynamicTypeRootPx と同じ（テストで両方を確かめる）。失敗しても画面は止めない。
export const DYNAMIC_TYPE_BOOT_SCRIPT = `(function(){try{
var w=window,d=document,r=d.documentElement,C=w.Capacitor;
if(!(C&&C.isNativePlatform&&C.isNativePlatform()))return;
function apply(){
var p=d.createElement("span");p.style.font="-apple-system-body";p.style.position="absolute";p.style.visibility="hidden";
var host=d.body||r;host.appendChild(p);var px=parseFloat(w.getComputedStyle(p).fontSize);host.removeChild(p);
if(!(px>0))return;
var s=Math.min(${DYNAMIC_TYPE_MAX_SCALE},Math.max(${DYNAMIC_TYPE_MIN_SCALE},px/${IOS_DEFAULT_BODY_PX}));
r.style.fontSize=Math.round(${BASE_ROOT_PX}*s*100)/100+"px";r.setAttribute("${DYNAMIC_TYPE_ATTR}",String(Math.round(s*100)/100));
if(s>=${DYNAMIC_TYPE_LARGE_SCALE})r.setAttribute("${DYNAMIC_TYPE_LARGE_ATTR}","");else r.removeAttribute("${DYNAMIC_TYPE_LARGE_ATTR}");
}
apply();
d.addEventListener("visibilitychange",function(){if(d.visibilityState==="visible")apply();});
function watch(){if(!w.ResizeObserver||!d.body)return;
var q=d.createElement("span");q.setAttribute("aria-hidden","true");q.textContent="\u3042";
q.style.cssText="font:-apple-system-body;position:absolute;top:0;left:0;visibility:hidden;pointer-events:none";
d.body.appendChild(q);new w.ResizeObserver(function(){apply();}).observe(q);}
if(d.body)watch();else d.addEventListener("DOMContentLoaded",watch);
}catch(e){}})();`;
