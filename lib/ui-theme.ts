export type UiTheme = 'light' | 'dark' | 'system';

export function isUiTheme(value: unknown): value is UiTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveUiTheme(theme: UiTheme, systemDark: boolean) {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

export const THEME_BOOTSTRAP = `(function(){var root=document.documentElement;var mode=root.dataset.theme;var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);root.classList.toggle('dark',dark);})();`;
