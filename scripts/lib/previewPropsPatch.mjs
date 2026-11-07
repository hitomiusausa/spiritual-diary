// Next.js 16.4 の preview-props.json を OpenNext の loadManifest 埋め込み対象に加える（DECISIONS.md D-19）。
// 上流の修正 PR（opennextjs/opennextjs-cloudflare#1356）と同じ glob 文字列の変更。
export const PATCH_BEFORE = "**/{*-manifest,required-server-files,prefetch-hints}.json";
export const PATCH_AFTER = "**/{*-manifest,required-server-files,prefetch-hints,preview-props}.json";

// 引用符で囲まれた glob 引数として完全一致する箇所だけを数える。
const countQuoted = (source, glob) => source.split(`"${glob}"`).length - 1;

// status: "patched"（当てた）/ "already"（パッチ後・上流修正後の行と一致）/ "unexpected"（想定外の形）
export function applyPreviewPropsPatch(source) {
  const after = countQuoted(source, PATCH_AFTER);
  const before = countQuoted(source, PATCH_BEFORE);
  // OpenNext 1.20.16は独立したパスとして上流で対応済み。重複パッチを当てない。
  const nativeManifest = 'join(dotNextDir, "server/preview-props.json")';
  if (before === 1 && after === 0 && source.split(nativeManifest).length - 1 === 1) return { status: "already", source };
  if (after === 1 && before === 0) return { status: "already", source };
  if (before === 1 && after === 0) {
    return { status: "patched", source: source.replace(`"${PATCH_BEFORE}"`, `"${PATCH_AFTER}"`) };
  }
  return { status: "unexpected", source };
}
