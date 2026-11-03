// Turns uploaded files into plain text, entirely in the browser. Heavy readers
// (PDF, Word, OCR) load only when a file of that kind shows up.

export type FileKind = 'pdf' | 'docx' | 'image' | 'text'

export const ACCEPT = '.pdf,.docx,.txt,.md,.csv,image/*'
export const MAX_FILE_MB = 25
/** Scanned PDFs are OCR'd page by page; this keeps phones from melting. */
const MAX_OCR_PAGES = 12

export function kindOf(file: File): FileKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return 'text'
  return null
}

export class ExtractError extends Error {}

type Progress = (message: string) => void

export async function extractText(file: File, onProgress: Progress = () => {}): Promise<string> {
  const kind = kindOf(file)
  if (!kind) {
    if (/\.(pptx?|doc|xlsx?)$/i.test(file.name)) throw new ExtractError('Save this as a PDF first, then upload it.')
    throw new ExtractError("I can't read this file type. Try PDF, Word (.docx), text, or a photo.")
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ExtractError(`Too big (over ${MAX_FILE_MB} MB). Try splitting it.`)

  if (kind === 'text') return file.text()
  if (kind === 'docx') return readDocx(file)
  if (kind === 'image') return ocr([file], onProgress)
  return readPdf(file, onProgress)
}

async function readDocx(file: File): Promise<string> {
  const mod = await import('mammoth/mammoth.browser.min.js')
  const mammoth = (mod.default ?? mod) as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

async function readPdf(file: File, onProgress: Progress): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress(`Reading page ${n} of ${doc.numPages}`)
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
    }
    pages.push(text)
  }
  const joined = pages.join('\n\n')
  // Barely any text means a scanned PDF: read the page images instead.
  if (joined.replace(/\s/g, '').length > doc.numPages * 40) return joined

  const images: Blob[] = []
  const count = Math.min(doc.numPages, MAX_OCR_PAGES)
  for (let n = 1; n <= count; n++) {
    onProgress(`Scanning page ${n} of ${count}`)
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (blob) images.push(blob)
  }
  return ocr(images, onProgress)
}

async function ocr(images: Blob[], onProgress: Progress): Promise<string> {
  onProgress('Waking up the text reader…')
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(`Reading the photo… ${Math.round(m.progress * 100)}%`)
    },
  })
  try {
    const out: string[] = []
    for (const [i, img] of images.entries()) {
      if (images.length > 1) onProgress(`Reading page ${i + 1} of ${images.length}`)
      const { data } = await worker.recognize(img)
      out.push(data.text)
    }
    return out.join('\n\n')
  } finally {
    await worker.terminate()
  }
}
