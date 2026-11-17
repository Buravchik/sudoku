export interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  section_bg_color?: string;
  subtitle_text_color?: string;
  accent_text_color?: string;
  destructive_text_color?: string;
}

type StorageCallback = (error: Error | null, value?: string | null) => void;
type StatusCallback = (status: 'unsupported' | 'unknown' | 'added' | 'missed') => void;

export interface TelegramWebApp {
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  viewportHeight?: number;
  viewportStableHeight?: number;
  isVersionAtLeast?: (version: string) => boolean;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (callback?: StatusCallback) => void;
  openTelegramLink?: (url: string) => void;
  shareMessage?: (messageId: string, callback?: (sent: boolean) => void) => void;
  switchInlineQuery?: (query: string, chooseChatTypes?: Array<'users' | 'bots' | 'groups' | 'channels'>) => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  DeviceStorage?: {
    getItem: (key: string, callback: StorageCallback) => void;
    setItem: (key: string, value: string, callback?: StorageCallback) => void;
    removeItem: (key: string, callback?: StorageCallback) => void;
  };
  initData?: string;
  initDataUnsafe?: { start_param?: string; user?: { language_code?: string } };
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function telegramLanguage(): string {
  if (typeof window === 'undefined') return '';
  const fromApp = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (fromApp) return fromApp;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const data = new URLSearchParams(hash).get('tgWebAppData');
  if (!data) return '';
  try {
    const user = new URLSearchParams(data).get('user');
    if (!user) return '';
    const parsed = JSON.parse(user) as { language_code?: unknown };
    return typeof parsed.language_code === 'string' ? parsed.language_code : '';
  } catch {
    return '';
  }
}

export function readStartParam(): string | null {
  if (typeof window === 'undefined') return null;
  const fromApp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromApp) return fromApp;
  const search = new URLSearchParams(window.location.search);
  return search.get('tgWebAppStartParam') ?? search.get('match');
}

export function telegramWebApp(): TelegramWebApp | null {
  const webApp = window.Telegram?.WebApp;
  if (!webApp || webApp.platform === 'unknown') return null;
  return webApp;
}

export function supportsTelegram(version: string): boolean {
  const webApp = telegramWebApp();
  if (!webApp) return false;
  return webApp.isVersionAtLeast?.(version) ?? false;
}

function deviceStorage() {
  if (!supportsTelegram('9.0')) return null;
  return telegramWebApp()?.DeviceStorage ?? null;
}

export function hasDeviceStorage(): boolean {
  return deviceStorage() !== null;
}

export type DeviceRead = {
  status: 'value' | 'missing' | 'unavailable';
  value: string | null;
};

let deviceWritesEnabled = false;

export function allowDeviceWrites(enabled: boolean): void {
  deviceWritesEnabled = enabled;
}

export function readDeviceItem(key: string): Promise<DeviceRead> {
  const storage = deviceStorage();
  if (!storage) return Promise.resolve({ status: 'unavailable', value: null });

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: DeviceRead) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ status: 'unavailable', value: null }), 1500);
    storage.getItem(key, (error, value) => {
      if (error) finish({ status: 'unavailable', value: null });
      else if (value == null || value === '') finish({ status: 'missing', value: null });
      else finish({ status: 'value', value });
    });
  });
}

export function writeDeviceItem(key: string, value: string): void {
  if (!deviceWritesEnabled) return;
  deviceStorage()?.setItem(key, value);
}

export function removeDeviceItem(key: string): void {
  if (!deviceWritesEnabled) return;
  deviceStorage()?.removeItem(key);
}

export function hapticImpact(): void {
  telegramWebApp()?.HapticFeedback?.impactOccurred('light');
}

export function hapticSelection(): void {
  telegramWebApp()?.HapticFeedback?.selectionChanged();
}

export function hapticSuccess(): void {
  telegramWebApp()?.HapticFeedback?.notificationOccurred('success');
}

export function setClosingConfirmation(enabled: boolean): void {
  const webApp = telegramWebApp();
  if (!webApp) return;
  if (enabled) webApp.enableClosingConfirmation?.();
  else webApp.disableClosingConfirmation?.();
}

const BOT_LINK = 'https://t.me/tgsudoku_bot';

