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
			beginExportJson?: (payload: { defaultFileName: string }) => Promise<{ canceled: boolean; exportId?: string; filePath?: string }>;
			writeExportChunk?: (payload: { exportId: string; chunk: string }) => Promise<{ ok: true }>;
			finishExportJson?: (payload: { exportId: string }) => Promise<{ ok: true; filePath?: string }>;
			abortExportJson?: (payload: { exportId: string }) => Promise<{ ok: true }>;
		};
		embedding?: {
			modelStatus?: () => Promise<{
				ready: boolean;
				modelDir?: string;
				cacheDir?: string;
				reason?: string;
			}>;
			prepare?: (payload: {
				modelId?: string;
				tags: string[];
				forceDownload?: boolean;
				forceRebuildCache?: boolean;
				acceptLicense?: boolean;
			}) => Promise<{
				ok: boolean;
				requiresConsent?: boolean;
				licenseText?: string;
				reason?: string;
				modelDir?: string;
				cacheDir?: string;
			}>;
			rebuildCache?: (payload: { tags: string[]; modelId?: string }) => Promise<{ ok: boolean; reason?: string }>;
			suggestTags?: (payload: {
				questionHtml: string;
				explanationHtml?: string;
				optionsHtml?: string[];
				matchingHeadingHtml?: string;
				matchingLeftHtml?: string[];
				matchingRightHtml?: string[];
				availableTags: string[];
				topK?: number;
				minScore?: number;
			}) => Promise<{
				ready: boolean;
				reason?: string;
				modelId?: string;
				dims?: number;
				suggestions: Array<{ tagName: string; score: number; evidence?: string }>;
			}>;
			recordFeedback?: (payload: {
				questionId?: string;
				inputTextHash?: string;
				tagName: string;
				action: 'accept' | 'reject' | 'remove' | 'add';
				score?: number;
				ts?: number;
			}) => Promise<{ ok: true }>;
			diagnostics?: () => Promise<{
				ready: boolean;
				modelDir?: string;
				cacheDir?: string;
				modelBytes?: number;
				cacheBytes?: number;
				logPath?: string;
			}>;
			onPrepareProgress?: (handler: (data: {
				step: string;
				message?: string;
				progress?: number;
			}) => void) => () => void;
		};
		longAnswer?: {
			modelStatus?: () => Promise<{ ready: boolean; reason?: string }>;
			embedText?: (payload: { text: string; modelId?: string }) => Promise<{ ok: boolean; vector?: number[]; dims?: number; modelId?: string; reason?: string }>;
			computeScoreAndMetadata?: (payload: {
				adminAnswerText: string;
				studentAnswerText: string;
				adminEmbedding?: number[];
				keywords?: Array<{ keyword: string; weight?: number }>;
				scoreMapping?: { minSimilarityForCredit?: number; fullCreditSimilarity?: number };
				modelId?: string;
			}) => Promise<{
				ok: boolean;
				similarity01?: number;
				numericScore10?: number;
				finalScore01?: number;
				keywordScore01?: number;
				keywordMatches?: Array<{ keyword: string; matched: boolean; weight?: number }>;
				reason?: string;
			}>;
			generateFeedbackParagraph?: (payload: {
				adminAnswerText: string;
				studentAnswerText: string;
				similarity01: number;
				keywordMatches?: Array<{ keyword: string; matched: boolean; weight?: number }>;
				numericScore10?: number;
				modelId?: string;
			}) => Promise<{ ok: boolean; feedback?: string; usedModel?: boolean; reason?: string }>;
		};
	}

	namespace JSX {
		interface IntrinsicElements {
			'math-field': import('react').DetailedHTMLProps<import('react').HTMLAttributes<HTMLElement>, HTMLElement> & {
				value?: string;
				placeholder?: string;
				readOnly?: boolean;
				'virtual-keyboard-mode'?: string;
				'smart-fence'?: string | boolean;
				'math-mode-space'?: string;
			};
		}
	}
}

export {};
