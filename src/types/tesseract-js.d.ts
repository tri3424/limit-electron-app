declare module 'tesseract.js' {
  export type RecognizeResult = any;

  // tesseract.js v5 supports createWorker(langs, oem, options, config)
  // We keep this shim permissive for offline builds.
  export function createWorker(...args: any[]): Promise<any>;
}
