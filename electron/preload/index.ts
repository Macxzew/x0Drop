import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("x0Desk", {
	listUploads: () => ipcRenderer.invoke("uploads:list"),
	uploadFile: (filePath: string) => ipcRenderer.invoke("uploads:upload", filePath),
	uploadEncryptedFile: (filePath: string) => ipcRenderer.invoke("uploads:uploadEncrypted", filePath),
	recordUpload: (payload: {
		fileName: string;
		fileSize: number;
		fileHash?: string | null;
		encrypted?: boolean;
		secretKey?: string | null;
		uploadedAt: string;
		url: string;
		mimeType?: string | null;
	}) =>
		ipcRenderer.invoke("uploads:record", payload),
	deleteUpload: (id: number) => ipcRenderer.invoke("uploads:delete", id),
	listDownloads: () => ipcRenderer.invoke("downloads:list"),
	downloadFromLink: (payload: { source: string; secretKey?: string | null; recordHistory?: boolean }) => ipcRenderer.invoke("downloads:download", payload),
	deleteDownload: (id: number) => ipcRenderer.invoke("downloads:delete", id),
	openExternal: (target: string) => ipcRenderer.invoke("system:openExternal", target),
	copyToClipboard: (value: string) => ipcRenderer.invoke("system:copy", value),
	pickFiles: () => ipcRenderer.invoke("files:pick"),
	statFile: (filePath: string) => ipcRenderer.invoke("files:stat", filePath),
	hashFile: (filePath: string) => ipcRenderer.invoke("files:hash", filePath),
	getRetention: (fileSize: number, uploadedAt: string) =>
		ipcRenderer.invoke("uploads:retention", fileSize, uploadedAt)
});
