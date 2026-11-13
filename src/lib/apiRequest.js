import { classifyProviderFailure } from "@/lib/providerFailure";

const UPSTREAM_ERROR_MAX_BYTES = 16 * 1024;

// 入力本文や上流の例外メッセージをエラー/ログへ含めないAPI境界。
export class ApiRequestError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

// JSON の本文だけを受け付ける（S-05）。「application/json; charset=utf-8」のような引数は許す。
// text/plain などの「単純リクエスト」はブラウザがプリフライトを出さずに他サイトから届くため、数える前に 415 で断る。
const JSON_MEDIA_TYPE = "application/json";

export function isJsonContentType(value) {
  if (typeof value !== "string") return false;
  return value.split(";")[0].trim().toLowerCase() === JSON_MEDIA_TYPE;
}

export function unsupportedMediaTypeBody() {
  return { success: false, error: "Unsupported media type", code: "unsupported_media_type" };
}

export async function readBoundedJson(request, maxBytes, signal) {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new ApiRequestError("body_too_large", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiRequestError("invalid_json", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ApiRequestError("body_too_large", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError("invalid_json", 400);
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

// fetchと本文の読取り両方を同じ期限に収める。Abortを無視する代役でも期限で戻る。
export async function fetchUpstreamJson(url, options, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let receivedResponse;
  const failedResponse = (data = null) => ({
    response: receivedResponse,
    data: null,
    upstreamFailure: classifyProviderFailure(receivedResponse.status, data),
  });
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiRequestError("upstream_timeout", 504));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal });
        receivedResponse = response;
        if (!response.ok) {
          try {
            // 非2xx本文も既存のbyte上限と全体期限内だけ読む。生の値は返さない。
            return failedResponse(await readBoundedJson(response, UPSTREAM_ERROR_MAX_BYTES, controller.signal));
          } catch {
            return failedResponse();
          } finally {
            void response.body?.cancel().catch(() => {});
          }
        }
        try {
          return { response, data: await response.json() };
        } catch {
          throw new ApiRequestError("upstream_invalid_json", 502);
        }
      })(),
      deadline,
    ]);
  } catch (error) {
    // 本文待ち中に外側のdeadlineが先にrejectしても、受信済みstatusを失わない。
    if (receivedResponse && !receivedResponse.ok) return failedResponse();
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError("upstream_unavailable", 502);
  } finally {
    clearTimeout(timer);
  }
}
