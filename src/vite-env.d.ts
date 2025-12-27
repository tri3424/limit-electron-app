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
	}
}

export {};
