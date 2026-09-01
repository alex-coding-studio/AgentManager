import * as fsp from 'node:fs/promises';
export async function call(method: string, file: string) {
  return (fsp as never)[method](file);
}
