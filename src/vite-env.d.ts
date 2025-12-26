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
		offlineAi?: {
			status?: () => Promise<{
				available: boolean;
				reason: string;
				exePath?: string;
				modelPath?: string;
			}>;
			reasoningStatus?: () => Promise<
				| { available: true; reason: 'ok'; runnerPath?: string; modelPath?: string }
				| { available: false; reason: string }
			>;
			embedText: (payload: {
				text: string;
				modelId?: string;
				seed?: number;
				threads?: number;
			}) => Promise<{
				modelId: string;
				dims: number;
				vector: number[];
			}>;
			explain?: (payload: {
				prompt: string;
				maxTokens?: number;
				temperature?: number;
				seed?: number;
			}) => Promise<{ text: string }>;
			chat?: (payload: {
				system?: string;
				messages: Array<{ role: 'user' | 'assistant'; content: string }>;
				maxTokens?: number;
				temperature?: number;
				seed?: number;
			}) => Promise<{ text: string }>;
		};
	}
}

export {};
