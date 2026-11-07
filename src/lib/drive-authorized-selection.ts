// Only provider-listed files may enter the explicit import selection.
export function authorizedDriveSelection<T extends { id: string }>(files: T[], chosen: string[]) {
  const ids = new Set(chosen);
  return [...new Map(files.filter((file) => ids.has(file.id)).map((file) => [file.id, file])).values()];
}