export function publicShareUrl(inTelegram: boolean, startParam: string | null, href: string): string {
  if (inTelegram) {
    return startParam ? `${BOT_LINK}?startapp=${encodeURIComponent(startParam)}` : BOT_LINK;
  }
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return url.toString();
}

export function sharePreparedMessage(messageId: string): Promise<boolean> {
  const webApp = telegramWebApp();
  if (!webApp?.shareMessage) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = (sent: boolean) => {
      if (settled) return;
      settled = true;
      resolve(sent);
    };
    try {
      webApp.shareMessage!(messageId, finish);
    } catch {
      finish(false);
    }
  });
}

export function canDropInChat(): boolean {
  const webApp = telegramWebApp();
  if (!webApp?.switchInlineQuery) return false;
  return webApp.isVersionAtLeast?.('6.7') ?? true;
}

export function offerDropInChat(query: string): void {
  telegramWebApp()?.switchInlineQuery?.(query, ['users', 'groups']);
}

export function shareInTelegram(text: string, url: string): boolean {
  const webApp = telegramWebApp();
  if (!webApp?.openTelegramLink) return false;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  webApp.openTelegramLink(shareUrl);
  return true;
}

const CHAT_COLOR_PROPERTIES = [
  '--header-bg',
  '--grid-line',
  '--grid-border',
  '--cell-bg',
  '--cell-hover',
  '--cell-highlight',
  '--cell-highlight-hover',
  '--cell-obvious',
  '--cell-obvious-hover',
  '--cell-selected',
  '--cell-selected-hover',
  '--cell-selected-ring',
  '--clue',
  '--entry',
  '--hint',
  '--win',
  '--error',
  '--cell-shadow',
];

export function applyTelegramChrome(): void {
  const webApp = telegramWebApp();
  if (!webApp) return;

  const root = document.documentElement;
  root.style.colorScheme = webApp.colorScheme;
  for (const name of CHAT_COLOR_PROPERTIES) root.style.removeProperty(name);

  const params = webApp.themeParams;
  if (params.bg_color) root.style.setProperty('--background', params.bg_color);
  else root.style.removeProperty('--background');
  if (params.text_color) {
    root.style.setProperty('--foreground', params.text_color);
    root.style.setProperty('--header-fg', params.text_color);
  } else {
    root.style.removeProperty('--foreground');
    root.style.removeProperty('--header-fg');
  }
  if (params.hint_color) root.style.setProperty('--muted', params.hint_color);
  else root.style.removeProperty('--muted');

  webApp.setHeaderColor?.('bg_color');
  webApp.setBackgroundColor?.('bg_color');
  applySafeArea();
}

function insetEdge(value: SafeAreaInset | undefined, edge: keyof SafeAreaInset): number {
  const amount = value?.[edge];
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function applySafeArea(): void {
  const webApp = telegramWebApp();
  if (!webApp) return;
  const root = document.documentElement;
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    const total = insetEdge(webApp.safeAreaInset, edge) + insetEdge(webApp.contentSafeAreaInset, edge);
    root.style.setProperty(`--tg-safe-${edge}`, `${total}px`);
  }
  const stable = webApp.viewportStableHeight;
  const current = webApp.viewportHeight;
  if (typeof stable === 'number' && stable > 0) {
    root.style.setProperty('--tg-viewport-stable-height', `${Math.round(stable)}px`);
  }
  if (typeof current === 'number' && current > 0) {
    root.style.setProperty('--tg-viewport-height', `${Math.round(current)}px`);
  }
}

export function startTelegramApp(): () => void {
  const webApp = telegramWebApp();
  if (!webApp) return () => undefined;

  webApp.ready();
  applyTelegramChrome();

  const onTheme = () => applyTelegramChrome();
  const onSafeArea = () => applySafeArea();
  webApp.onEvent('themeChanged', onTheme);
  webApp.onEvent('safeAreaChanged', onSafeArea);
  webApp.onEvent('contentSafeAreaChanged', onSafeArea);
  webApp.onEvent('fullscreenChanged', onSafeArea);
  webApp.onEvent('viewportChanged', onSafeArea);

  return () => {
    webApp.offEvent('themeChanged', onTheme);
    webApp.offEvent('safeAreaChanged', onSafeArea);
    webApp.offEvent('contentSafeAreaChanged', onSafeArea);
    webApp.offEvent('fullscreenChanged', onSafeArea);
    webApp.offEvent('viewportChanged', onSafeArea);
  };
}
