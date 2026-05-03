import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, Notification, shell } from "electron";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";

const X0_BASE_URL = "https://x0.at/";
const MIN_AGE_DAYS = 3;
const MAX_AGE_DAYS = 100;
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
const UPLOAD_STORE_NAME = "uploads.json";
const DOWNLOAD_STORE_NAME = "downloads.json";
const ENCRYPTED_MAGIC = Buffer.from("X0DROP1");
const ENCRYPTED_VERSION = 1;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_BYTES = 32;
const ENCRYPTION_NONCE_BYTES = 12;
const ENCRYPTION_TAG_BYTES = 16;

type UploadRecord = {
	id: number;
	fileName: string;
	fileSize: number;
	fileHash?: string | null;
	encrypted: boolean;
	secretKey: string | null;
	mimeType: string | null;
	uploadedAt: string;
	url: string;
	x0Id: string;
};

type DownloadRecord = {
	id: number;
	fileName: string;
	fileSize: number;
	savedPath: string;
	sourceUrl: string;
	x0Id: string;
	encrypted: boolean;
	secretKey?: string | null;
	downloadedAt: string;
};

type DownloadResult = {
	record: DownloadRecord;
	encryptionDetected: boolean;
	decrypted: boolean;
};

type NewUploadRecord = Omit<UploadRecord, "id">;
type NewDownloadRecord = Omit<DownloadRecord, "id">;

let mainWindow: BrowserWindow | null = null;
let uploadsStore: UploadRecord[] = [];
let downloadsStore: DownloadRecord[] = [];
let uploadsStorePath = "";
let downloadsStorePath = "";

function getFileLifetimeMs(fileSize: number): number {
	const normalizedSize = Math.min(fileSize, MAX_FILE_SIZE_BYTES) / MAX_FILE_SIZE_BYTES;
	const days = MIN_AGE_DAYS + (MAX_AGE_DAYS - MIN_AGE_DAYS) * Math.pow(1 - normalizedSize, 2);
	return days * 24 * 60 * 60 * 1000;
}

function normalizeUploadRecord(record: Partial<UploadRecord> & Pick<UploadRecord, "fileName" | "fileSize" | "uploadedAt" | "url" | "x0Id">): UploadRecord {
	return {
		id: typeof record.id === "number" ? record.id : 0,
		fileName: record.fileName,
		fileSize: record.fileSize,
		fileHash: record.fileHash ?? null,
		encrypted: Boolean(record.encrypted),
		secretKey: record.secretKey ?? null,
		mimeType: record.mimeType ?? null,
		uploadedAt: record.uploadedAt,
		url: record.url,
		x0Id: record.x0Id
	};
}

function normalizeDownloadRecord(
	record: Partial<DownloadRecord> & Pick<DownloadRecord, "fileName" | "savedPath" | "sourceUrl" | "x0Id" | "downloadedAt">
): DownloadRecord {
	return {
		id: typeof record.id === "number" ? record.id : 0,
		fileName: record.fileName,
		fileSize: typeof record.fileSize === "number" ? record.fileSize : 0,
		savedPath: record.savedPath,
		sourceUrl: record.sourceUrl,
		x0Id: record.x0Id,
		encrypted: Boolean(record.encrypted),
		secretKey: record.secretKey ?? null,
		downloadedAt: record.downloadedAt
	};
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
	try {
		const raw = await fs.readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw) as T[];
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		const maybeError = error as NodeJS.ErrnoException;
		if (maybeError.code === "ENOENT") {
			await fs.writeFile(filePath, "[]", "utf-8");
			return [];
		}
		throw error;
	}
}

async function persistUploads() {
	await fs.writeFile(uploadsStorePath, JSON.stringify(uploadsStore, null, 2), "utf-8");
}

async function persistDownloads() {
	await fs.writeFile(downloadsStorePath, JSON.stringify(downloadsStore, null, 2), "utf-8");
}

async function initStores() {
	const userDataPath = app.getPath("userData");
	uploadsStorePath = path.join(userDataPath, UPLOAD_STORE_NAME);
	downloadsStorePath = path.join(userDataPath, DOWNLOAD_STORE_NAME);
	uploadsStore = (await readJsonArray<UploadRecord>(uploadsStorePath)).map((record) => normalizeUploadRecord(record));
	downloadsStore = (await readJsonArray<DownloadRecord>(downloadsStorePath)).map((record) => normalizeDownloadRecord(record));
}

