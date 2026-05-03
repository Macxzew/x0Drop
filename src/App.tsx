import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AppToast } from "./components/AppToast";
import { HistoryList } from "./components/HistoryList";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { UploadSidebar } from "./components/UploadSidebar";
import { AboutModal } from "./components/modals/AboutModal";
import { DeleteHistoryModal } from "./components/modals/DeleteHistoryModal";
import { StageUploadModal } from "./components/modals/StageUploadModal";
import type { FileDropItem, ToastState, UploadAccessIssue } from "./appTypes";
import { useAutoDismissToast } from "./hooks/useAutoDismissToast";
import { useRetentionMap } from "./hooks/useRetentionMap";
import { useStagedRetention } from "./hooks/useStagedRetention";
import { mapInputFiles, collectDroppedFiles } from "./lib/fileDrop";
import { readBrowserDownloads, readBrowserUploads, writeBrowserDownloads, writeBrowserUploads } from "./lib/browserUploads";
import { getUploadAccessIssue, getUploadErrorDetail, normalizeX0Source, resolveDownloadFetchUrl, resolveUploadUrl } from "./lib/x0";
import type { DownloadRecord, UploadRecord } from "./types";

const ENCRYPTED_MAGIC = "X0DROP1";
const ENCRYPTED_VERSION = 1;
const ENCRYPTION_KEY_BYTES = 32;
const ENCRYPTION_NONCE_BYTES = 12;
const ENCRYPTION_TAG_BYTES = 16;

function createBrowserRecordId() {
	return Date.now() + Math.floor(Math.random() * 1_000_000);
}

