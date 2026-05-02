import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, Notification, shell } from "electron";
import { createHash } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";

const X0_BASE_URL = "https://x0.at/";
const MIN_AGE_DAYS = 3;
const MAX_AGE_DAYS = 100;
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
const STORE_NAME = "uploads.json";

type UploadRecord = {
	id: number;
	fileName: string;
	fileSize: number;
	fileHash?: string | null;
	mimeType: string | null;
	uploadedAt: string;
	url: string;
	x0Id: string;
};

type NewUploadRecord = Omit<UploadRecord, "id">;

let mainWindow: BrowserWindow | null = null;
let uploadsStore: UploadRecord[] = [];
let uploadsStorePath = "";

function getFileLifetimeMs(fileSize: number): number {
	const normalizedSize = Math.min(fileSize, MAX_FILE_SIZE_BYTES) / MAX_FILE_SIZE_BYTES;
	const days = MIN_AGE_DAYS + (MAX_AGE_DAYS - MIN_AGE_DAYS) * Math.pow(1 - normalizedSize, 2);
	return days * 24 * 60 * 60 * 1000;
}

async function initStore() {
	uploadsStorePath = path.join(app.getPath("userData"), STORE_NAME);
	try {
		const raw = await fs.readFile(uploadsStorePath, "utf-8");
		const parsed = JSON.parse(raw) as UploadRecord[];
		uploadsStore = Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		const maybeError = error as NodeJS.ErrnoException;
		if (maybeError.code !== "ENOENT") {
			throw error;
		}
		uploadsStore = [];
		await fs.writeFile(uploadsStorePath, "[]", "utf-8");
	}
}

async function persistStore() {
	await fs.writeFile(uploadsStorePath, JSON.stringify(uploadsStore, null, 2), "utf-8");
}

function listUploads(): UploadRecord[] {
	return [...uploadsStore].sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
}

function findUploadByHash(fileHash: string): UploadRecord | null {
	return uploadsStore.find((upload) => upload.fileHash === fileHash) ?? null;
}

async function hashFile(filePath: string) {
	const buffer = await fs.readFile(filePath);
	return createHash("sha256").update(buffer).digest("hex");
}

async function insertUpload(record: NewUploadRecord): Promise<UploadRecord> {
	const nextId = uploadsStore.reduce((max, item) => Math.max(max, item.id), 0) + 1;
	const nextRecord = { id: nextId, ...record };
	uploadsStore = [
		nextRecord,
		...uploadsStore.filter((item) => item.url !== record.url && (!record.fileHash || item.fileHash !== record.fileHash))
	];
	await persistStore();
	return nextRecord;
}

async function uploadToX0(filePath: string) {
	const stat = await fs.stat(filePath);
	const fileName = path.basename(filePath);
	const fileHash = await hashFile(filePath);
	const existingUpload = findUploadByHash(fileHash);
	if (existingUpload) {
		return existingUpload;
	}

	const form = new FormData();
	const blob = new Blob([await fs.readFile(filePath)]);
	form.append("file", blob, fileName);

	const response = await fetch(X0_BASE_URL, {
		method: "POST",
		body: form
	});

	if (!response.ok) {
		throw new Error(`Upload failed with status ${response.status}`);
	}

	const text = (await response.text()).trim();
	if (!text.startsWith("https://") && !text.startsWith("http://")) {
		throw new Error(`Unexpected x0.at response: ${text}`);
	}

	const record = await insertUpload({
		fileName,
		fileSize: stat.size,
		fileHash,
		mimeType: null,
		uploadedAt: new Date().toISOString(),
		url: text,
		x0Id: new URL(text).pathname.replace("/", "")
	});

	clipboard.writeText(text);

	if (Notification.isSupported()) {
		new Notification({
			title: "Upload complete",
			body: `${fileName} uploaded. Link copied to clipboard.`
		}).show();
	}

	return record;
}

function createWindow() {
	const isDev = !app.isPackaged;
	Menu.setApplicationMenu(null);
	mainWindow = new BrowserWindow({
		width: 780,
		height: 620,
		minWidth: 720,
		minHeight: 580,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a1015" : "#dce8ed",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		webPreferences: {
			preload: path.join(app.getAppPath(), "dist-electron/preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	// Force toutes les URLs externes à s'ouvrir dans le navigateur système.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	if (isDev) {
		void mainWindow.loadURL("http://127.0.0.1:5173");
	} else {
		void mainWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"));
	}
}

app.whenReady().then(() => {
	void initStore().then(() => {
		createWindow();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			}
		});
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

ipcMain.handle("uploads:list", () => listUploads());
ipcMain.handle("uploads:upload", async (_event, filePath: string) => uploadToX0(filePath));
ipcMain.handle(
	"uploads:record",
	async (
		_event,
		payload: { fileName: string; fileSize: number; fileHash?: string | null; uploadedAt: string; url: string; mimeType?: string | null }
	) => {
		if (payload.fileHash) {
			const existingUpload = findUploadByHash(payload.fileHash);
			if (existingUpload) {
				return existingUpload;
			}
		}

		const record = await insertUpload({
			fileName: payload.fileName,
			fileSize: payload.fileSize,
			fileHash: payload.fileHash ?? null,
			mimeType: payload.mimeType ?? null,
			uploadedAt: payload.uploadedAt,
			url: payload.url,
			x0Id: new URL(payload.url).pathname.replace("/", "")
		});

		clipboard.writeText(payload.url);

		if (Notification.isSupported()) {
			new Notification({
				title: "Upload complete",
				body: `${payload.fileName} uploaded. Link copied to clipboard.`
			}).show();
		}

		return record;
	}
);
ipcMain.handle("uploads:delete", async (_event, id: number) => {
	uploadsStore = uploadsStore.filter((upload) => upload.id !== id);
	await persistStore();
	return listUploads();
});
ipcMain.handle("system:openExternal", (_event, target: string) => shell.openExternal(target));
ipcMain.handle("system:copy", (_event, value: string) => clipboard.writeText(value));
ipcMain.handle("files:pick", async () => {
	const result = mainWindow
		? await dialog.showOpenDialog(mainWindow, {
				properties: ["openFile", "multiSelections"]
			})
		: await dialog.showOpenDialog({
				properties: ["openFile", "multiSelections"]
			});

	if (result.canceled) {
		return [];
	}

	return Promise.all(
		result.filePaths.map(async (filePath) => {
			const stat = await fs.stat(filePath);
			return {
				path: filePath,
				name: path.basename(filePath),
				size: stat.size
			};
		})
	);
});
ipcMain.handle("files:stat", async (_event, filePath: string) => {
	const stat = await fs.stat(filePath);
	return { size: stat.size, name: path.basename(filePath) };
});
ipcMain.handle("files:hash", async (_event, filePath: string) => hashFile(filePath));
ipcMain.handle("uploads:retention", (_event, fileSize: number, uploadedAt: string) => {
	const uploaded = new Date(uploadedAt).getTime();
	const expiresAt = uploaded + getFileLifetimeMs(fileSize);
	return {
		expiresAt,
		remainingMs: expiresAt - Date.now(),
		totalMs: getFileLifetimeMs(fileSize)
	};
});
