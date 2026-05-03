export type UploadRecord = {
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

export type RetentionState = {
	expiresAt: number;
	remainingMs: number;
	totalMs: number;
};

export type DownloadRecord = {
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

export type DownloadResult = {
	record: DownloadRecord;
	encryptionDetected: boolean;
	decrypted: boolean;
};

type FilePickerFileHandle = {
	createWritable: () => Promise<{
		write: (data: Blob | BufferSource | string) => Promise<void>;
		close: () => Promise<void>;
	}>;
};

declare global {
	interface Window {
		showSaveFilePicker?: (options?: {
			suggestedName?: string;
		}) => Promise<FilePickerFileHandle>;
		x0Desk: {
			listUploads: () => Promise<UploadRecord[]>;
			uploadFile: (filePath: string) => Promise<UploadRecord>;
			uploadEncryptedFile: (filePath: string) => Promise<UploadRecord>;
			recordUpload: (payload: {
				fileName: string;
				fileSize: number;
				fileHash?: string | null;
				encrypted?: boolean;
				secretKey?: string | null;
				uploadedAt: string;
				url: string;
				mimeType?: string | null;
			}) => Promise<UploadRecord>;
			deleteUpload: (id: number) => Promise<UploadRecord[]>;
			listDownloads: () => Promise<DownloadRecord[]>;
			downloadFromLink: (payload: { source: string; secretKey?: string | null; recordHistory?: boolean }) => Promise<DownloadResult>;
			deleteDownload: (id: number) => Promise<DownloadRecord[]>;
			openExternal: (target: string) => Promise<void>;
			copyToClipboard: (value: string) => Promise<void>;
			pickFiles: () => Promise<Array<{ path: string; name: string; size: number }>>;
			statFile: (filePath: string) => Promise<{ size: number; name: string }>;
			hashFile: (filePath: string) => Promise<string>;
			getRetention: (fileSize: number, uploadedAt: string) => Promise<RetentionState>;
		};
	}
}
