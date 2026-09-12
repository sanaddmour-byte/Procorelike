/** Express 5's ParamsDictionary types a value as `string | string[]`; a plain `:id` segment is always a single string in practice. */
export function paramAsString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
