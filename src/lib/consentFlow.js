// 永続化待ちの同意を閉じた後に、遅い完了から外部送信を始めない。
export function createConsentFlow() {
  let generation = 0;
  let pending = false;
  let uncommitted = false;
  return {
    get pending() { return pending; },
    async accept({ record, flush, accepted, failed }) {
      if (pending) return 'busy';
      const ticket = ++generation;
      pending = true;
      try {
        uncommitted = true;
        record();
        await flush();
        if (ticket !== generation) return 'cancelled';
        pending = false;
        uncommitted = false;
        accepted();
        return 'accepted';
      } catch {
        if (ticket !== generation) return 'cancelled';
        failed?.();
        return 'failed';
      } finally {
        if (ticket === generation) pending = false;
      }
    },
    cancel({ revoke, flush, failed } = {}) {
      generation += 1;
      const wasPending = pending || uncommitted;
      pending = false;
      uncommitted = false;
      if (!wasPending) return;
      try {
        // メモリ上の同意も取り消す。削除の永続化に失敗しても再送信を許可しない。
        revoke?.();
        Promise.resolve(flush?.()).catch(() => failed?.());
      } catch {
        failed?.();
      }
    },
  };
}
