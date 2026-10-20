import { useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, ImagePlus, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import JSZip from 'jszip'
import LibRaw from 'libraw-wasm'

type ConversionResult = {
  downloadUrl: string
  previewUrl: string
  downloadName: string
  previewName: string
  width: number
  height: number
  size: number
  fileCount: number
  isZip: boolean
}

type DecodedImage = { blob: Blob; width: number; height: number }

const supportedExtensions = /\.(arw|cr2|cr3|dng|erf|kdc|mef|mos|mrw|nef|nrw|orf|pef|raf|raw|rw2|sr2|srf)$/i
const acceptedExtensions = '.arw,.cr2,.cr3,.dng,.erf,.kdc,.mef,.mos,.mrw,.nef,.nrw,.orf,.pef,.raf,.raw,.rw2,.sr2,.srf'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function decodeRaw(file: File, quality: number): Promise<DecodedImage> {
  const decoder = new LibRaw()
  try {
    await decoder.open(new Uint8Array(await file.arrayBuffer()), {
      halfSize: false,
      useCameraWb: true,
      outputColor: 1,
      outputBps: 8,
      userQual: 3,
    })
    const image = await decoder.imageData()
    if (!image) throw new Error('Decoder tidak menghasilkan data gambar.')

    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Browser tidak dapat membuat kanvas gambar.')

    const pixels = new Uint8ClampedArray(image.width * image.height * 4)
    const channels = image.colors
    const divisor = image.data instanceof Uint16Array ? 257 : 1
    for (let source = 0, target = 0; target < pixels.length; source += channels, target += 4) {
      pixels[target] = image.data[source] / divisor
      pixels[target + 1] = image.data[source + 1] / divisor
      pixels[target + 2] = image.data[source + 2] / divisor
      pixels[target + 3] = 255
    }
    context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Gagal membuat JPG.')), 'image/jpeg', quality / 100)
    })
    return { blob, width: image.width, height: image.height }
  } finally {
    decoder.dispose()
  }
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [converted, setConverted] = useState<ConversionResult | null>(null)
  const [quality, setQuality] = useState(94)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState('')

  function clearConverted() {
    if (!converted) return
    URL.revokeObjectURL(converted.downloadUrl)
    if (converted.previewUrl !== converted.downloadUrl) URL.revokeObjectURL(converted.previewUrl)
    setConverted(null)
  }

  function selectFiles(candidates: File[]) {
    if (!candidates.length) return
    const accepted = candidates.filter((candidate) => supportedExtensions.test(candidate.name))
    const rejectedCount = candidates.length - accepted.length
    if (converted) clearConverted()
    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
      const unique = accepted.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`
        if (existing.has(key)) return false
        existing.add(key)
        return true
      })
      return [...current, ...unique]
    })
    setError(rejectedCount ? `${rejectedCount} file dilewati karena format RAW-nya tidak didukung.` : '')
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
    clearConverted()
    setError('')
  }

  async function convert() {
    if (!files.length) return
    clearConverted()
    setBusy(true)
    setProgress({ current: 0, total: files.length })
    setError('')

    const zip = new JSZip()
    const usedNames = new Set<string>()
    const conversionErrors: string[] = []
    let firstImage: DecodedImage | null = null
    let firstOutputName = ''
    let successfulCount = 0
    let totalSize = 0

    try {
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length })
        try {
          const image = await decodeRaw(file, quality)
          if (!firstImage) {
            firstImage = image
            firstOutputName = `${file.name.replace(/\.[^.]+$/, '')}.jpg`
          }
          totalSize += image.blob.size

          const baseName = file.name.replace(/\.[^.]+$/, '')
          let outputName = `${baseName}.jpg`
          let suffix = 2
          while (usedNames.has(outputName.toLowerCase())) {
            outputName = `${baseName} (${suffix}).jpg`
            suffix += 1
          }
          usedNames.add(outputName.toLowerCase())
          zip.file(outputName, image.blob)
          successfulCount += 1
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : 'gagal dibaca'
          conversionErrors.push(`${file.name}: ${reason}`)
        }
      }

      if (!firstImage) throw new Error('Tidak ada file yang berhasil dikonversi.')
      const previewUrl = URL.createObjectURL(firstImage.blob)
      const isZip = files.length > 1
      const downloadUrl = !isZip
        ? previewUrl
        : URL.createObjectURL(await zip.generateAsync({ type: 'blob' }))
      setConverted({
        downloadUrl,
        previewUrl,
        downloadName: isZip ? 'grain-hasil.zip' : firstOutputName,
        previewName: firstOutputName,
        width: firstImage.width,
        height: firstImage.height,
        size: isZip ? totalSize : firstImage.blob.size,
        fileCount: successfulCount,
        isZip,
      })
      if (conversionErrors.length) {
        setError(`${successfulCount} berhasil, ${conversionErrors.length} gagal: ${conversionErrors.slice(0, 2).join('; ')}`)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Terjadi kesalahan saat membaca file.'
      setError(`Konversi gagal. ${message}`)
    } finally {
      setBusy(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  function reset() {
    clearConverted()
    setFiles([])
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RAW to JPG beranda">
          <span className="brand-mark"><span /></span>
          <span>grain<span className="brand-dot">.</span></span>
        </a>
        <div className="local-badge"><span className="status-dot" /> 100% DI PERANGKAT</div>
      </header>

      <section className="workspace">
        <div className="intro">
          <p className="eyebrow"><span>RUANG KERJA</span><span className="eyebrow-line" /> 01 / KONVERSI</p>
          <h1>Dari RAW<br /><em>ke siap dibagikan.</em></h1>
          <p className="intro-copy">Konversi foto dengan detail penuh. Resolusi asli tetap utuh, file tidak pernah meninggalkan perangkatmu.</p>
        </div>

        <div className="workbench">
          <section className="upload-panel" aria-label="Unggah foto RAW">
            <div className="panel-heading">
              <div><span className="step-number">01</span><h2>Foto sumber <span className="file-count">{files.length || ''}</span></h2></div>
              <div className="file-actions">
                {files.length > 0 && <button className="icon-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Tambah foto" title="Tambah foto"><ImagePlus size={17} /></button>}
                {files.length > 0 && <button className="icon-button" type="button" onClick={reset} disabled={busy} aria-label="Hapus semua file" title="Hapus semua file"><X size={17} /></button>}
              </div>
            </div>

            {files.length === 0 ? (
              <button
                className={`dropzone${dragging ? ' is-dragging' : ''}`}
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); selectFiles(Array.from(event.dataTransfer.files)) }}
              >
                <span className="upload-icon"><Upload size={20} strokeWidth={1.7} /></span>
                <span className="drop-title">Letakkan foto di sini</span>
                <span className="drop-subtitle">atau <span>pilih satu atau beberapa file</span></span>
                <span className="format-line">ARW · CR2 · CR3 · DNG · NEF · RAF · + lainnya</span>
              </button>
            ) : (
              <div
                className="file-list"
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); selectFiles(Array.from(event.dataTransfer.files)) }}
              >
                {files.map((file, index) => (
                  <div className={`file-card${dragging ? ' is-dragging' : ''}`} key={`${file.name}-${file.lastModified}-${index}`}>
                    <div className="file-symbol"><ImagePlus size={19} strokeWidth={1.6} /></div>
                    <div className="file-info"><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size)} <i /> RAW</span></div>
                    <button className="remove-file" type="button" disabled={busy} onClick={() => removeFile(index)} aria-label={`Hapus ${file.name}`} title="Hapus file"><X size={15} /></button>
                  </div>
                ))}
                <button className="add-files" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={15} /> Tambah foto</button>
              </div>
            )}
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept={acceptedExtensions}
              onChange={(event) => {
                selectFiles(Array.from(event.target.files ?? []))
                event.currentTarget.value = ''
              }}
            />

            <div className="settings">
              <div className="setting-label"><label htmlFor="quality">Kualitas JPG</label><span>{quality}<small>%</small></span></div>
              <input id="quality" type="range" min="70" max="100" value={quality} disabled={busy} onChange={(event) => setQuality(Number(event.target.value))} />
              <div className="range-labels"><span>File lebih kecil</span><span>Kualitas maksimal</span></div>
            </div>

            {error && <p className="error-message" role="alert">{error}</p>}

            <button className="convert-button" type="button" onClick={convert} disabled={!files.length || busy}>
              {busy ? <><LoaderCircle className="spin" size={18} /> Memproses {progress.current}/{progress.total}...</> : <><Sparkles size={17} /> Konversi {files.length > 1 ? `${files.length} foto` : 'ke JPG'} <ArrowUpRight className="button-arrow" size={16} /></>}
            </button>
            <p className="privacy-note"><ShieldCheck size={15} /> File diproses lokal. Tidak ada unggahan ke server.</p>
          </section>

          <section className={`result-panel${converted ? ' has-result' : ''}`} aria-label="Hasil konversi">
            <div className="panel-heading">
              <div><span className="step-number">02</span><h2>Hasil JPG{converted && converted.fileCount > 1 ? ` · ${converted.fileCount} file` : ''}</h2></div>
              {converted && <span className="ready-label"><span className="status-dot" /> SIAP</span>}
            </div>
            <div className={`preview-area${converted ? ' with-image' : ''}`}>
              {converted ? (
                <img src={converted.previewUrl} alt={`Hasil konversi ${converted.previewName}`} />
              ) : (
                <div className="preview-empty">
                  <div className="preview-frame"><span /><span /><span /><span /></div>
                  <p>Hasil konversi akan<br />muncul di sini</p>
                </div>
              )}
            </div>
            <div className="result-footer">
              <div className="result-meta">
                <span>{converted?.isZip ? 'DIMENSI FILE PERTAMA' : 'DIMENSI ASLI'}</span>
                <strong>{converted ? `${converted.width.toLocaleString()} × ${converted.height.toLocaleString()} px` : '— × — px'}</strong>
              </div>
              <div className="result-meta result-size">
                <span>{converted?.isZip ? 'UKURAN HASIL' : 'UKURAN JPG'}</span>
                <strong>{converted ? formatBytes(converted.size) : '—'}</strong>
              </div>
              {converted ? (
                <a className="download-button" href={converted.downloadUrl} download={converted.downloadName} aria-label={`Unduh ${converted.isZip ? 'ZIP berisi JPG' : 'hasil JPG'}`} title={`Unduh ${converted.isZip ? 'ZIP' : 'JPG'}`}><ArrowDownToLine size={19} /></a>
              ) : (
                <span className="download-placeholder"><ArrowDownToLine size={18} /></span>
              )}
            </div>
          </section>
        </div>

        <footer className="bottom-note">
          <span><span className="note-number">A</span> RESOLUSI TETAP</span>
          <span><span className="note-number">B</span> TANPA API KEY</span>
          <span><span className="note-number">C</span> PRIVASI TERJAGA</span>
          {converted && <button className="reset-button" type="button" onClick={reset}><RotateCcw size={13} /> Mulai lagi</button>}
        </footer>
      </section>
    </main>
  )
}

export default App
