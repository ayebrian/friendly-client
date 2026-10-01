/** Read files while the paste event's DataTransfer is still accessible. */
export function transferredFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  const items = Array.from(transfer.items ?? []).flatMap((item) => {
    if (item.kind !== 'file') return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  return items.length ? items : Array.from(transfer.files ?? []);
}

export async function readClipboardMedia(): Promise<File[]> {
  if (!navigator.clipboard?.read)
    throw new Error(
      'Clipboard access is unavailable here. Paste into the editor or choose a file.',
    );
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    // A clipboard item may offer several representations of the same image.
    const type =
      item.types.find((type) => type === 'image/png') ??
      item.types.find((type) => /^(image|audio|video)\//.test(type));
    if (!type) continue;
    const blob = await item.getType(type);
    const extension = type.split('/')[1];
    files.push(
      new File([blob], `clipboard-${files.length + 1}.${extension}`, { type: blob.type || type }),
    );
  }
  if (!files.length) throw new Error('No media in the clipboard. Copy a photo or choose a file.');
  return files;
}
