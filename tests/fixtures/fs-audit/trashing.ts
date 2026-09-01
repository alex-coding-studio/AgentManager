import trash from 'trash';
export async function discard(file: string) {
  await trash([file]);
}
