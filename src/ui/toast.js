/**
 * 提示浮层 UI
 */

export function initToast() {
  const hint = document.getElementById('hint');
  if (!hint) return;

  setTimeout(() => {
    hint.classList.add('fade-out');
    setTimeout(() => hint.remove(), 1500);
  }, 5000);
}
