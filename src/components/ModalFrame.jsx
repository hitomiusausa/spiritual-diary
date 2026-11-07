'use client';

import { createContext, useContext, useLayoutEffect, useRef } from 'react';

// iOS 15.5以降のdialogを使い、重なったときも最上位だけを操作・読み上げの対象にする。
// ロック中は下のdialogを閉じて保留し、解除後に内容を失わず再開する。
export const ModalLockContext = createContext(false);
let scrollLocks = 0;
let originalOverflow = '';
const activeDialogs = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function lockScroll() {
  if (scrollLocks++ === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
  };
}

export default function ModalFrame({ children, onClose, className = '', initialFocus, ...props }) {
  const blocked = useContext(ModalLockContext);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || blocked) return undefined;
    const opener = document.activeElement;
    dialog.showModal();
    const unlockScroll = lockScroll();
    activeDialogs.push(dialog);
    const target = initialFocus ? dialog.querySelector(initialFocus) : null;
    target?.focus();
    const cancel = (event) => {
      event.preventDefault();
      closeRef.current?.();
    };
    const keydown = (event) => {
      if (event.key !== 'Tab' || activeDialogs[activeDialogs.length - 1] !== dialog) return;
      const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((element) =>
        element.closest('dialog') === dialog && element.getClientRects().length > 0
        && getComputedStyle(element).visibility !== 'hidden');
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      // macOS WebKitは設定によってボタンをTab対象から外すため、端以外も明示的に巡回する。
      const index = items.indexOf(document.activeElement);
      const next = index === -1 ? (event.shiftKey ? items.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      items[next].focus();
    };
    dialog.addEventListener('cancel', cancel);
    document.addEventListener('keydown', keydown, true);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      document.removeEventListener('keydown', keydown, true);
      const index = activeDialogs.indexOf(dialog);
      if (index !== -1) activeDialogs.splice(index, 1);
      if (dialog.open) dialog.close();
      unlockScroll();
      // WebKitのclose後の標準フォーカス復帰とDOM除去が終わってから起点へ戻す。
      requestAnimationFrame(() => {
        const top = activeDialogs[activeDialogs.length - 1];
        if (opener?.isConnected && !opener.closest('[inert]') && (!top || top.contains(opener))) opener.focus?.();
      });
    };
  }, [blocked, initialFocus]);

  return (
    <dialog ref={dialogRef} role="dialog" aria-modal="true" {...props} className={`kiri-modal ${className}`}>
      {children}
    </dialog>
  );
}
