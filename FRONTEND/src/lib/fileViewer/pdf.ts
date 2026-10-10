import type { PDFDocumentProxy } from 'pdfjs-dist';

/* pdf.js se carga solo al abrir un PDF: pesa demasiado para ir en el
   paquete principal. El worker va como archivo propio de la app (`?url`),
   así no hace falta relajar la CSP. */
export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
}
