import type { FileDropItem } from "../appTypes";

function toDropItem(file: File): FileDropItem {
	return {
		path: (file as File & { path?: string }).path ?? "",
		name: file.name,
		size: file.size,
		file
	};
}

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<FileDropItem[]> {
	const fromFiles = Array.from(dataTransfer.files ?? []);

	if (fromFiles.length > 0) {
		return fromFiles.map(toDropItem);
	}

	const fromItems = Array.from(dataTransfer.items ?? [])
		.filter((item) => item.kind === "file")
		.map((item) => item.getAsFile())
		.filter((file): file is File => Boolean(file));

	return fromItems.map(toDropItem);
}

export function mapInputFiles(files: FileList): FileDropItem[] {
	return Array.from(files).map(toDropItem);
}
