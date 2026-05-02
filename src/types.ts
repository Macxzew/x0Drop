export type UploadRecord = {
	id: number;
	fileName: string;
	fileSize: number;
	fileHash?: string | null;
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

declare global {
	interface Window {
		x0Desk: {
			listUploads: () => Promise<UploadRecord[]>;
			uploadFile: (filePath: string) => Promise<UploadRecord>;
			recordUpload: (payload: {
				fileName: string;
				fileSize: number;
				fileHash?: string | null;
				uploadedAt: string;
				url: string;
				mimeType?: string | null;
			}) => Promise<UploadRecord>;
			deleteUpload: (id: number) => Promise<UploadRecord[]>;
			openExternal: (target: string) => Promise<void>;
			copyToClipboard: (value: string) => Promise<void>;
			pickFiles: () => Promise<Array<{ path: string; name: string; size: number }>>;
			statFile: (filePath: string) => Promise<{ size: number; name: string }>;
			hashFile: (filePath: string) => Promise<string>;
			getRetention: (fileSize: number, uploadedAt: string) => Promise<RetentionState>;
		};
	}
}
