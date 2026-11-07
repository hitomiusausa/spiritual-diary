import { describe, expect, it, vi } from 'vitest';
import { createConsentFlow } from '../consentFlow';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('同意の永続化と送信開始', () => {
  it('保存を待ち、拒否後の遅い完了から送信しない', async () => {
    const flow = createConsentFlow();
    const wait = deferred();
    const accepted = vi.fn();
    let consent = false;
    const result = flow.accept({ record: () => { consent = true; }, flush: () => wait.promise, accepted });
    expect(accepted).not.toHaveBeenCalled();
    flow.cancel({ revoke: () => { consent = false; }, flush: async () => {} });
    wait.resolve();
    expect(await result).toBe('cancelled');
    expect(consent).toBe(false);
    expect(accepted).not.toHaveBeenCalled();
  });

  it('前の保存が後から終わっても、新しい明示同意と混同しない', async () => {
    const flow = createConsentFlow();
    const first = deferred(), second = deferred();
    const oldSend = vi.fn(), newSend = vi.fn();
    const old = flow.accept({ record: () => {}, flush: () => first.promise, accepted: oldSend });
    flow.cancel({ revoke: () => {}, flush: async () => {} });
    const current = flow.accept({ record: () => {}, flush: () => second.promise, accepted: newSend });
    first.resolve();
    expect(await old).toBe('cancelled');
    expect(flow.pending).toBe(true);
    second.resolve();
    expect(await current).toBe('accepted');
    expect(oldSend).not.toHaveBeenCalled();
    expect(newSend).toHaveBeenCalledOnce();
  });

  it('保存失敗では送信せず、その場で失敗を知らせる', async () => {
    const flow = createConsentFlow();
    const accepted = vi.fn(), failed = vi.fn();
    expect(await flow.accept({ record: () => {}, flush: async () => { throw new Error('disk'); }, accepted, failed })).toBe('failed');
    expect(accepted).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    expect(flow.pending).toBe(false);
  });

  it('拒否の保存失敗でも遅い同意完了を無効にする', async () => {
    const flow = createConsentFlow();
    const wait = deferred();
    const accepted = vi.fn(), failed = vi.fn();
    const result = flow.accept({ record: () => {}, flush: () => wait.promise, accepted });
    flow.cancel({ revoke: () => { throw new Error('disk'); }, failed });
    wait.resolve();
    expect(await result).toBe('cancelled');
    expect(accepted).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });
  it('保存失敗のあとにやめた同意も取り消し、次回へ持ち越さない', async () => {
    const flow = createConsentFlow();
    let consent = false;
    const accepted = vi.fn();
    await flow.accept({ record: () => { consent = true; }, flush: async () => { throw new Error('disk'); }, accepted });
    expect(flow.pending).toBe(false);
    flow.cancel({ revoke: () => { consent = false; }, flush: async () => {} });
    expect(consent).toBe(false);
    expect(accepted).not.toHaveBeenCalled();
  });

});
