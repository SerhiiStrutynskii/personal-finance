/** Зберігає файл у браузері через тимчасове посилання `<a download>`. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Відкладено: деякі браузери починають читати blob уже після click().
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
