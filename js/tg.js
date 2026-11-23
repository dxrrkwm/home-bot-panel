export const tg = window.Telegram.WebApp;

export function haptic() {
  tg.HapticFeedback?.impactOccurred("light");
}

export function confirm(text) {
  if (!tg.isVersionAtLeast("6.2")) return Promise.resolve(window.confirm(text));
  return new Promise(ok => tg.showConfirm(text, ok));
}
