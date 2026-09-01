import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export { resolve } from './resolve-alias.mjs';

export function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.tsx'))
    return nextLoad(url, context);
  const source = readFileSync(fileURLToPath(url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: false,
    },
  });
  return { format: 'module', shortCircuit: true, source: outputText };
}
