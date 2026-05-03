import type { DownloadRecord, UploadRecord } from "../types";

export const BROWSER_UPLOADS_STORAGE_KEY = "x0-desk.browser-uploads";
export const BROWSER_DOWNLOADS_STORAGE_KEY = "x0-desk.browser-downloads";

function readLocalStorageRecords<T>(storageKey: string): T[] {
	if (typeof window === "undefined") return [];

	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as T[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function readBrowserUploads(): UploadRecord[] {
	return readLocalStorageRecords<UploadRecord>(BROWSER_UPLOADS_STORAGE_KEY);
}

export function writeBrowserUploads(records: UploadRecord[]) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(BROWSER_UPLOADS_STORAGE_KEY, JSON.stringify(records));
}

export function readBrowserDownloads(): DownloadRecord[] {
	return readLocalStorageRecords<DownloadRecord>(BROWSER_DOWNLOADS_STORAGE_KEY);
}

export function writeBrowserDownloads(records: DownloadRecord[]) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(BROWSER_DOWNLOADS_STORAGE_KEY, JSON.stringify(records));
}
