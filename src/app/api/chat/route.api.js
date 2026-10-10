import { NextResponse } from "next/server";
import { preflightResponse, withCors } from "@/lib/cors";
import { KIRI_PERSONA } from "@/lib/kiriPersonality";
import { createRateLimiter, createDailyQuota, createUserDailyQuota, clientKeyFromHeaders, positiveIntEnv, rateLimitPerMin, USER_DAILY_LIMIT_DEFAULT } from "@/lib/apiGuard";
import { storeReadiness } from "@/lib/kiriStore";
import { checkChatEntitlement } from "@/lib/entitlement";
import { extractReplyText } from "@/lib/claudeResponse";
import { CRISIS_CHAT_MESSAGE, SAFETY_GUIDANCE, detectCrisis } from "@/lib/kiriSafety";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1200;
const CHAT_EFFORT = process.env.KIRI_CHAT_EFFORT || "low";

// 購読者ごとの1日の上限の既定は apiGuard.js の USER_DAILY_LIMIT_DEFAULT（購入画面・規約・サポートと同じ数字）。
// 全体の1日の上限の既定。本番は wrangler.jsonc の vars で固定する。
const DAILY_LIMIT_CHAT_DEFAULT = 500;

const RATE_LIMITER = createRateLimiter({
  route: "chat",
  windowMs: 60_000,
  max: rateLimitPerMin("chat"),
});
const DAILY_QUOTA = createDailyQuota({
  route: "chat",
  limit: () => positiveIntEnv("DAILY_LIMIT_CHAT", DAILY_LIMIT_CHAT_DEFAULT),
});
// 環境変数の上書きはリクエスト時に読む。
const USER_DAILY_QUOTA = createUserDailyQuota({
  limit: () => positiveIntEnv("KIRI_CHAT_USER_DAILY_LIMIT", USER_DAILY_LIMIT_DEFAULT),
});

const CHAT_MODE = `
これは占い結果のあとに続く、Kiriとの短い対話です。
- 直前の占い結果と今日の記録を会話の背景として使うが、毎回すべてを説明し直さない
- 返答は基本2文。1文目で相手の言葉の温度や迷いを受け止め、2文目で霧の谷の小さな変化・Kiri側の連想・答えを急がない問いのどれかをひとつ添える
- 一言だけの素っ気ない返答で終わらせない。ただし相手が深く沈んでいるときや閉じようとしているときは、短さを優先する
- 「もう少し聞きたい」「それで？」「教えて」などの続きを求める言葉には、必ず2文で返す。2文目にはKiri自身の小さな発見を置く
- 占い結果を説明し直すのではなく、相手が気になった一点をKiriの言葉で少しだけ深くする
- 断定、脅し、医療・金融・法律の専門助言はしない
- 相手が求めない限り、占いの柱や専門用語を増やしすぎない
- JSONではなく、返答本文だけを出力する
`;

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content);
}

function compactContext(context) {
  if (!context || typeof context !== "object") return "";
  const result = context.result || {};
  const entry = context.entry || {};
  return `
【今回の占い結果】
深いメッセージ: ${String(result.deepMessage || "").slice(0, 1200)}
直感へのメッセージ: ${String(result.innerMessage || "").slice(0, 600)}
アドバイス: ${String(result.actionAdvice || "").slice(0, 800)}

【今日の記録】
出来事/予定: ${String(entry.event || "").slice(0, 800)}
直感: ${String(entry.intuition || "").slice(0, 400)}
`;
}

async function handlePost(request) {
  try {
    if (!storeReadiness().ready) {
      console.error("[kiri-store] store not configured");
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 503 });
    }

    const rate = await RATE_LIMITER.check(clientKeyFromHeaders(request.headers));
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests", code: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const messages = cleanMessages(body?.messages);
    if (!messages.length) {
      return NextResponse.json({ success: false, error: "Chat message is required" }, { status: 400 });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    if (lastUserMessage && detectCrisis(lastUserMessage.content)) {
      // 危機の言葉には権利判定もAIも使わず、固定文で窓口へつなぐ。クォータも消費しない（D-15）。
      console.warn("[kiri-safety] crisis detected in chat");
      return NextResponse.json({ success: true, reply: CRISIS_CHAT_MESSAGE, support: true });
    }

    const entitlement = await checkChatEntitlement({ appUserId: body?.appUserId });
    if (!entitlement.allowed) {
      if (entitlement.reason === "unavailable") {
        return NextResponse.json(
          { success: false, error: "Chat is temporarily unavailable", code: "chat_unavailable" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Chat is not available", code: "not_entitled" },
        { status: 403 }
      );
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Chat is not configured" }, { status: 503 });
    }

    const userQuota = await USER_DAILY_QUOTA.consume(entitlement.userHash);
    if (!userQuota.allowed) {
      // 購読者を特定できる値（ハッシュ含む）はログに出さない。
      console.warn("[kiri-usage] chat user daily limit reached", userQuota.limit);
      return NextResponse.json(
        { success: false, error: "Daily limit reached", code: "user_daily_limit" },
        { status: 429 }
      );
    }

    const quota = await DAILY_QUOTA.consume();
    if (!quota.allowed) {
      console.warn("[kiri-usage] chat daily limit reached", quota.used, "/", quota.limit);
      return NextResponse.json(
        { success: false, error: "Daily limit reached", code: "daily_limit" },
        { status: 429 }
      );
    }
    console.log("[kiri-usage] chat", quota.used, "/", quota.limit);

    const nickname = String(body?.userProfile?.nickname || "").trim().slice(0, 40);
    const dynamicContext = `${nickname ? `\n【呼びかけ】${nickname}さん` : ""}${compactContext(body?.context)}`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.KIRI_CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-haiku-5-5",
        // 5.5世代はtemperature指定不可・思考が常時オン（思考もmax_tokensに含まれる）。
        // 返答の短さはCHAT_MODEの指示で保つ。Haikuはサーバー側fallback非対応のため付けない。
        max_tokens: 2000,
        output_config: { effort: CHAT_EFFORT },
        system: KIRI_PERSONA + SAFETY_GUIDANCE + CHAT_MODE + dynamicContext,
        messages,
      }),
    });

    if (!response.ok) {
      await response.text();
      console.error("[kiri-chat] upstream status", response.status);
      return NextResponse.json({ success: false, error: "Chat request failed" }, { status: 502 });
    }

    const data = await response.json();
    if (data?.stop_reason === "refusal" || data?.stop_reason === "max_tokens") {
      console.error("[kiri-chat] no usable text", data.stop_reason);
    }
    // 単価の実測用（本文は出さない）。公開後1週間の値で上限を見直す。
    console.log("[kiri-usage] chat tokens", data?.usage?.input_tokens ?? 0, data?.usage?.output_tokens ?? 0);
    const reply = extractReplyText(data).slice(0, 1800);
    return NextResponse.json({ success: true, reply: reply || "……" });
  } catch (error) {
    console.error("[kiri-chat] request failed", error?.message ?? String(error));
    return NextResponse.json({ success: false, error: "Chat request failed" }, { status: 500 });
  }
}

// iOS アプリ（capacitor://localhost）向けの CORS。Web の同一オリジン応答は変えない（Ruling 4）。
export const POST = withCors(handlePost);

export function OPTIONS(request) {
  return preflightResponse(request);
}
