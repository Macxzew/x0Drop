import type { UploadRecord } from "../types";

export const BROWSER_UPLOADS_STORAGE_KEY = "x0-desk.browser-uploads";

export function readBrowserUploads(): UploadRecord[] {
	if (typeof window === "undefined") return [];

	try {
		// Fallback navigateur
		const raw = window.localStorage.getItem(BROWSER_UPLOADS_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as UploadRecord[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function writeBrowserUploads(records: UploadRecord[]) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(BROWSER_UPLOADS_STORAGE_KEY, JSON.stringify(records));
}
