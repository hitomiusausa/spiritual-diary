# F-03 Safari / iOS 15.5向けCSSの追加確認

担当: `/root/audit_b_data`。2026-11-07。静的監査とメモリ内の変換プローブのみ。製品コード、ビルド設定、出力CSSは変更していない。

## 結論

**確認した現在の成果物では、重要な背景・文字・余白・モーダルが失われる高影響のfallback欠落は見つからなかった。** `color-mix()`や`@property`が残っていることだけを互換性不良とは判定しない。実際のCSSには旧構文の色と、カスタムプロパティ初期値のfallbackがある。

Tailwindの公式対象がSafari 16.4以降であることは変わらない。この結果はKiriの特定成果物の静的な確認であり、Tailwind全機能やSafari 15.5の全面動作保証ではない。[Tailwind互換性](https://tailwindcss.com/docs/compatibility)、[v4の移行ガイド](https://tailwindcss.com/docs/upgrade-guide)。

## 対象と方法

- `package.json`: browserslistにSafari/iOS 15.5以降が指定された状態を確認。
- `src/app/globals.css`: 文字、色、カード、霧、Dynamic Type、Safe Area、モーダルを読解。
- `out/_next/static/chunks/1m7ajx8i2i202.css`（274,041 bytes）と`2yf1g7gg1vccl.css`（188,916 bytes）: font-face中心の生成CSSを確認。
- `out/_next/static/chunks/3hsstwpzxfg1g.css`（42,345 bytes）: PostCSS ASTで全宣言・supports/media・property・重要selectorを抽出。
- インストール済みLightning CSS 1.30.2の`transform`を、読込んだCSSバッファに対して実行。ファイルへ書き戻していない。

## 具体的な根拠

| 対象 | 現在の成果物で確認できたこと | 判定 |
|---|---|---|
| `.bg-black\/60`等の黒い重ね面 | `background-color:#0009`があり、その後の`color-mix(in oklab,var(--color-black)60%,transparent)`は`@supports (color:color-mix(in lab, red, red))`内 | 15.5はmix側を使わず、旧構文の面が残る |
| `.bg-white\/\[0\.055\]`、`.bg-white\/10`等 | それぞれ`#ffffff0e`、`#ffffff1a`等のfallbackと、supports内のmixを併記 | 入力/内側カード/ボタン面の色がmix非対応だけで消える構造ではない |
| `.border-white\/10`、`.border-white\/15` | `#ffffff1a`、`#ffffff26`のfallbackあり | 境界線の旧構文を確認 |
| `.text-white\/90` | `color:#ffffffe6`のfallbackあり | 法務本文などの文字色を確認 |
| `::placeholder` | mix宣言はsupports内。実入力は`placeholder-kiri-lilac-ink`等の明示色を持つ | 現在の入力を読めなくする欠落は確認せず。将来、明示色なしの入力を追加する場合は別途確認 |
| `@property`初期値 | 46個のproperty登録に加え、先頭`@layer properties`のsupports内で`*,:before,:after,::backdrop`へ初期値を設定 | 15.5で登録が無視されても、spacing/shadow/ring等の初期値が単に未定義になる構造ではない |
| `.space-y-*`、padding/gap | `--spacing:.25rem`、`calc(var(--spacing)*N)`とreverse=0。大文字時はunlayered CSSで`--spacing:4px` | 役割を保つ通常の変数/calc。新しい三角関数等への依存はない |
| `.kiri-shell`、`.kiri-card`、`.kiri-card-strong`、`.kiri-button` | hex/rgba由来の背景、通常のradial-gradient、border、box-shadow | 根幹の夜色/面/文字を旧構文で保持 |
| `.kiri-paywall-sheet` | `linear-gradient(#2a2440 0%,#211c31 100%)` | 新しい色補間構文への依存なし |
| `.kiri-fog-orb`、`.kiri-rise`、`.kiri-hit:after` | 通常のtransform/opacity/blur、44pxの疑似要素 | 基本表示・タップ範囲を新しい@propertyアニメーションだけに依存しない |
| backdrop blur | `-webkit-backdrop-filter`と`backdrop-filter`を併記 | Safari向けprefixを確認 |
| `dialog.kiri-modal` | width/height/max-size/margin/border/colorの通常指定。背景色のutilityは上記fallbackあり | CSS側でモーダルが非表示になる新構文依存は確認せず |
| `.kiri-dialog-card` | `100vh`のmax-heightを先に置き、その後`100dvh`を指定、overflow-y:auto | フォールバックを明示。ただし実機でのviewport/keyboard差は別途確認 |

app CSSにある20個の`color-mix()`宣言は全てsupports内だった。19個には色の旧構文fallbackがあり、残りはpreflightのplaceholder。文字用KiriトークンのLAB表現もsupportsで分岐し、RGB/hex側が残る。

property初期値fallbackのWebKit向け条件は、概略次の形。

```css
@supports ((-webkit-hyphens:none) and (not (margin-trim:inline))) {
  *, :before, :after, ::backdrop {
    --tw-space-y-reverse: 0;
    --tw-border-style: solid;
    --tw-shadow: 0 0 #0000;
    --tw-ring-offset-width: 0px;
    /* 他のring/filter/scale用初期値も同じブロックにある */
  }
}
```

Safari 15.5はWebKit用hyphensを持ち、margin-trimはまだ持たないため、このfallbackが対象になるという静的判断。`@property`とmargin-trimの導入はSafari 16.4。[Apple 16.4リリースノート](https://developer.apple.com/documentation/safari-release-notes/safari-16_4-release-notes)、[WebKit 16.4解説](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)。

`@layer`、`dvh`、`:focus-visible`はSafari 15.4で導入されているため、15.5でそれらが残ること自体を障害の根拠としない。[Apple 15.4リリースノート](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes)、[WebKit 15.4解説](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)。

`text-wrap:balance`等の新しい組版指定は非対応時に通常の折返しへ退化する。今回のCSSに、背景や全文字の表示をそれだけで失う条件は見つからなかった。

## Lightning CSSによる追加変換の余地

```js
transform({
  filename: 'audit-only.css',
  code: Buffer.from(existingCss),
  targets: { safari: (15 << 16) | (5 << 8) },
  minify: true,
});
```

| メモリ内プローブ | bytes | color-mix文字列出現数（supports条件を含む） | @property数 |
|---|---:|---:|---:|
| 読込んだ現在のapp CSS | 42,345 | 40 | 46 |
| Safari15.5 targetで再変換 | 41,839 | 40 | 46 |
| ColorFunction/OklabColors/LabColorsをincludeして再変換 | 42,606 | 40 | 46 |

追加のターゲット指定だけで変数を含むmixや@propertyが全て消えるわけではなく、現行のfallback構造が維持された。静的に計算できる色だけが変換可能というLightning CSSの仕様とも整合する。[Lightning CSS変換仕様](https://lightningcss.dev/transpilation.html)。

現成果物から重要なfallback欠落が出ていないため、この確認だけを理由に追加のビルド工程、色の強制置換、@propertyの一括削除を提案しない。今後変換を追加する場合も、現在のfallbackやカスタムプロパティの意味を壊さないことを実画面で確認する必要がある。

## 実機差と未確認

- rootから、browserslist追加後のiOS 15.5 Releaseシミュレータで起動し、初期画面/プロフィール/設定/日記入力/同意が見え操作できたとの共有あり。これはrootの実画面検証記録であり、この担当が静的確認だけで再現したとは扱わない。
- この担当は実iPhone、iOS 15.5のソフトウェアキーボード、スクロール中のdvh、OSの文字サイズ、VoiceOver、背景移行/ロックを操作していない。
- 色合成の全ピクセル比較、全アニメーション位相、全フォントの描画、低メモリ/端末固有GPU差も未確認。
- Tailwindの公式対象外OSについて、構文が解釈できることと全画面が期待どおり動くことは区別する。公開判断ではrootの15.5実画面検証と端末ゲートを併用する。
