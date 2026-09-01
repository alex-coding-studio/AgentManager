import { PublicApiError } from './api-errors.ts';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { isUiLanguage, type UiLanguage } from './ui-language.ts';
import { isUiTheme, type UiTheme } from './ui-theme.ts';

export type AppSettings = {
  schemaVersion: 1;
  language: UiLanguage;
  theme: UiTheme;
};
type SettingsPatch = Partial<Pick<AppSettings, 'language' | 'theme'>>;
const state = globalThis as typeof globalThis & {
  appSettingsWrites?: Map<string, Promise<unknown>>;
};
const writes = (state.appSettingsWrites ??= new Map());

export function isSettingsPatch(value: unknown): value is SettingsPatch {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([key, item]) =>
        (key === 'language' && isUiLanguage(item)) ||
        (key === 'theme' && isUiTheme(item)),
    ),
  );
}
const settingsHome = () =>
  process.env.AGENT_MANAGER_HOME
    ? path.resolve(process.env.AGENT_MANAGER_HOME)
    : path.join(homedir(), '.agent-manager');

export async function readAppSettings(
  home = settingsHome(),
): Promise<AppSettings> {
  try {
    const value = JSON.parse(
      await readFile(path.join(home, 'settings.json'), 'utf8'),
    );
    return {
      schemaVersion: 1,
      language: isUiLanguage(value?.language) ? value.language : 'en',
      theme: isUiTheme(value?.theme) ? value.theme : 'system',
    };
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' ||
      error instanceof SyntaxError
    )
      return { schemaVersion: 1, language: 'en', theme: 'system' };
    throw error;
  }
}

export async function saveAppLanguage(
  language: unknown,
  home = settingsHome(),
): Promise<AppSettings> {
  if (!isUiLanguage(language))
    throw new PublicApiError('Unsupported interface language.', 400);
  return updateAppSettings({ language }, home);
}

export async function updateAppSettings(
  patch: SettingsPatch,
  home = settingsHome(),
): Promise<AppSettings> {
  if (!isSettingsPatch(patch))
    throw new PublicApiError('Unsupported application settings.', 400);
  const file = path.join(home, 'settings.json');
  const previous = writes.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const settings = { ...(await readAppSettings(home)), ...patch };
      await mkdir(home, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
        flag: 'wx',
      });
      await rename(temporary, file);
      return settings;
    });
  writes.set(file, next);
  try {
    return await next;
  } finally {
    if (writes.get(file) === next) writes.delete(file);
  }
}
