import { NextResponse } from "next/server";
import { KIRI_PERSONA } from "@/lib/kiriPersonality";
import { createRateLimiter, createDailyQuota, clientKeyFromHeaders, positiveIntEnv } from "@/lib/apiGuard";
import { checkChatEntitlement } from "@/lib/entitlement";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1200;

const RATE_LIMITER = createRateLimiter({
  windowMs: 60_000,
  max: positiveIntEnv("RATE_LIMIT_CHAT_PER_MIN", 20),
});
const DAILY_QUOTA = createDailyQuota({
  limit: positiveIntEnv("DAILY_LIMIT_CHAT", 600),
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

export async function POST(request) {
  try {
    const entitlement = checkChatEntitlement();
    if (!entitlement.allowed) {
      return NextResponse.json(
        { success: false, error: "Chat is not available", code: "chat_disabled" },
        { status: 403 }
      );
    }

    const rate = RATE_LIMITER.check(clientKeyFromHeaders(request.headers));
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

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Chat is not configured" }, { status: 503 });
    }

    const quota = DAILY_QUOTA.consume();
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
        model: process.env.KIRI_CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-haiku-4-5",
        max_tokens: 420,
        temperature: 0.7,
        system: KIRI_PERSONA + CHAT_MODE + dynamicContext,
        messages,
      }),
    });

    if (!response.ok) {
      await response.text();
      console.error("[kiri-chat] upstream status", response.status);
      return NextResponse.json({ success: false, error: "Chat request failed" }, { status: 502 });
    }

    const data = await response.json();
    const reply = String(data?.content?.[0]?.text || "……").trim().slice(0, 1800);
    return NextResponse.json({ success: true, reply: reply || "……" });
  } catch (error) {
    console.error("[kiri-chat] request failed", error?.message ?? String(error));
    return NextResponse.json({ success: false, error: "Chat request failed" }, { status: 500 });
  }
}
