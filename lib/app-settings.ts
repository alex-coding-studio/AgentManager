import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { isUiLanguage, type UiLanguage } from './ui-language.ts';

export type AppSettings = { schemaVersion: 1; language: UiLanguage };
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
    };
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' ||
      error instanceof SyntaxError
    )
      return { schemaVersion: 1, language: 'en' };
    throw error;
  }
}

export async function saveAppLanguage(
  language: unknown,
  home = settingsHome(),
): Promise<AppSettings> {
  if (!isUiLanguage(language))
    throw new Error('Unsupported interface language.');
  const settings: AppSettings = { schemaVersion: 1, language };
  await mkdir(home, { recursive: true });
  const file = path.join(home, 'settings.json');
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
    flag: 'wx',
  });
  await rename(temporary, file);
  return settings;
}
