# grain. RAW to JPG

Konverter foto RAW ke JPG yang memproses file langsung di browser menggunakan LibRaw WebAssembly. File tidak dikirim ke server dan tidak memerlukan API key. Pilih satu file untuk mengunduh JPG langsung, atau pilih beberapa file untuk mengunduh semua hasil JPG dalam satu ZIP.

## Jalankan lokal

```sh
npm install
npm run dev
```

Untuk membuat build produksi, jalankan `npm run build`.

## Resolusi dan kualitas

Decoder menggunakan ukuran penuh (`halfSize: false`) dan kanvas JPG dibuat dengan dimensi hasil decode yang sama, tanpa resize. Slider mengatur kualitas kompresi JPG; format JPG tetap bersifat lossy.

LibRaw mendukung banyak format RAW kamera, termasuk ARW, CR2, CR3, DNG, NEF, ORF, RAF, dan RW2. Dukungan akhir bergantung pada codec/kompresi kamera yang tersedia di build LibRaw.

Konversi batch berjalan satu per satu untuk mengurangi penggunaan memori. Jika beberapa file berhasil dikonversi, hasil yang berhasil dimasukkan ke ZIP; file yang gagal ditampilkan pada pesan status.