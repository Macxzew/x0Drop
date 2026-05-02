import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("x0Desk", {
	listUploads: () => ipcRenderer.invoke("uploads:list"),
	uploadFile: (filePath: string) => ipcRenderer.invoke("uploads:upload", filePath),
	recordUpload: (payload: { fileName: string; fileSize: number; uploadedAt: string; url: string; mimeType?: string | null }) =>
		ipcRenderer.invoke("uploads:record", payload),
	deleteUpload: (id: number) => ipcRenderer.invoke("uploads:delete", id),
	openExternal: (target: string) => ipcRenderer.invoke("system:openExternal", target),
	copyToClipboard: (value: string) => ipcRenderer.invoke("system:copy", value),
	pickFiles: () => ipcRenderer.invoke("files:pick"),
	statFile: (filePath: string) => ipcRenderer.invoke("files:stat", filePath),
	hashFile: (filePath: string) => ipcRenderer.invoke("files:hash", filePath),
	getRetention: (fileSize: number, uploadedAt: string) =>
		ipcRenderer.invoke("uploads:retention", fileSize, uploadedAt)
});
