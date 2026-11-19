export interface SelectedFolderFile {
  file: File;
  path: string;
}

interface LocalFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

interface LocalDirectoryHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, LocalFileHandle | LocalDirectoryHandle]>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<LocalDirectoryHandle>;
};

export async function selectLocalDirectory(): Promise<SelectedFolderFile[]> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("L’API de sélection de dossier n’est pas disponible dans ce navigateur.");
  const root = await picker.call(window);
  return readDirectory(root, "");
}

export function getDirectoryFiles(fileList: FileList): SelectedFolderFile[] {
  return Array.from(fileList)
    .filter((file) => /\.(md|txt)$/i.test(file.name))
    .map((file) => {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
      const path = relative.split("/").filter(Boolean).slice(1).join("/");
      return { file, path: path || file.name };
    });
}

export function getFolderCategories(files: SelectedFolderFile[]): string[] {
  const categories = files.flatMap(({ path }) => {
    const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return segments.length > 1 ? [segments[0]] : [];
  });
  return [...new Set(categories)]
    .sort((left, right) => left.localeCompare(right, "fr"));
}

async function readDirectory(directory: LocalDirectoryHandle, prefix: string): Promise<SelectedFolderFile[]> {
  const files: SelectedFolderFile[] = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === "directory") {
      files.push(...await readDirectory(handle, `${prefix}${name}/`));
    } else if (/\.(md|txt)$/i.test(name)) {
      files.push({ file: await handle.getFile(), path: `${prefix}${name}` });
    }
  }
  return files;
}