function filterUploads(uploads: UploadRecord[], query: string) {
	if (!query) return uploads;

	const terms = query.split(/\s+/).filter(Boolean);
	return uploads.filter((upload) => {
		const haystack = `${upload.fileName} ${upload.url} ${upload.x0Id}`.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

function filterDownloads(downloads: DownloadRecord[], query: string) {
	if (!query) return downloads;

	const terms = query.split(/\s+/).filter(Boolean);
	return downloads.filter((download) => {
		const haystack = `${download.fileName} ${download.sourceUrl} ${download.savedPath} ${download.x0Id}`.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

export function App() {
	const [uploads, setUploads] = useState<UploadRecord[]>(() => {
		const apiAvailable = typeof window !== "undefined" && typeof window.x0Desk !== "undefined";
		return apiAvailable ? [] : readBrowserUploads();
	});
	const [downloads, setDownloads] = useState<DownloadRecord[]>(() => {
		const apiAvailable = typeof window !== "undefined" && typeof window.x0Desk !== "undefined";
		return apiAvailable ? [] : readBrowserDownloads();
	});
	const [isDragging, setIsDragging] = useState(false);
	const [showDragCancel, setShowDragCancel] = useState(false);
	const [isInfoOpen, setIsInfoOpen] = useState(false);
	const [isClosingInfo, setIsClosingInfo] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [pending, setPending] = useState<string[]>([]);
	const [stagedFiles, setStagedFiles] = useState<FileDropItem[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [encryptBeforeUpload, setEncryptBeforeUpload] = useState(true);
	const [downloadSource, setDownloadSource] = useState("");
	const [downloadSecretKey, setDownloadSecretKey] = useState("");
	const [downloadSearchQuery, setDownloadSearchQuery] = useState("");
	const [isDownloading, setIsDownloading] = useState(false);
	const [deletingId, setDeletingId] = useState<number | null>(null);
	const [deletingDownloadId, setDeletingDownloadId] = useState<number | null>(null);
	const [pendingDeleteUpload, setPendingDeleteUpload] = useState<UploadRecord | null>(null);
	const [isClosingDelete, setIsClosingDelete] = useState(false);
	const [isClosingStage, setIsClosingStage] = useState(false);
	const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
	const [toast, setToast] = useState<ToastState | null>(null);
	const [uploadAccessIssue, setUploadAccessIssue] = useState<UploadAccessIssue | null>(null);
	const [isClosingToast, setIsClosingToast] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const dragTimeoutRef = useRef<number | null>(null);
	const dragDismissedRef = useRef(false);
	const toastCloseTimeoutRef = useRef<number | null>(null);
	const apiAvailable = typeof window !== "undefined" && typeof window.x0Desk !== "undefined";
	const deferredSearchQuery = useDeferredValue(searchQuery);

	const { retentionMap, setRetentionMap } = useRetentionMap(uploads, apiAvailable);
	const { stagedRetention, setStagedRetention } = useStagedRetention(stagedFiles);
	useAutoDismissToast(toast, closeToast);

	const primaryStagedFile = stagedFiles[0] ?? null;
	const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
	const appStatusClassName = !isOnline
		? "offline"
		: uploadAccessIssue?.kind === "blocked"
			? "blocked"
			: uploadAccessIssue?.kind === "unreachable"
				? "unreachable"
				: "online";
	const stagedCountLabel = useMemo(() => {
		if (stagedFiles.length <= 1) return "";
		return `+${stagedFiles.length - 1}`;
	}, [stagedFiles]);
	const filteredUploads = useMemo(() => filterUploads(uploads, normalizedQuery), [normalizedQuery, uploads]);
	const filteredDownloads = useMemo(
		() => filterDownloads(downloads, downloadSearchQuery.trim().toLowerCase()),
		[downloadSearchQuery, downloads]
	);

	useEffect(() => {
		if (!apiAvailable) return;
		void Promise.all([window.x0Desk.listUploads(), window.x0Desk.listDownloads()]).then(([records, downloadRecords]) => {
			setUploads(records);
			setDownloads(downloadRecords);
		});
	}, [apiAvailable]);

	useEffect(() => {
		return () => {
			if (dragTimeoutRef.current !== null) {
				window.clearTimeout(dragTimeoutRef.current);
			}
			if (toastCloseTimeoutRef.current !== null) {
				window.clearTimeout(toastCloseTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	function showToast(nextToast: ToastState) {
		if (toastCloseTimeoutRef.current !== null) {
			window.clearTimeout(toastCloseTimeoutRef.current);
			toastCloseTimeoutRef.current = null;
		}
		setIsClosingToast(false);
		setToast(nextToast);
	}

	function closeToast() {
		if (!toast || isClosingToast) return;
		setIsClosingToast(true);
		toastCloseTimeoutRef.current = window.setTimeout(() => {
			setToast(null);
			setIsClosingToast(false);
			toastCloseTimeoutRef.current = null;
		}, 220);
	}

	function clearDragTimeout() {
		if (dragTimeoutRef.current === null) return;
		window.clearTimeout(dragTimeoutRef.current);
		dragTimeoutRef.current = null;
	}

	function armDragTimeout() {
		if (dragTimeoutRef.current !== null) return;
		dragTimeoutRef.current = window.setTimeout(() => {
			setShowDragCancel(true);
			dragTimeoutRef.current = null;
		}, 10_000);
	}

	function cancelDragOverlay() {
		clearDragTimeout();
		dragDismissedRef.current = true;
		setShowDragCancel(false);
		setIsDragging(false);
	}

	function closeStage() {
		setIsClosingStage(true);
		window.setTimeout(() => {
			setStagedFiles([]);
			setStagedRetention(null);
			setIsClosingStage(false);
		}, 220);
	}

	function closeInfoModal() {
		setIsClosingInfo(true);
		window.setTimeout(() => {
			setIsInfoOpen(false);
			setIsClosingInfo(false);
		}, 220);
	}

	function closeDeleteModal() {
		if (deletingId === pendingDeleteUpload?.id) return;

		setIsClosingDelete(true);
		window.setTimeout(() => {
			setPendingDeleteUpload(null);
			setIsClosingDelete(false);
		}, 220);
	}

	async function copyText(value: string) {
		if (apiAvailable) {
			await window.x0Desk.copyToClipboard(value);
			return;
		}

		if (!navigator.clipboard?.writeText) {
			throw new Error("Clipboard API unavailable in this context.");
		}

		await navigator.clipboard.writeText(value);
	}

	async function openLink(target: string) {
		if (apiAvailable) {
			await window.x0Desk.openExternal(target);
			return;
		}

		window.open(target, "_blank", "noopener,noreferrer");
	}

	async function hashBrowserFile(file: File) {
		const buffer = await file.arrayBuffer();
		const digest = await crypto.subtle.digest("SHA-256", buffer);
		return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
	}

	function encodeBase64Url(bytes: Uint8Array) {
		const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
		return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	}

	function decodeBase64Url(value: string) {
		const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
		const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
		const binary = atob(normalized + padding);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	}

	function hasEncryptedMagic(bytes: Uint8Array) {
		const magicBytes = new TextEncoder().encode(ENCRYPTED_MAGIC);
		if (bytes.byteLength < magicBytes.byteLength + 1 + ENCRYPTION_NONCE_BYTES + ENCRYPTION_TAG_BYTES) {
			return false;
		}

		for (let index = 0; index < magicBytes.byteLength; index += 1) {
			if (bytes[index] !== magicBytes[index]) {
				return false;
			}
		}

		return true;
	}

	async function decryptBrowserPayload(payloadBytes: Uint8Array, secretKey: string) {
		if (!hasEncryptedMagic(payloadBytes)) {
			throw new Error("This file was not encrypted by x0Drop.");
		}

		const versionOffset = ENCRYPTED_MAGIC.length;
		const version = payloadBytes[versionOffset];
		if (version !== ENCRYPTED_VERSION) {
			throw new Error("Unsupported encrypted file version.");
		}

		const nonceOffset = versionOffset + 1;
		const tagOffset = nonceOffset + ENCRYPTION_NONCE_BYTES;
		const cipherOffset = tagOffset + ENCRYPTION_TAG_BYTES;
		const nonce = payloadBytes.slice(nonceOffset, tagOffset);
		const authTag = payloadBytes.slice(tagOffset, cipherOffset);
		const ciphertext = payloadBytes.slice(cipherOffset);
		const encryptedBytesWithTag = new Uint8Array(ciphertext.byteLength + authTag.byteLength);
		encryptedBytesWithTag.set(ciphertext, 0);
		encryptedBytesWithTag.set(authTag, ciphertext.byteLength);

		const secretKeyBytes = decodeBase64Url(secretKey);
		if (secretKeyBytes.byteLength !== ENCRYPTION_KEY_BYTES) {
			throw new Error("Invalid decryption key format.");
		}

		const cryptoKey = await crypto.subtle.importKey("raw", secretKeyBytes, "AES-GCM", false, ["decrypt"]);
		let plainBuffer: ArrayBuffer;
		try {
			plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, encryptedBytesWithTag);
		} catch {
			throw new Error("Unable to decrypt this file with the provided key.");
		}

		const plainBytes = new Uint8Array(plainBuffer);
		if (plainBytes.byteLength < 4) {
			throw new Error("Encrypted payload is invalid.");
		}

		const metadataLength = new DataView(plainBytes.buffer, plainBytes.byteOffset, plainBytes.byteLength).getUint32(0, false);
		const metadataEnd = 4 + metadataLength;
		if (metadataEnd > plainBytes.byteLength) {
			throw new Error("Encrypted payload metadata is invalid.");
		}

		const metadataRaw = new TextDecoder().decode(plainBytes.slice(4, metadataEnd));
		const metadata = JSON.parse(metadataRaw) as { fileName?: string };
		const fileName = metadata.fileName?.trim();
		if (!fileName) {
			throw new Error("Missing original file name in encrypted payload.");
		}

		return {
			fileName,
			fileBytes: plainBytes.slice(metadataEnd)
		};
	}

	async function buildEncryptedBrowserPayload(fileItem: FileDropItem) {
		if (!fileItem.file) {
			throw new Error("No browser file data available for encrypted upload.");
		}

		const fileBuffer = await fileItem.file.arrayBuffer();
		const secretKeyBytes = crypto.getRandomValues(new Uint8Array(ENCRYPTION_KEY_BYTES));
		const nonce = crypto.getRandomValues(new Uint8Array(ENCRYPTION_NONCE_BYTES));
		const metadataBytes = new TextEncoder().encode(JSON.stringify({ fileName: fileItem.name }));
		const metadataLengthBytes = new Uint8Array(4);
		new DataView(metadataLengthBytes.buffer).setUint32(0, metadataBytes.byteLength, false);
		const plainBytes = new Uint8Array(metadataLengthBytes.byteLength + metadataBytes.byteLength + fileBuffer.byteLength);
		plainBytes.set(metadataLengthBytes, 0);
		plainBytes.set(metadataBytes, metadataLengthBytes.byteLength);
		plainBytes.set(new Uint8Array(fileBuffer), metadataLengthBytes.byteLength + metadataBytes.byteLength);

		const cryptoKey = await crypto.subtle.importKey("raw", secretKeyBytes, "AES-GCM", false, ["encrypt"]);
		const encryptedArrayBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, plainBytes);
		const encryptedBytesWithTag = new Uint8Array(encryptedArrayBuffer);
		const ciphertext = encryptedBytesWithTag.slice(0, encryptedBytesWithTag.byteLength - ENCRYPTION_TAG_BYTES);
		const authTag = encryptedBytesWithTag.slice(encryptedBytesWithTag.byteLength - ENCRYPTION_TAG_BYTES);
		const magicBytes = new TextEncoder().encode(ENCRYPTED_MAGIC);
		const payload = new Uint8Array(
			magicBytes.byteLength + 1 + nonce.byteLength + authTag.byteLength + ciphertext.byteLength
		);
		let offset = 0;
		payload.set(magicBytes, offset);
		offset += magicBytes.byteLength;
		payload[offset] = ENCRYPTED_VERSION;
		offset += 1;
		payload.set(nonce, offset);
		offset += nonce.byteLength;
		payload.set(authTag, offset);
		offset += authTag.byteLength;
		payload.set(ciphertext, offset);

		return {
			payload,
			secretKey: encodeBase64Url(secretKeyBytes)
		};
	}

	async function hashFileItem(fileItem: FileDropItem): Promise<string | null> {
		if (fileItem.file) {
			return hashBrowserFile(fileItem.file);
		}

		if (fileItem.path && apiAvailable) {
			return window.x0Desk.hashFile(fileItem.path);
		}

		return null;
	}

	function findExistingUploadByHash(fileHash: string, encrypted: boolean) {
		return uploads.find((upload) => upload.fileHash === fileHash && upload.encrypted === encrypted) ?? null;
	}

	async function saveUploadRecord(
		fileItem: FileDropItem,
		url: string,
		uploadedAt: string,
		fileHash: string | null,
		encrypted = false,
		secretKey: string | null = null
	): Promise<UploadRecord> {
		if (apiAvailable) {
			return window.x0Desk.recordUpload({
				fileName: fileItem.name,
				fileSize: fileItem.size,
				fileHash,
				encrypted,
				secretKey,
				uploadedAt,
				url,
				mimeType: fileItem.file?.type || null
			});
		}

		return {
			id: createBrowserRecordId(),
			fileName: fileItem.name,
			fileSize: fileItem.size,
			fileHash,
			encrypted,
			secretKey,
			mimeType: fileItem.file?.type || null,
			uploadedAt,
			url,
			x0Id: new URL(url).pathname.replace("/", "")
		};
	}

	async function uploadFromBrowserFile(fileItem: FileDropItem) {
		if (!fileItem.file) {
			throw new Error("No browser file data available for upload.");
		}

		const fileHash = await hashFileItem(fileItem);
		if (fileHash) {
			const existingUpload = findExistingUploadByHash(fileHash, encryptBeforeUpload);
			if (existingUpload) {
				return existingUpload;
			}
		}

		const uploadUrl = resolveUploadUrl(apiAvailable);
		if (!uploadUrl) {
			throw new Error("Direct browser upload is not available in this build. Start the Electron app to upload files.");
		}

		const form = new FormData();
		let secretKey: string | null = null;
		if (encryptBeforeUpload) {
			const encryptedUpload = await buildEncryptedBrowserPayload(fileItem);
			form.append("file", new Blob([encryptedUpload.payload]), `${fileItem.name}.x0e`);
			secretKey = encryptedUpload.secretKey;
		} else {
			form.append("file", fileItem.file, fileItem.name);
		}

		const response = await fetch(uploadUrl, {
			method: "POST",
			body: form
		});

		if (!response.ok) {
			throw new Error(`Upload failed with status ${response.status}`);
		}

		const url = (await response.text()).trim();
		if (!url.startsWith("https://") && !url.startsWith("http://")) {
			throw new Error(`Unexpected x0.at response: ${url}`);
		}

		const uploadedAt = new Date().toISOString();
		const record = await saveUploadRecord(fileItem, url, uploadedAt, fileHash, encryptBeforeUpload, secretKey);
		if (!apiAvailable) {
			writeBrowserUploads([record, ...readBrowserUploads().filter((item) => item.url !== record.url)]);
		}
		await copyText(url);
		return record;
	}

	async function uploadSingleFile(file: FileDropItem) {
		if (file.path && apiAvailable) {
			return encryptBeforeUpload ? window.x0Desk.uploadEncryptedFile(file.path) : window.x0Desk.uploadFile(file.path);
		}

		if (file.file) {
			return uploadFromBrowserFile(file);
		}

		throw new Error("The selected file does not expose a usable local path or file payload.");
	}

	async function uploadFiles(files: FileDropItem[]) {
		if (!files.length) return;

		setPending(files.map((file) => file.name));
		setIsSending(true);

		try {
			const knownHashes = new Set(
				uploads
					.filter((upload) => upload.encrypted === encryptBeforeUpload)
					.map((upload) => upload.fileHash)
					.filter((hash): hash is string => Boolean(hash))
			);
			const batchHashes = new Set<string>();
			const results: UploadRecord[] = [];
			const duplicateNames: string[] = [];
			for (const file of files) {
				const fileHash = await hashFileItem(file);
				if (fileHash) {
					const duplicateRecord = findExistingUploadByHash(fileHash, encryptBeforeUpload);
					if (knownHashes.has(fileHash) || batchHashes.has(fileHash) || duplicateRecord) {
						duplicateNames.push(file.name);
						continue;
					}
					batchHashes.add(fileHash);
				}

				results.push(await uploadSingleFile(file));
			}

			if (results.length > 0) {
				setUploadAccessIssue(null);
				setUploads((current) => [...results, ...current.filter((item) => !results.some((result) => result.id === item.id))]);
			}

			if (duplicateNames.length > 0 && results.length === 0) {
				showToast({
					kind: "success",
					title: duplicateNames.length === 1 ? `${duplicateNames[0]} already uploaded` : `${duplicateNames.length} files already uploaded`
				});
			} else {
				const encryptedCount = results.filter((result) => result.encrypted).length;
				showToast({
					kind: "success",
					title: results.length === 1 ? `${results[0].fileName} uploaded` : `${results.length} files uploaded`,
					detail:
						encryptedCount > 0
							? `${encryptedCount} encrypted upload${encryptedCount > 1 ? "s are" : " is"} ready. Copy the key separately from the link.`
							: duplicateNames.length > 0
								? `${duplicateNames.length} duplicate ${duplicateNames.length === 1 ? "file was" : "files were"} skipped because the same hash is already in history.`
								: undefined
				});
			}
		} catch (error) {
			setUploadAccessIssue(getUploadAccessIssue(error, apiAvailable, isOnline));
			showToast({
				kind: "error",
				title: "Upload failed",
				detail: getUploadErrorDetail(error, apiAvailable)
			});
		} finally {
			closeStage();
			setPending([]);
			setIsSending(false);
		}
	}

	async function normalizeStagedFiles(files: FileDropItem[]) {
		return Promise.all(
			files.map(async (file) => {
				if (file.size > 0 || !apiAvailable || !file.path) return file;

				try {
					const stat = await window.x0Desk.statFile(file.path);
					return { ...file, size: stat.size, name: stat.name || file.name };
				} catch {
					return file;
				}
			})
		);
	}

	function showUnresolvedSizeToast(files: FileDropItem[]) {
		const unresolved = files.find((file) => file.size <= 0);
		if (!unresolved) return;

		showToast({
			kind: "error",
			title: "Size unavailable",
			detail: "The file size could not be read, so the expiration estimate cannot be computed yet. Drag files from your file manager or use the native picker."
		});
	}

	async function stageFiles(files: FileDropItem[]) {
		if (!files.length) return;

		const normalized = await normalizeStagedFiles(files);
		showUnresolvedSizeToast(normalized);
		clearDragTimeout();
		dragDismissedRef.current = false;
		setShowDragCancel(false);
		setStagedFiles(normalized);
		setIsDragging(false);
	}

	async function confirmDeleteUpload() {
		if (!pendingDeleteUpload) return;

		const upload = pendingDeleteUpload;
		setDeletingId(upload.id);

		try {
			if (apiAvailable && upload.id > 0) {
				setUploads(await window.x0Desk.deleteUpload(upload.id));
			} else {
				const nextUploads = uploads.filter((item) => item.id !== upload.id);
				writeBrowserUploads(nextUploads);
				setUploads(nextUploads);
			}

			setRetentionMap((current) => {
				const next = { ...current };
				delete next[upload.id];
				return next;
			});

			showToast({
				kind: "success",
				title: "History entry removed"
			});
		} catch (error) {
			showToast({
				kind: "error",
				title: "Delete failed",
				detail: error instanceof Error ? error.message : "Unable to remove the history entry"
			});
		} finally {
			closeDeleteModal();
			setDeletingId(null);
		}
	}

	function handleCopyLink(upload: UploadRecord) {
		void copyText(upload.url).then(
			() =>
				showToast({
					kind: "success",
					title: "Link copied"
				}),
			(error) =>
				showToast({
					kind: "error",
					title: "Copy failed",
					detail: error instanceof Error ? error.message : "Unable to copy the upload URL"
				})
		);
	}

	function handleCopySecret(upload: UploadRecord) {
		if (!upload.secretKey) return;

		void copyText(upload.secretKey).then(
			() =>
				showToast({
					kind: "success",
					title: "Decryption key copied"
				}),
			(error) =>
				showToast({
					kind: "error",
					title: "Copy failed",
					detail: error instanceof Error ? error.message : "Unable to copy the decryption key"
				})
		);
	}

	function isUserCancelledSave(error: unknown): boolean {
		if (error instanceof DOMException && error.name === "AbortError") {
			return true;
		}
		if (error instanceof Error && error.message === "Save cancelled.") {
			return true;
		}
		return false;
	}

	function handleDownloadUpload(upload: UploadRecord) {
		if (isDownloading) {
			return;
		}

		// Pre-fill the recovery inputs so the user sees what is being downloaded.
		setDownloadSource(upload.url);
		if (upload.encrypted && upload.secretKey) {
			setDownloadSecretKey(upload.secretKey);
		}

		void (async () => {
			setIsDownloading(true);
			try {
				if (!apiAvailable) {
					const sourceUrl = normalizeX0Source(upload.url);
					const fetchUrl = resolveDownloadFetchUrl(sourceUrl, apiAvailable);
					if (!fetchUrl) {
						throw new Error("Direct browser recovery needs the dev server proxy or the Electron desktop app.");
					}

					const response = await fetch(fetchUrl);
					if (!response.ok) {
						throw new Error(`Download failed with status ${response.status}`);
					}

					const blob = await response.blob();
					const remoteBytes = new Uint8Array(await blob.arrayBuffer());
					const encryptionDetected = hasEncryptedMagic(remoteBytes);
					let finalFileName = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "downloaded-file");
					let finalBlob = blob;
					let decrypted = false;

					if (encryptionDetected) {
						if (!upload.secretKey) {
							throw new Error("This x0.at file is encrypted by x0Drop. Copy the decryption key from history to continue.");
						}

						const decryptedPayload = await decryptBrowserPayload(remoteBytes, upload.secretKey);
						finalFileName = decryptedPayload.fileName;
						finalBlob = new Blob([decryptedPayload.fileBytes]);
						decrypted = true;
					}

					if (window.showSaveFilePicker) {
						const handle = await window.showSaveFilePicker({
							suggestedName: finalFileName
						});
						const writable = await handle.createWritable();
						await writable.write(finalBlob);
						await writable.close();
					} else {
						const objectUrl = window.URL.createObjectURL(finalBlob);
						const link = document.createElement("a");
						link.href = objectUrl;
						link.download = finalFileName;
						link.rel = "noopener noreferrer";
						document.body.append(link);
						link.click();
						link.remove();
						window.URL.revokeObjectURL(objectUrl);
					}

					showToast({
						kind: "success",
						title: decrypted ? "File decrypted locally" : window.showSaveFilePicker ? "File saved locally" : "Download started",
						detail: decrypted
							? "The encrypted x0Drop container was decrypted in the browser and saved locally."
							: window.showSaveFilePicker
								? "The file was saved through the browser's native save dialog and recorded in local history."
								: "The browser fallback download was started."
					});
					return;
				}

				const result = await window.x0Desk.downloadFromLink({
					source: upload.url,
					secretKey: upload.secretKey ?? null,
					recordHistory: false
				});
				showToast({
					kind: "success",
					title: result.decrypted ? "File decrypted locally" : "File downloaded",
					detail: result.decrypted
						? "The encrypted x0Drop container was restored and written to disk."
						: result.encryptionDetected
							? "The file was encrypted and restored locally."
							: "The remote file was saved locally."
				});
			} catch (error) {
				if (isUserCancelledSave(error)) {
					return;
				}
				showToast({
					kind: "error",
					title: "Download failed",
					detail: error instanceof Error ? error.message : "Unable to download the requested file"
				});
			} finally {
				setIsDownloading(false);
			}
		})();
	}

	async function handleRecoverDownload() {
		const sourceInput = downloadSource;
		const secretKeyInput = downloadSecretKey;
		setDownloadSource("");
		setDownloadSecretKey("");

		setIsDownloading(true);
		try {
			if (!apiAvailable) {
				const sourceUrl = normalizeX0Source(sourceInput);
				const fetchUrl = resolveDownloadFetchUrl(sourceUrl, apiAvailable);
				if (!fetchUrl) {
					throw new Error("Direct browser recovery needs the dev server proxy or the Electron desktop app.");
				}

				const response = await fetch(fetchUrl);
				if (!response.ok) {
					throw new Error(`Download failed with status ${response.status}`);
				}

				const blob = await response.blob();
				const remoteBytes = new Uint8Array(await blob.arrayBuffer());
				const encryptionDetected = hasEncryptedMagic(remoteBytes);
				let finalFileName = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "downloaded-file");
				let finalBlob = blob;
				let decrypted = false;

				if (encryptionDetected) {
					if (!secretKeyInput.trim()) {
						throw new Error("This x0.at file is encrypted by x0Drop. Paste the decryption key to continue.");
					}

					const decryptedPayload = await decryptBrowserPayload(remoteBytes, secretKeyInput);
					finalFileName = decryptedPayload.fileName;
					finalBlob = new Blob([decryptedPayload.fileBytes]);
					decrypted = true;
				}

				if (window.showSaveFilePicker) {
					const handle = await window.showSaveFilePicker({
						suggestedName: finalFileName
					});
					const writable = await handle.createWritable();
					await writable.write(finalBlob);
					await writable.close();
				} else {
					const objectUrl = window.URL.createObjectURL(finalBlob);
					const link = document.createElement("a");
					link.href = objectUrl;
					link.download = finalFileName;
					link.rel = "noopener noreferrer";
					document.body.append(link);
					link.click();
					link.remove();
					window.URL.revokeObjectURL(objectUrl);
				}

				const record: DownloadRecord = {
					id: createBrowserRecordId(),
					fileName: finalFileName,
					fileSize: finalBlob.size,
					savedPath: window.showSaveFilePicker ? finalFileName : "Browser download",
					sourceUrl,
					x0Id: new URL(sourceUrl).pathname.replace("/", ""),
					encrypted: encryptionDetected,
					secretKey: encryptionDetected ? secretKeyInput.trim() : null,
					downloadedAt: new Date().toISOString()
				};

				const nextDownloads = [record, ...downloads.filter((item) => item.sourceUrl !== record.sourceUrl)];
				writeBrowserDownloads(nextDownloads);
				setDownloads(nextDownloads);
				showToast({
					kind: "success",
					title: decrypted ? "File decrypted locally" : window.showSaveFilePicker ? "File saved locally" : "Download started",
					detail: decrypted
						? "The encrypted x0Drop container was decrypted in the browser and saved locally."
						: window.showSaveFilePicker
							? "The file was saved through the browser's native save dialog and recorded in local history."
							: "The browser fallback download was started and recorded in local history."
				});
				setDownloadSource("");
				setDownloadSecretKey("");
				return;
			}

			const result = await window.x0Desk.downloadFromLink({
				source: sourceInput,
				secretKey: secretKeyInput || null
			});
			setDownloads((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
			showToast({
				kind: "success",
				title: result.decrypted ? "File decrypted locally" : "File downloaded",
				detail: result.decrypted
					? "The encrypted x0Drop container was restored and written to disk."
					: result.encryptionDetected
						? "The file was encrypted and restored locally."
						: "The remote file was saved locally."
			});
		} catch (error) {
			if (isUserCancelledSave(error)) {
				return;
			}
			showToast({
				kind: "error",
				title: "Download failed",
				detail: error instanceof Error ? error.message : "Unable to download the requested file"
			});
		} finally {
			setIsDownloading(false);
		}
	}

	function handleDownloadAgain(download: DownloadRecord) {
		if (isDownloading) {
			return;
		}

		const effectiveSecretKey = (download.secretKey ?? downloadSecretKey).trim();
		setDownloadSource(download.sourceUrl);

		if (download.encrypted) {
			if (download.secretKey) {
				setDownloadSecretKey(download.secretKey);
			}
			if (!effectiveSecretKey) {
				showToast({
					kind: "error",
					title: "Decryption key required",
					detail: "Enter the decryption key, then click Download again to restore this encrypted file."
				});
				return;
			}
		}

		void (async () => {
			const secretKeyToUse = effectiveSecretKey || null;
			setIsDownloading(true);
			try {
				if (!apiAvailable) {
					const sourceUrl = normalizeX0Source(download.sourceUrl);
					const fetchUrl = resolveDownloadFetchUrl(sourceUrl, apiAvailable);
					if (!fetchUrl) {
						throw new Error("Direct browser recovery needs the dev server proxy or the Electron desktop app.");
					}

					const response = await fetch(fetchUrl);
					if (!response.ok) {
						throw new Error(`Download failed with status ${response.status}`);
					}

					const blob = await response.blob();
					const remoteBytes = new Uint8Array(await blob.arrayBuffer());
					const encryptionDetected = hasEncryptedMagic(remoteBytes);
					let finalFileName = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "downloaded-file");
					let finalBlob = blob;
					let decrypted = false;

					if (encryptionDetected) {
						if (!secretKeyToUse) {
							throw new Error("This x0.at file is encrypted by x0Drop. Paste the decryption key to continue.");
						}

						const decryptedPayload = await decryptBrowserPayload(remoteBytes, secretKeyToUse);
						finalFileName = decryptedPayload.fileName;
						finalBlob = new Blob([decryptedPayload.fileBytes]);
						decrypted = true;
					}

					if (window.showSaveFilePicker) {
						const handle = await window.showSaveFilePicker({
							suggestedName: finalFileName
						});
						const writable = await handle.createWritable();
						await writable.write(finalBlob);
						await writable.close();
					} else {
						const objectUrl = window.URL.createObjectURL(finalBlob);
						const link = document.createElement("a");
						link.href = objectUrl;
						link.download = finalFileName;
						link.rel = "noopener noreferrer";
						document.body.append(link);
						link.click();
						link.remove();
						window.URL.revokeObjectURL(objectUrl);
					}

					const record: DownloadRecord = {
						id: createBrowserRecordId(),
						fileName: finalFileName,
						fileSize: finalBlob.size,
						savedPath: window.showSaveFilePicker ? finalFileName : "Browser download",
						sourceUrl,
						x0Id: new URL(sourceUrl).pathname.replace("/", ""),
						encrypted: encryptionDetected,
						secretKey: encryptionDetected ? secretKeyToUse : null,
						downloadedAt: new Date().toISOString()
					};

					const nextDownloads = [record, ...downloads.filter((item) => item.sourceUrl !== record.sourceUrl)];
					writeBrowserDownloads(nextDownloads);
					setDownloads(nextDownloads);
					showToast({
						kind: "success",
						title: decrypted ? "File decrypted locally" : window.showSaveFilePicker ? "File saved locally" : "Download started",
						detail: decrypted
							? "The encrypted x0Drop container was decrypted in the browser and saved locally."
							: window.showSaveFilePicker
								? "The file was saved through the browser's native save dialog and recorded in local history."
								: "The browser fallback download was started and recorded in local history."
					});
					return;
				}

				const result = await window.x0Desk.downloadFromLink({
					source: download.sourceUrl,
					secretKey: secretKeyToUse
				});
				setDownloads((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
				showToast({
					kind: "success",
					title: result.decrypted ? "File decrypted locally" : "File downloaded",
					detail: result.decrypted
						? "The encrypted x0Drop container was restored and written to disk."
						: result.encryptionDetected
							? "The file was encrypted and restored locally."
							: "The remote file was saved locally."
				});
			} catch (error) {
				if (isUserCancelledSave(error)) {
					return;
				}
				showToast({
					kind: "error",
					title: "Download failed",
					detail: error instanceof Error ? error.message : "Unable to download the requested file"
				});
			} finally {
				setIsDownloading(false);
			}
		})();
	}

	function handleCopyDownloadLink(download: DownloadRecord) {
		void copyText(download.sourceUrl).then(
			() =>
				showToast({
					kind: "success",
					title: "Link copied"
				}),
			(error) =>
				showToast({
					kind: "error",
					title: "Copy failed",
					detail: error instanceof Error ? error.message : "Unable to copy the source URL"
				})
		);
	}

	function handleCopyDownloadSecret(download: DownloadRecord) {
		if (!download.secretKey) return;

		void copyText(download.secretKey).then(
			() =>
				showToast({
					kind: "success",
					title: "Decryption key copied"
				}),
			(error) =>
				showToast({
					kind: "error",
					title: "Copy failed",
					detail: error instanceof Error ? error.message : "Unable to copy the decryption key"
				})
		);
	}

	function handleDeleteDownload(download: DownloadRecord) {
		if (!apiAvailable) {
			setDeletingDownloadId(download.id);
			const nextDownloads = downloads.filter((item) => item.id !== download.id);
			writeBrowserDownloads(nextDownloads);
			setDownloads(nextDownloads);
			showToast({
				kind: "success",
				title: "Recovery history entry removed"
			});
			setDeletingDownloadId(null);
			return;
		}

		setDeletingDownloadId(download.id);
		void window.x0Desk.deleteDownload(download.id).then(
			(records) => {
				setDownloads(records);
				showToast({
					kind: "success",
					title: "Recovery history entry removed"
				});
			},
			(error) =>
				showToast({
					kind: "error",
					title: "Delete failed",
					detail: error instanceof Error ? error.message : "Unable to remove the recovery history entry"
				})
		).finally(() => {
			setDeletingDownloadId(null);
		});
	}

	async function handleDrop(event: React.DragEvent<HTMLElement>) {
		event.preventDefault();
		event.stopPropagation();

		clearDragTimeout();
		dragDismissedRef.current = false;
		setShowDragCancel(false);
		setIsDragging(false);

		const files = await collectDroppedFiles(event.dataTransfer);

		if (!files.length) {
			showToast({
				kind: "error",
				title: "No file detected",
				detail: "The dropped item was not detected as a file. Try dragging directly from your file manager."
			});
			return;
		}

		await stageFiles(files);
	}

	function handleDragEnter(event: React.DragEvent<HTMLElement>) {
		event.preventDefault();

		if (dragDismissedRef.current && event.dataTransfer.types.includes("Files")) {
			dragDismissedRef.current = false;
		}

		if (!stagedFiles.length) {
			armDragTimeout();
			setShowDragCancel(false);
			setIsDragging(true);
		}
	}

	function handleDragOver(event: React.DragEvent<HTMLElement>) {
		event.preventDefault();

		if (dragDismissedRef.current && event.dataTransfer.types.includes("Files")) {
			dragDismissedRef.current = false;
		}

		if (!stagedFiles.length) {
			setIsDragging(true);
		}
	}

	function handleDragLeave(event: React.DragEvent<HTMLElement>) {
		event.preventDefault();
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		clearDragTimeout();
		dragDismissedRef.current = false;
		setShowDragCancel(false);
		setIsDragging(false);
	}

	async function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
		const files = event.target.files;
		if (!files) return;

		await stageFiles(mapInputFiles(files));
		event.target.value = "";
	}

	async function handlePickFiles() {
		if (isSending) return;

		if (!apiAvailable) {
			fileInputRef.current?.click();
			return;
		}

		try {
			const selected = await window.x0Desk.pickFiles();
			if (selected.length > 0) {
				await stageFiles(selected);
				return;
			}
		} catch (error) {
			showToast({
				kind: "error",
				title: "Picker failed",
				detail: error instanceof Error ? error.message : "Unable to open native file picker"
			});
		}

		fileInputRef.current?.click();
	}

	return (
		<div
			className={`appShell ${appStatusClassName}`}
			onDrop={handleDrop}
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			<div className={`appBackdrop status-${appStatusClassName}`} aria-hidden="true">
				<div className="backdropGlow theme-online" />
				<div className="backdropGlow theme-offline" />
				<div className="backdropGlow theme-blocked" />
				<div className="backdropGlow theme-unreachable" />
				<div className="backdropStreams theme-online" />
				<div className="backdropStreams theme-offline" />
				<div className="backdropStreams theme-blocked" />
				<div className="backdropStreams theme-unreachable" />
			</div>
			{isDragging && (
				<div
					className="dragCurtain visible"
					onDrop={handleDrop}
					onDragOver={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
				>
					<div className="dragCurtainBody">
						<div>Drop to prepare upload</div>
						{showDragCancel && (
							<button type="button" className="dragCancelButton" onClick={cancelDragOverlay}>
								Cancel
							</button>
						)}
					</div>
				</div>
			)}

			<main className="app">
				<div className="appFrame">
					<button className="infoButton" onClick={() => setIsInfoOpen(true)} aria-label="About this app" title="About this app">
						i
					</button>

					<UploadSidebar
						fileInputRef={fileInputRef}
						isSending={isSending}
						isOnline={isOnline}
						pending={pending}
						uploadAccessIssue={uploadAccessIssue}
						onPickFiles={() => void handlePickFiles()}
						onFileInputChange={handleFileInputChange}
					/>

					<div className="contentColumn">
						<RecoveryPanel
							source={downloadSource}
							secretKey={downloadSecretKey}
							searchQuery={downloadSearchQuery}
							isDownloading={isDownloading}
							downloads={downloads}
							filteredDownloads={filteredDownloads}
							latestDownloadKey={downloads[0] ? `${downloads[0].downloadedAt}:${downloads[0].sourceUrl}:${downloads[0].fileName}` : null}
							deletingDownloadId={deletingDownloadId}
							onSourceChange={setDownloadSource}
							onSecretKeyChange={setDownloadSecretKey}
							onSearchQueryChange={setDownloadSearchQuery}
							onDownload={() => void handleRecoverDownload()}
							onDownloadFromHistory={handleDownloadAgain}
							onCopySourceLink={handleCopyDownloadLink}
							onCopySecretKey={handleCopyDownloadSecret}
							onDeleteDownload={handleDeleteDownload}
						/>

						<HistoryList
							uploads={uploads}
							filteredUploads={filteredUploads}
							latestUploadKey={uploads[0] ? `${uploads[0].uploadedAt}:${uploads[0].url}` : null}
							retentionMap={retentionMap}
							deletingId={deletingId}
							searchQuery={searchQuery}
							onSearchQueryChange={setSearchQuery}
							onDownloadUpload={handleDownloadUpload}
							onCopyLink={handleCopyLink}
							onCopySecret={handleCopySecret}
							onDeleteRequest={setPendingDeleteUpload}
						/>
					</div>
				</div>
			</main>

			<AboutModal
				isOpen={isInfoOpen}
				isClosing={isClosingInfo}
				onClose={closeInfoModal}
				onOpenLink={(target) => void openLink(target)}
			/>

			<StageUploadModal
				primaryStagedFile={primaryStagedFile}
				stagedCountLabel={stagedCountLabel}
				stagedFiles={stagedFiles}
				stagedRetention={stagedRetention}
				encryptBeforeUpload={encryptBeforeUpload}
				isClosingStage={isClosingStage}
				isSending={isSending}
				onClose={closeStage}
				onEncryptBeforeUploadChange={setEncryptBeforeUpload}
				onUpload={uploadFiles}
			/>

			<DeleteHistoryModal
				pendingDeleteUpload={pendingDeleteUpload}
				deletingId={deletingId}
				isClosing={isClosingDelete}
				onCancel={closeDeleteModal}
				onConfirm={confirmDeleteUpload}
			/>

			<AppToast toast={toast} isClosing={isClosingToast} />
		</div>
	);
}
