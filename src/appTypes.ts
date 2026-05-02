export type FileDropItem = {
	path: string;
	name: string;
	size: number;
	file?: File;
};

export type ToastState = {
	kind: "success" | "error";
	title: string;
	detail?: string;
};

export type UploadAccessIssue = {
	kind: "blocked" | "unreachable";
	detail: string;
};
