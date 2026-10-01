const mediaTypes: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a'],
  'audio/wav': ['wav'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
  'audio/webm': [],
  'audio/aac': ['aac'],
  'audio/flac': ['flac'],
};
export const mediaAccept = Object.keys(mediaTypes).join(',');
export const maxMediaSize = 5_000_000;
export const maxAttachments = 10;

export function mediaFile(file: File): File {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  let type = file.type.toLowerCase();
  if (type === 'audio/x-wav') type = 'audio/wav';
  if (type === 'audio/x-m4a') type = 'audio/mp4';
  if (!type || type === 'application/octet-stream')
    type =
      Object.entries(mediaTypes).find(([, extensions]) =>
        extensions.includes(extension ?? ''),
      )?.[0] ?? '';
  if (!Object.hasOwn(mediaTypes, type))
    throw new Error(`${file.name}: choose a photo, GIF, video or audio file.`);
  if (!file.size) throw new Error(`${file.name}: this file is empty.`);
  if (file.size > maxMediaSize) throw new Error(`${file.name}: each file must be 5 MB or smaller.`);
  return file.type === type
    ? file
    : new File([file], file.name, { type, lastModified: file.lastModified });
}

export function mediaMarkup(file: File, url: string): string {
  const source = new URL(url).href;
  const name = file.name.replace(/[\\[\]<>`\r\n]/g, '').trim() || 'photo';
  if (file.type.startsWith('image/'))
    return `![${name}](${source.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
  const escaped = source.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return file.type.startsWith('video/')
    ? `<video src="${escaped}" controls playsinline></video>`
    : `<audio src="${escaped}" controls></audio>`;
}