function listUploads(): UploadRecord[] {
	return [...uploadsStore].sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
}

function listDownloads(): DownloadRecord[] {
	return [...downloadsStore].sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
}

function findUploadByHashAndMode(fileHash: string, encrypted: boolean): UploadRecord | null {
	return uploadsStore.find((upload) => upload.fileHash === fileHash && upload.encrypted === encrypted) ?? null;
}

async function hashFile(filePath: string) {
	const buffer = await fs.readFile(filePath);
	return createHash("sha256").update(buffer).digest("hex");
}

async function insertUpload(record: NewUploadRecord): Promise<UploadRecord> {
	const nextId = uploadsStore.reduce((max, item) => Math.max(max, item.id), 0) + 1;
	const nextRecord = normalizeUploadRecord({ id: nextId, ...record });
	uploadsStore = [
		nextRecord,
		...uploadsStore.filter(
			(item) => item.url !== record.url && (!record.fileHash || item.fileHash !== record.fileHash || item.encrypted !== record.encrypted)
		)
	];
	await persistUploads();
	return nextRecord;
}

async function insertDownload(record: NewDownloadRecord): Promise<DownloadRecord> {
	const nextId = downloadsStore.reduce((max, item) => Math.max(max, item.id), 0) + 1;
	const nextRecord = normalizeDownloadRecord({ id: nextId, ...record });
	downloadsStore = [nextRecord, ...downloadsStore.filter((item) => item.id !== nextId)];
	await persistDownloads();
	return nextRecord;
}

function showCompletionNotification(title: string, body: string) {
	if (Notification.isSupported()) {
		new Notification({ title, body }).show();
	}
}

function encodeSecretKey(key: Buffer) {
	return key.toString("base64url");
}

function decodeSecretKey(secretKey: string) {
	const key = Buffer.from(secretKey.trim(), "base64url");
	if (key.byteLength !== ENCRYPTION_KEY_BYTES) {
		throw new Error("Invalid decryption key format.");
	}
	return key;
}

function buildEncryptedPayload(fileName: string, fileBuffer: Buffer, secretKey: Buffer) {
	const nonce = randomBytes(ENCRYPTION_NONCE_BYTES);
	const metadataBuffer = Buffer.from(JSON.stringify({ fileName }), "utf8");
	const metadataLengthBuffer = Buffer.allocUnsafe(4);
	metadataLengthBuffer.writeUInt32BE(metadataBuffer.byteLength, 0);
	const plainBuffer = Buffer.concat([metadataLengthBuffer, metadataBuffer, fileBuffer]);
	const cipher = createCipheriv(ENCRYPTION_ALGORITHM, secretKey, nonce);
	const encryptedBuffer = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([ENCRYPTED_MAGIC, Buffer.from([ENCRYPTED_VERSION]), nonce, authTag, encryptedBuffer]);
}

function isEncryptedPayload(buffer: Buffer) {
	if (buffer.byteLength < ENCRYPTED_MAGIC.byteLength + 1 + ENCRYPTION_NONCE_BYTES + ENCRYPTION_TAG_BYTES) {
		return false;
	}
	return buffer.subarray(0, ENCRYPTED_MAGIC.byteLength).equals(ENCRYPTED_MAGIC);
}

function decryptPayload(buffer: Buffer, secretKey: string) {
	if (!isEncryptedPayload(buffer)) {
		throw new Error("This file was not encrypted by x0Drop.");
	}

	const versionOffset = ENCRYPTED_MAGIC.byteLength;
	const version = buffer.readUInt8(versionOffset);
	if (version !== ENCRYPTED_VERSION) {
		throw new Error("Unsupported encrypted file version.");
	}

	const nonceOffset = versionOffset + 1;
	const tagOffset = nonceOffset + ENCRYPTION_NONCE_BYTES;
	const cipherOffset = tagOffset + ENCRYPTION_TAG_BYTES;
	const nonce = buffer.subarray(nonceOffset, tagOffset);
	const authTag = buffer.subarray(tagOffset, cipherOffset);
	const encryptedBuffer = buffer.subarray(cipherOffset);
	const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, decodeSecretKey(secretKey), nonce);
	decipher.setAuthTag(authTag);

	let plainBuffer: Buffer;
	try {
		plainBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
	} catch {
		throw new Error("Unable to decrypt this file with the provided key.");
	}

	if (plainBuffer.byteLength < 4) {
		throw new Error("Encrypted payload is invalid.");
	}

	const metadataLength = plainBuffer.readUInt32BE(0);
	const metadataEnd = 4 + metadataLength;
	if (metadataEnd > plainBuffer.byteLength) {
		throw new Error("Encrypted payload metadata is invalid.");
	}

	const metadata = JSON.parse(plainBuffer.subarray(4, metadataEnd).toString("utf8")) as { fileName?: string };
	const fileName = metadata.fileName?.trim();
	if (!fileName) {
		throw new Error("Missing original file name in encrypted payload.");
	}

	return {
		fileName: path.basename(fileName),
		buffer: Buffer.from(plainBuffer.subarray(metadataEnd))
	};
}

