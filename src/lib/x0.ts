import type { UploadAccessIssue } from "../appTypes";
import type { RetentionState } from "../types";

export type CreditProfile = {
	name: string;
	role: string;
	avatar: string;
	profileHref: string;
	note: string;
	links: Array<{
		label: string;
		kind: "profile" | "project" | "site";
		href: string;
	}>;
};

export const X0_UPLOAD_URL = "https://x0.at/";
export const X0_UPLOAD_PROXY_PATH = "/__x0_upload__";
const MIN_AGE_DAYS = 3;
const MAX_AGE_DAYS = 100;
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;

// Crédits service
export const CREDIT_PROFILES: CreditProfile[] = [
	{
		name: "Macxzew",
		role: "App author",
		avatar: "https://avatars.githubusercontent.com/u/113097122",
		profileHref: "https://github.com/Macxzew",
		note: "« CLI upload is fine. I wanted a cleaner face. »",
		links: [{ label: "GitHub", kind: "profile", href: "https://github.com/Macxzew" }]
	},
	{
		name: "Rouji",
		role: "x0.at layer",
		avatar: "https://avatars.githubusercontent.com/u/17692001?v=4",
		profileHref: "https://github.com/Rouji",
		note: "x0.at is exposed through this layer.",
		links: [
			{ label: "Profile", kind: "profile", href: "https://github.com/Rouji" },
			{ label: "Project", kind: "project", href: "https://github.com/Rouji/single_php_filehost" },
			{ label: "Site", kind: "site", href: "https://x0.at/" }
		]
	},
	{
		name: "mia",
		role: "Original upstream",
		avatar: "https://git.0x0.st/avatars/71d9f3bfbb95f89c75ca201f19e86c5e?size=512",
		profileHref: "https://git.0x0.st/mia",
		note: "The original 0x0 source and public instance.",
		links: [
			{ label: "Profile", kind: "profile", href: "https://git.0x0.st/mia" },
			{ label: "Project", kind: "project", href: "https://git.0x0.st/mia/0x0" },
			{ label: "Site", kind: "site", href: "https://0x0.st/" }
		]
	}
];

export function formatRemaining(ms: number) {
	if (ms <= 0) return "Expired";
	const minutes = Math.floor(ms / 60000);
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const mins = minutes % 60;
	if (days > 0) return `${days}d ${hours}h ${mins}m`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

export function formatExpiry(dateMs: number) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(new Date(dateMs));
}

export function formatFileSize(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";

	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
	return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function calculateRetention(fileSize: number, uploadedAt: string): RetentionState {
	// Calcul local
	const normalizedSize = Math.min(fileSize, MAX_FILE_SIZE_BYTES) / MAX_FILE_SIZE_BYTES;
	const days = MIN_AGE_DAYS + (MAX_AGE_DAYS - MIN_AGE_DAYS) * Math.pow(1 - normalizedSize, 2);
	const totalMs = days * 24 * 60 * 60 * 1000;
	const uploadedMs = new Date(uploadedAt).getTime();
	const expiresAt = uploadedMs + totalMs;
	return {
		expiresAt,
		remainingMs: expiresAt - Date.now(),
		totalMs
	};
}

export function resolveUploadUrl(apiAvailable: boolean) {
	// Routage upload
	if (apiAvailable) return X0_UPLOAD_URL;
	if (import.meta.env.DEV) return X0_UPLOAD_PROXY_PATH;
	return null;
}

export function getUploadErrorDetail(error: unknown, apiAvailable: boolean) {
	if (error instanceof TypeError && error.message === "Failed to fetch") {
		return apiAvailable
			? "The request could not reach x0.at. Check your network connection and try again."
			: import.meta.env.DEV
				? "The local dev proxy could not reach x0.at. Check your network connection and restart the dev server if needed."
				: "Direct browser upload is blocked here. Start the Electron app with `npm run dev` instead of opening the Vite page alone.";
	}

	return error instanceof Error ? error.message : "Upload failed";
}

export function getUploadAccessIssue(error: unknown, apiAvailable: boolean, isOnline: boolean): UploadAccessIssue | null {
	if (!isOnline) {
		return {
			kind: "unreachable",
			detail: "No network connection detected. Reconnect to the internet to upload again."
		};
	}

	const message = error instanceof Error ? error.message : "";
	if (error instanceof TypeError && error.message === "Failed to fetch") {
		return {
			kind: "unreachable",
			detail: apiAvailable
				? "x0.at could not be reached from the app. The service may be down, filtered, or your connection may be unstable."
				: "The dev proxy could not reach x0.at. The service may be down, filtered, or your connection may be unstable."
		};
	}

	const match = message.match(/status (\d{3})/i);
	if (!match) return null;

	const status = Number(match[1]);
	if (status === 401 || status === 403 || status === 429) {
		return {
			kind: "blocked",
			detail: "Access appears blocked or rate-limited by the remote service. A different IP or waiting before retrying may be required."
		};
	}

	if (status >= 500) {
		return {
			kind: "unreachable",
			detail: "The remote upload service is currently failing. Wait and retry later."
		};
	}

	return null;
}
