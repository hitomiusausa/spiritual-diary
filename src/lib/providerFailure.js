// 上流の本文・任意のtype/messageをログへ流さず、既知の条件だけ固定語へ写す。
// 解析できない本文でもHTTP statusによる分類を保持する。
export function classifyProviderFailure(status, data) {
  const error = data?.error;
  if (status === 400 && error?.type === "invalid_request_error" && typeof error.message === "string") {
    if (/^You have reached your specified (?:workspace )?API usage limits(?:[.: ]|$)/.test(error.message)) {
      return "provider_spend_limit";
    }
  }
  if (status === 429 && error?.type === "rate_limit_error" &&
      error.details?.error_code === "enforced_spend_limit_reached") {
    return "provider_tier_spend_limit";
  }
  switch (status) {
    case 400: return "provider_request_invalid";
    case 401: return "provider_auth";
    case 402: return "provider_billing";
    case 403: return "provider_permission";
    case 404: return "provider_not_found";
    case 413: return "provider_request_too_large";
    case 429: return "provider_rate_limit";
    case 529: return "provider_overloaded";
    default: return status >= 500 && status <= 599 ? "provider_server_error" : "provider_unknown";
  }
}