async function uploadBufferToX0(fileName: string, fileBuffer: Buffer) {
	const form = new FormData();
	const blob = new Blob([new Uint8Array(fileBuffer)]);
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

	return text;
}

async function uploadToX0(filePath: string) {
	const stat = await fs.stat(filePath);
	const fileName = path.basename(filePath);
	const fileHash = await hashFile(filePath);
	const existingUpload = findUploadByHashAndMode(fileHash, false);
	if (existingUpload) {
		return existingUpload;
	}

	const remoteUrl = await uploadBufferToX0(fileName, await fs.readFile(filePath));
	const record = await insertUpload({
		fileName,
		fileSize: stat.size,
		fileHash,
		encrypted: false,
		secretKey: null,
		mimeType: null,
		uploadedAt: new Date().toISOString(),
		url: remoteUrl,
		x0Id: new URL(remoteUrl).pathname.replace("/", "")
	});

	clipboard.writeText(remoteUrl);
	showCompletionNotification("Upload complete", `${fileName} uploaded. Link copied to clipboard.`);
	return record;
}

async function uploadEncryptedToX0(filePath: string) {
	const stat = await fs.stat(filePath);
	const fileName = path.basename(filePath);
	const fileHash = await hashFile(filePath);
	const existingUpload = findUploadByHashAndMode(fileHash, true);
	if (existingUpload?.encrypted && existingUpload.secretKey) {
		return existingUpload;
	}

	const secretKeyBuffer = randomBytes(ENCRYPTION_KEY_BYTES);
	const encryptedPayload = buildEncryptedPayload(fileName, await fs.readFile(filePath), secretKeyBuffer);
	const remoteUrl = await uploadBufferToX0(`${fileName}.x0e`, encryptedPayload);
	const secretKey = encodeSecretKey(secretKeyBuffer);
	const record = await insertUpload({
		fileName,
		fileSize: stat.size,
		fileHash,
		encrypted: true,
		secretKey,
		mimeType: null,
		uploadedAt: new Date().toISOString(),
		url: remoteUrl,
		x0Id: new URL(remoteUrl).pathname.replace("/", "")
	});

	clipboard.writeText(remoteUrl);
	showCompletionNotification("Encrypted upload ready", `${fileName} uploaded in encrypted form. Link copied to clipboard.`);
	return record;
}

function normalizeX0Source(input: string) {
	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error("Provide an x0.at link or ID.");
	}

	if (/^https?:\/\//i.test(trimmed)) {
		const parsed = new URL(trimmed);
		if (parsed.hostname !== "x0.at") {
			throw new Error("Only x0.at links are supported here.");
		}
		if (!parsed.pathname || parsed.pathname === "/") {
			throw new Error("Missing x0.at file identifier.");
		}
		return `${X0_BASE_URL}${parsed.pathname.replace(/^\/+/, "")}`;
	}

	if (/^x0\.at\//i.test(trimmed)) {
		return `${X0_BASE_URL}${trimmed.replace(/^x0\.at\//i, "")}`;
	}

	if (/^[A-Za-z0-9._-]+$/.test(trimmed)) {
		return `${X0_BASE_URL}${trimmed}`;
	}

	throw new Error("Use `https://x0.at/...`, `x0.at/...`, or the raw x0.at ID.");
}

async function promptSavePath(defaultName: string) {
	const result = mainWindow
		? await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName })
		: await dialog.showSaveDialog({ defaultPath: defaultName });

	if (result.canceled || !result.filePath) {
		throw new Error("Save cancelled.");
	}

	return result.filePath;
}

