export const HISTORY_STORAGE_KEY = "spiritual-diary.history.v1";
export const PROFILE_STORAGE_KEY = "spiritual-diary.profile.v1";
export const MAX_HISTORY_ITEMS = 30;

export function toHistoryRecord({ result, entry, userProfile }) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date(result.timestamp ?? Date.now()).toISOString(),
    userProfile: {
      birthDate: userProfile.birthDate,
      birthTime: userProfile.birthTime || "",
      gender: userProfile.gender || "",
      nickname: userProfile.nickname || "",
    },
    entry: {
      emoji: entry.emoji || "",
      mood: entry.mood || "",
      type: entry.type === "future" ? "future" : "past",
      event: entry.event,
      intuition: entry.intuition || "",
    },
    result: {
      deepMessage: result.deepMessage || "",
      innerMessage: result.innerMessage || "",
      actionAdvice: result.actionAdvice || "",
      themeScores: result.themeScores || null,
      saju: result.saju || null,
    },
  };
}

export function loadHistory(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage, record) {
  const history = [record, ...loadHistory(storage)]
    .filter((item, index, all) => item?.id && all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, MAX_HISTORY_ITEMS);
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function deleteHistoryItem(storage, id) {
  const history = loadHistory(storage).filter((item) => item.id !== id);
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function clearHistory(storage) {
  storage?.removeItem(HISTORY_STORAGE_KEY);
  return [];
}

export function loadProfile(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(PROFILE_STORAGE_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProfile(storage, profile) {
  const safeProfile = {
    nickname: String(profile?.nickname || "").slice(0, 40),
    birthDate: String(profile?.birthDate || "").slice(0, 10),
    birthTime: String(profile?.birthTime || "").slice(0, 5),
    gender: String(profile?.gender || "").slice(0, 16),
  };
  storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(safeProfile));
  return safeProfile;
}
