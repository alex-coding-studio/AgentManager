import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson, sha256Hex } from './hash.ts';
import { MaterializationError } from './receipt.ts';

export type ResultContract<T> = {
  id: string;
  version: number;
  schema: object;
  hash: string;
  validateStructure(value: unknown): asserts value is T;
};

export type DefineResultContractInput = {
  id: string;
  version: number;
  schema: object;
};

export function defineResultContract<T>(
  input: DefineResultContractInput,
): ResultContract<T> {
  const { id, version, schema } = input;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validate = ajv.compile(schema);
  const hash = sha256Hex(canonicalJson({ id, version, schema }));
  return {
    id,
    version,
    schema,
    hash,
    validateStructure(value: unknown): asserts value is T {
      if (!validate(value)) {
        throw new MaterializationError(
          'validation',
          `Invalid ${id} result: ${ajv.errorsText(validate.errors)}`,
        );
      }
    },
  };
}

export function contractIdentity<T>(contract: ResultContract<T>) {
  return { id: contract.id, version: contract.version, hash: contract.hash };
}
