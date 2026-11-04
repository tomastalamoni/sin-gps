/** Saca un archivo del celu: con el menú de compartir si está, si no como descarga. */
export async function shareOrDownload(name: string, text: string): Promise<void> {
  const file = new File([text], name, { type: 'application/json' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // Cerrar el menú de compartir no es un error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
