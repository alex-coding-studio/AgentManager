export async function materialize(name: string) {
  const loaded = await import(name);
  return loaded;
}