async function downloadFromLink(payload: { source: string; secretKey?: string | null; recordHistory?: boolean }): Promise<DownloadResult> {
	const sourceUrl = normalizeX0Source(payload.source);
	const response = await fetch(sourceUrl);
	if (!response.ok) {
		throw new Error(`Download failed with status ${response.status}`);
	}

	const remoteBuffer = Buffer.from(await response.arrayBuffer());
	const encrypted = isEncryptedPayload(remoteBuffer);
	let outputBuffer = remoteBuffer;
	let fileName = new URL(sourceUrl).pathname.replace("/", "") || "downloaded-file";
	let decrypted = false;
	let secretKey: string | null = null;

	if (encrypted) {
		if (!payload.secretKey?.trim()) {
			throw new Error("This x0.at file is encrypted by x0Drop. Paste the decryption key to continue.");
		}

		secretKey = payload.secretKey.trim();
		const decryptedPayload = decryptPayload(remoteBuffer, payload.secretKey);
		outputBuffer = decryptedPayload.buffer;
		fileName = decryptedPayload.fileName;
		decrypted = true;
	}

	const savePath = await promptSavePath(fileName);
	await fs.writeFile(savePath, outputBuffer);
	const recordHistory = payload.recordHistory ?? true;
	const record = recordHistory
		? await insertDownload({
				fileName: path.basename(savePath),
				fileSize: outputBuffer.byteLength,
				savedPath: savePath,
				sourceUrl,
				x0Id: new URL(sourceUrl).pathname.replace("/", ""),
				encrypted,
				secretKey,
				downloadedAt: new Date().toISOString()
			})
		: normalizeDownloadRecord({
				id: 0,
				fileName: path.basename(savePath),
				fileSize: outputBuffer.byteLength,
				savedPath: savePath,
				sourceUrl,
				x0Id: new URL(sourceUrl).pathname.replace("/", ""),
				encrypted,
				secretKey,
				downloadedAt: new Date().toISOString()
			});

	showCompletionNotification(
		decrypted ? "File decrypted" : "File downloaded",
		decrypted ? `${record.fileName} restored locally.` : `${record.fileName} saved locally.`
	);

	return {
		record,
		encryptionDetected: encrypted,
		decrypted
	};
}

function createWindow() {
	const isDev = !app.isPackaged;
	Menu.setApplicationMenu(null);
	mainWindow = new BrowserWindow({
		width: 980,
		height: 760,
		minWidth: 860,
		minHeight: 680,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a1015" : "#dce8ed",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		webPreferences: {
			preload: path.join(app.getAppPath(), "dist-electron/preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

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
	void initStores().then(() => {
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
ipcMain.handle("uploads:uploadEncrypted", async (_event, filePath: string) => uploadEncryptedToX0(filePath));
ipcMain.handle(
	"uploads:record",
	async (
		_event,
		payload: {
			fileName: string;
			fileSize: number;
			fileHash?: string | null;
			encrypted?: boolean;
			secretKey?: string | null;
			uploadedAt: string;
			url: string;
			mimeType?: string | null;
		}
	) => {
		if (payload.fileHash) {
			const existingUpload = findUploadByHashAndMode(payload.fileHash, Boolean(payload.encrypted));
			if (existingUpload) {
				return existingUpload;
			}
		}

		const record = await insertUpload({
			fileName: payload.fileName,
			fileSize: payload.fileSize,
			fileHash: payload.fileHash ?? null,
			encrypted: Boolean(payload.encrypted),
			secretKey: payload.secretKey ?? null,
			mimeType: payload.mimeType ?? null,
			uploadedAt: payload.uploadedAt,
			url: payload.url,
			x0Id: new URL(payload.url).pathname.replace("/", "")
		});

		clipboard.writeText(payload.url);
		showCompletionNotification(
			record.encrypted ? "Encrypted upload ready" : "Upload complete",
			record.encrypted ? `${payload.fileName} uploaded in encrypted form.` : `${payload.fileName} uploaded. Link copied to clipboard.`
		);
		return record;
	}
);
ipcMain.handle("uploads:delete", async (_event, id: number) => {
	uploadsStore = uploadsStore.filter((upload) => upload.id !== id);
	await persistUploads();
	return listUploads();
});
ipcMain.handle("downloads:list", () => listDownloads());
ipcMain.handle("downloads:download", async (_event, payload: { source: string; secretKey?: string | null }) => downloadFromLink(payload));
ipcMain.handle("downloads:delete", async (_event, id: number) => {
	downloadsStore = downloadsStore.filter((download) => download.id !== id);
	await persistDownloads();
	return listDownloads();
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
