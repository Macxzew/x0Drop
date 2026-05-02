import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AppToast } from "./components/AppToast";
import { HistoryList } from "./components/HistoryList";
import { UploadSidebar } from "./components/UploadSidebar";
import { AboutModal } from "./components/modals/AboutModal";
import { DeleteHistoryModal } from "./components/modals/DeleteHistoryModal";
import { StageUploadModal } from "./components/modals/StageUploadModal";
import type { FileDropItem, ToastState, UploadAccessIssue } from "./appTypes";
import { useAutoDismissToast } from "./hooks/useAutoDismissToast";
import { useRetentionMap } from "./hooks/useRetentionMap";
import { useStagedRetention } from "./hooks/useStagedRetention";
import { mapInputFiles, collectDroppedFiles } from "./lib/fileDrop";
import { readBrowserUploads, writeBrowserUploads } from "./lib/browserUploads";
import { getUploadAccessIssue, getUploadErrorDetail, resolveUploadUrl } from "./lib/x0";
import type { UploadRecord } from "./types";

function filterUploads(uploads: UploadRecord[], query: string) {
	if (!query) return uploads;

	// Recherche multi-termes
	const terms = query.split(/\s+/).filter(Boolean);
	return uploads.filter((upload) => {
		const haystack = `${upload.fileName} ${upload.url} ${upload.x0Id}`.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

export function App() {
	const [uploads, setUploads] = useState<UploadRecord[]>(() => {
		const apiAvailable = typeof window !== "undefined" && typeof window.x0Desk !== "undefined";
		return apiAvailable ? [] : readBrowserUploads();
	});
	const [isDragging, setIsDragging] = useState(false);
	const [showDragCancel, setShowDragCancel] = useState(false);
	const [isInfoOpen, setIsInfoOpen] = useState(false);
	const [isClosingInfo, setIsClosingInfo] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [pending, setPending] = useState<string[]>([]);
	const [stagedFiles, setStagedFiles] = useState<FileDropItem[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [deletingId, setDeletingId] = useState<number | null>(null);
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
	const nextBrowserUploadIdRef = useRef(-1);
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
		// Compteur compact
		if (stagedFiles.length <= 1) return "";
		return `+${stagedFiles.length - 1}`;
	}, [stagedFiles]);
	const filteredUploads = useMemo(() => filterUploads(uploads, normalizedQuery), [normalizedQuery, uploads]);

	useEffect(() => {
		if (!apiAvailable) return;
		void window.x0Desk.listUploads().then((records) => {
			setUploads(records);
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
		// Fin d'animation
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

	async function hashFileItem(fileItem: FileDropItem): Promise<string | null> {
		if (fileItem.file) {
			return hashBrowserFile(fileItem.file);
		}

		if (fileItem.path && apiAvailable) {
			return window.x0Desk.hashFile(fileItem.path);
		}

		return null;
	}

	function findExistingUploadByHash(fileHash: string) {
		return uploads.find((upload) => upload.fileHash === fileHash) ?? null;
	}

	async function saveUploadRecord(fileItem: FileDropItem, url: string, uploadedAt: string, fileHash: string | null): Promise<UploadRecord> {
		if (apiAvailable) {
			// Stockage Electron
			return window.x0Desk.recordUpload({
				fileName: fileItem.name,
				fileSize: fileItem.size,
				fileHash,
				uploadedAt,
				url,
				mimeType: fileItem.file?.type || null
			});
		}

		return {
			id: nextBrowserUploadIdRef.current--,
			fileName: fileItem.name,
			fileSize: fileItem.size,
			fileHash,
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
			const existingUpload = findExistingUploadByHash(fileHash);
			if (existingUpload) {
				return existingUpload;
			}
		}

		const uploadUrl = resolveUploadUrl(apiAvailable);
		if (!uploadUrl) {
			throw new Error("Direct browser upload is not available in this build. Start the Electron app to upload files.");
		}

		// Payload multipart
		const form = new FormData();
		form.append("file", fileItem.file, fileItem.name);

		const response = await fetch(uploadUrl, {
			method: "POST",
			body: form
		});

		if (!response.ok) {
			throw new Error(`Upload failed with status ${response.status}`);
		}

		const url = (await response.text()).trim();
		if (!url.startsWith("https://") && !url.startsWith("http://")) {
			// Réponse brute
			throw new Error(`Unexpected x0.at response: ${url}`);
		}

		const uploadedAt = new Date().toISOString();
		const record = await saveUploadRecord(fileItem, url, uploadedAt, fileHash);
		if (!apiAvailable) {
			writeBrowserUploads([record, ...readBrowserUploads().filter((item) => item.url !== record.url)]);
		}
		await copyText(url);
		return record;
	}

	async function uploadSingleFile(file: FileDropItem) {
		// Priorité chemin natif
		if (file.path && apiAvailable) {
			return window.x0Desk.uploadFile(file.path);
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
			const knownHashes = new Set(uploads.map((upload) => upload.fileHash).filter((hash): hash is string => Boolean(hash)));
			const batchHashes = new Set<string>();
			const results: UploadRecord[] = [];
			const duplicateNames: string[] = [];
			for (const file of files) {
				const fileHash = await hashFileItem(file);
				if (fileHash) {
					const duplicateRecord = findExistingUploadByHash(fileHash);
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
					title:
						duplicateNames.length === 1
							? `${duplicateNames[0]} already uploaded`
							: `${duplicateNames.length} files already uploaded`
				});
			} else {
				showToast({
					kind: "success",
					title: results.length === 1 ? `${results[0].fileName} uploaded` : `${results.length} files uploaded`,
					detail:
						duplicateNames.length > 0
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
		// Taille manquante
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

	function handleOpenLink(upload: UploadRecord) {
		void openLink(upload.url).catch((error) =>
			showToast({
				kind: "error",
				title: "Open link failed",
				detail: error instanceof Error ? error.message : "Unable to open the upload URL"
			})
		);
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

					<HistoryList
						uploads={uploads}
						filteredUploads={filteredUploads}
						retentionMap={retentionMap}
						deletingId={deletingId}
						searchQuery={searchQuery}
						onSearchQueryChange={setSearchQuery}
						onOpenLink={handleOpenLink}
						onCopyLink={handleCopyLink}
						onDeleteRequest={setPendingDeleteUpload}
					/>
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
				isClosingStage={isClosingStage}
				isSending={isSending}
				onClose={closeStage}
				onUpload={uploadFiles}
			/>

			<DeleteHistoryModal
				pendingDeleteUpload={pendingDeleteUpload}
				deletingId={deletingId}
				isClosing={isClosingDelete}
				onCancel={closeDeleteModal}
				onConfirm={confirmDeleteUpload}
			/>

			<AppToast
				toast={toast}
				isClosing={isClosingToast}
			/>
		</div>
	);
}
