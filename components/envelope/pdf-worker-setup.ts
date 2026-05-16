import { pdfjs } from 'react-pdf';

/**
 * Configure the pdfjs web worker. Pinned to the version that ships with the
 * installed `react-pdf` so the worker and main bundle stay in lockstep.
 * Loads from the unpkg CDN to avoid a webpack worker-loader configuration.
 */
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}
