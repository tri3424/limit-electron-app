/// <reference types="vite/client" />

declare global {
	interface Window {
		examProctor?: {
			captureAppScreenshot: (payload?: {
				attemptId?: string;
				questionId?: string;
				rect?: { x: number; y: number; width: number; height: number };
			}) => Promise<{
				filePath: string;
				ts: number;
				attemptId: string;
				questionId?: string;
			}>;
			captureFullPageScreenshot?: () => Promise<{ dataUrl: string }>;
			captureViewportScreenshot?: () => Promise<{ dataUrl: string }>;
		};
		songs?: {
			saveAudioFile: (payload: { fileName: string; dataBase64: string }) => Promise<{ filePath: string; fileUrl: string }>;
			readAudioFile?: (payload: { filePath: string }) => Promise<{ dataBase64: string }>;
			deleteAudioFile: (payload: { filePath: string }) => Promise<{ ok: true }>;
		};
		data?: {
			exportJsonToFile: (payload: { defaultFileName: string; dataText: string }) => Promise<{ canceled: boolean; filePath?: string }>;
		};
		ocr?: {
			pickPdf?: () => Promise<{ canceled: boolean; pdfFilePath: string }>;
			importExamPdf: (payload?: {
				dpi?: number;
				pageStart?: number;
				pageEnd?: number;
				pdfFilePath?: string;
			}) => Promise<{
				documentId: string;
				pdfFilePath: string;
				pages: Array<{
					pageIndex: number;
					questions: Array<{
						number?: number;
						text: string;
						questionImages: string[];
						options: Record<string, { text: string; images: string[] }>;
					}>;
				}>;
			}>;
		};
	}
}

export {};
