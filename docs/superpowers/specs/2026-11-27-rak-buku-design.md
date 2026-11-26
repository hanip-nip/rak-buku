# Rak Buku: desain

Tanggal: 2026-11-27

## Kenapa aplikasi ini dibuat

Pemilik sering lupa sudah sampai halaman berapa saat ingin melanjutkan novel, komik, atau buku. Aplikasi ini rak buku PDF pribadi. Posisi baca tersimpan sendiri, tanpa perlu diingat atau ditandai. File dimasukkan sendiri oleh pemilik. Membaca harus bisa offline.

Perangkat utama adalah **iPhone**. Aplikasi juga dipakai di Android dan PC. Pemilik login sekali dengan akun Google di tiap perangkat. Buku yang dimasukkan dari satu perangkat muncul di perangkat lain tanpa perlu upload ulang, dan posisi baca ikut pindah antar perangkat.

## Tujuan

1. Saat aplikasi dibuka, buku yang sedang dibaca bisa langsung dilanjutkan dari titik terakhir, sampai ke bagian dalam halaman, di perangkat mana pun.
2. Membaca berjalan penuh tanpa internet untuk buku yang sudah ada di perangkat.
3. Satu akun Google, semua perangkat tersinkron. Tidak ada upload ulang.
4. Rak dengan kategori Komik, Novel, dan Buku lain, pencarian judul, dan progres per seri.
5. Scroll vertikal bersambung, bookmark dengan catatan, mode malam, zoom dengan cubit, dan layar penuh.

## Bukan tujuan (untuk versi ini)

- Format selain PDF (EPUB, CBZ, TXT).
- Aplikasi native (App Store, APK). Versi ini PWA. APK bisa dibuat nanti dengan membungkus PWA yang sama.
- Berbagi buku ke orang lain atau memakai banyak akun.
- Coretan atau highlight di halaman.
- Mode baca per halaman dengan geser kiri/kanan. Pemilik memilih selalu scroll.

## Anti-tujuan (gagal walau secara teknis jalan)

- Posisi baca hilang atau mundur ke posisi lama.
- Ada buku yang sudah di-download tapi tetap butuh internet untuk dibaca.
- Pemilik sering disuruh login ulang.
- Memori iPhone penuh karena semua buku ikut ter-download.
- Halaman yang panjang di-scroll lalu dibuka lagi kembali ke atas halaman, sehingga pemilik tetap harus mencari sendiri.

## Batasan

- iPhone: PWA dipasang lewat Safari dengan "Add to Home Screen". Semua browser di iOS memakai WebKit. Penyimpanan aplikasi di layar utama terpisah dari tab Safari. Memori kanvas di Safari iOS terbatas, jadi hanya sedikit halaman yang boleh dirender sekaligus.
- Hosting harus HTTPS: GitHub Pages (gratis).
- Login Google di PWA iOS bermasalah dengan jendela popup, dan tanpa server token akses hanya berlaku sekitar 1 jam. Karena itu dipakai server mini (lihat Pendekatan).
- Biaya: semua di paket gratis (GitHub Pages, Cloudflare Workers, Google Drive 15 GB, Google Cloud OAuth).
- Seri komik bisa berukuran beberapa GB. File tunggal bisa lebih dari 100 MB.

## Pendekatan yang dipertimbangkan

| | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| **A (dipilih)** | Google Drive untuk file + server mini Cloudflare Worker untuk menjaga login | 15 GB, file milik pemilik, login sekali | Ada satu bagian tambahan yang perlu di-setup |
| B | Google Drive tanpa server | Setup paling sedikit | Sinkronisasi minta login ulang sekitar tiap jam |
| C | Supabase | Login kode email mulus di iPhone | Gratis hanya 1 GB, file maks 50 MB, proyek berhenti sementara kalau tidak dipakai |

Pemilik memilih **A**. Alasannya, B membuat sinkronisasi merepotkan dan bisa membuat posisi baca tertinggal, sedangkan C terlalu kecil untuk koleksi komik.

## Keputusan pemilik

- Hanya PDF.
- PWA untuk iPhone (Safari), Android, dan PC (install dari Chrome/Edge).
- Sinkronisasi dengan akun Google dan Google Drive, ditambah server mini (pendekatan A).
- Isi rak berbentuk **seri**. Satu seri berisi 1 PDF (misalnya novel lengkap) atau banyak PDF (komik per batch).
- Baca dengan scroll vertikal bersambung. Di akhir satu batch, scroll langsung lanjut ke batch berikutnya.
- Fitur: kategori, pencarian judul, bookmark dengan catatan, mode malam, zoom cubit, layar penuh.
- Tiap perangkat hanya men-download buku yang dibuka. Saat online, 2 batch berikutnya ikut di-download. Buku bisa dihapus dari perangkat tapi tetap ada di Drive.

## Desain

### Bagian-bagian

1. **PWA** (HTML/CSS/JS modul, tanpa build step) di GitHub Pages. pdf.js 4.10.38 disimpan lokal di `vendor/`. Service worker menyimpan semua file aplikasi untuk offline.
2. **Server mini** (Cloudflare Worker, satu file). Tugasnya hanya:
   - `GET /login`: arahkan ke Google OAuth (authorization code, `access_type=offline`, `prompt=consent` di login pertama).
   - `GET /callback`: tukar code menjadi refresh token, enkripsi dengan kunci rahasia Worker (AES-GCM), lalu redirect kembali ke PWA dengan blob terenkripsi di fragment URL (`#auth=...`).
   - `POST /token`: terima blob, dekripsi, minta access token baru ke Google, lalu kembalikan access token dan masa berlakunya.
   - Worker tidak menyimpan apa pun. Tanpa database dan tanpa cookie, karena cookie lintas domain diblokir Safari.
3. **Google Drive**, scope `drive.file` saja (aplikasi hanya bisa melihat file yang dibuatnya sendiri). Isinya folder `Rak Buku/` berisi PDF dan satu file status per perangkat.

### Login di iPhone

PWA berpindah halaman (bukan popup) ke `/login`, lalu kembali ke PWA lewat `/callback`. Blob refresh token disimpan di IndexedDB. Access token diperbarui lewat `/token` sebelum habis.

Belum pasti di iOS: apakah kembali dari Google tetap berada di dalam aplikasi layar utama, atau malah terbuka di jendela Safari terpisah. **Ini diuji paling awal lewat prototipe di iPhone.** Kalau gagal, cadangannya: login dilakukan di tab Safari biasa, Worker menampilkan kode 6 karakter, lalu kode itu diketik di aplikasi dan ditukar ke Worker untuk mendapatkan blob.

Aplikasi Google OAuth harus diubah ke status **In production**, bukan Testing. Di status Testing, refresh token kedaluwarsa setelah 7 hari. Scope `drive.file` tidak butuh verifikasi Google. Hal ini dicek ulang saat prototipe.

### Data

Setiap perangkat menulis **hanya filenya sendiri**, `status-<idPerangkat>.json`, di folder Drive. Saat sinkron, perangkat membaca semua file status lalu menggabungkannya. Dengan cara ini dua perangkat tidak pernah menimpa file yang sama.

Isi file status:

```
{
  device: { id, name },
  series: [ { id, title, category, files: [ { driveId, name, size, pages, order } ],
              cover (JPEG kecil base64), updatedAt, deleted } ],
  progress: { [seriesId]: { fileIdx, page, offset (0..1 di dalam halaman), updatedAt } },
  bookmarks: [ { id, seriesId, fileIdx, page, offset, note, createdAt, updatedAt, deleted } ]
}
```

Aturan gabung:
- Seri, bookmark, dan progres digabung per `id`. Yang dipakai adalah record dengan `updatedAt` terbaru.
- Pengecualian: daftar `files` dalam seri digabung per `driveId`, bukan diambil dari satu record utuh. Jadi kalau perangkat A mengganti judul sementara perangkat B menambah batch, keduanya tetap tersimpan. File yang dihapus memakai tombstone yang sama. *(Keputusan pembangun.)*
- Penghapusan dicatat sebagai `deleted: true` (tombstone), tidak dibuang, supaya perangkat lain ikut tahu.
- Jam perangkat bisa berbeda. Untuk progres, kalau `updatedAt` sama, yang menang adalah posisi yang lebih jauh.

Data lokal (IndexedDB): status gabungan terakhir, status perangkat ini, PDF yang sudah di-download (blob per `driveId`), antrean upload, dan blob login.

### Sinkronisasi

- Dipicu saat aplikasi dibuka, saat aplikasi ditutup atau pindah ke latar belakang (`visibilitychange`), setiap 30 detik selama membaca kalau online, dan saat event `online`.
- Posisi baca disimpan ke lokal setiap kali scroll berhenti (debounce sekitar 1 detik), sehingga tidak hilang walau aplikasi ditutup paksa.
- Saat offline semua tetap tersimpan lokal, lalu dikirim begitu online.
- Menambah buku: pilih satu atau banyak PDF dari Files, pilih kategori, lalu masukkan ke seri baru atau seri yang sudah ada. File langsung bisa dibaca dari lokal. Upload ke Drive memakai *resumable upload* (untuk file besar dan sinyal putus-sambung) dan berjalan di antrean. Seri baru muncul di perangkat lain setelah upload selesai.

### Download dan memori perangkat

- Buku yang dibuka di-download (sekali). Saat online, 2 file berikutnya dalam seri ikut di-download.
- Rak menandai mana yang sudah ada di perangkat dan mana yang hanya di Drive.
- Ada menu "Hapus dari perangkat" per seri. Ada juga indikator ruang terpakai.
- Aplikasi meminta `navigator.storage.persist()` supaya data tidak dihapus browser.

### Rak

- Tab kategori: Semua, Komik, Novel, Buku lain. Ada kotak pencarian judul.
- Kartu seri berisi sampul (dirender dari halaman 1 file pertama), judul, posisi ("Batch 3/12 · hal 45" atau "Chapter 7 · hal 132/480"), bilah progres, dan tombol Lanjut baca.
- Urutan rak: yang terakhir dibaca di atas.
- Urutan file dalam seri diambil dari nama file dengan *natural sort* ("Batch 2" sebelum "Batch 10"). Urutannya bisa digeser manual.
- Seri bisa diubah judul dan kategorinya. Menghapus seri dari Drive selalu lewat konfirmasi, dan file dipindahkan ke Trash Drive, bukan dihapus permanen.

### Pembaca

- Scroll vertikal bersambung melewati semua file dalam satu seri.
- Hanya halaman di sekitar layar yang dirender (sekitar layar ±2 halaman). Halaman lain hanya berupa kotak kosong dengan ukuran yang benar, supaya tinggi scroll stabil dan memori iPhone aman.
- Posisi disimpan sebagai `fileIdx`, `page`, dan `offset` di dalam halaman, lalu dipulihkan persis saat dibuka lagi.
- Ketuk layar untuk menampilkan atau menyembunyikan bilah atas dan bawah (layar penuh). Bilah berisi judul, posisi, daftar isi, bookmark, dan pengaturan.
- Daftar isi diambil dari outline PDF kalau ada. Kalau ada, posisi ditampilkan sebagai chapter. Untuk seri banyak file, daftar file juga ditampilkan.
- Bookmark: simpan posisi sekarang beserta catatan, lalu bisa melompat dari daftar bookmark.
- Zoom dengan cubit: selama gesture diskalakan dengan CSS, lalu halaman yang terlihat dirender ulang dengan resolusi sesuai zoom setelah gesture selesai. Ketuk dua kali untuk kembali ke lebar layar.
- Mode malam: tampilan aplikasi gelap, dengan pilihan terpisah "balik warna halaman" untuk novel berlatar putih. Komik tidak dibalik secara default.

### Pengujian

- Logika murni diuji dengan `node:test` tanpa dependensi: aturan gabung status, natural sort, pemilihan file prefetch, serta konversi posisi ↔ scroll.
- Uji Worker untuk enkripsi dan dekripsi blob.
- Uji manual di browser PC dengan PDF contoh dari pemilik (`contoh/`). Login dan pemasangan PWA diuji langsung di iPhone.

## Diserahkan ke pembangun

- Struktur file dan modul JS, gaya visual, ikon, serta teks antarmuka (bahasa Indonesia).
- Ukuran sampul, interval sinkronisasi persis, dan jumlah halaman yang dirender di sekitar layar.
- Detail pengulangan upload dan penanganan error jaringan, asalkan tidak ada data yang hilang.

## Urutan kerja yang disarankan

1. Prototipe sekali pakai: login lewat Worker dan upload satu PDF ke Drive, lalu dicoba di iPhone dari layar utama. Hasilnya menentukan cara login yang dipakai (alur utama atau cadangan kode).
2. Pembaca PDF offline: rak, seri, scroll bersambung, dan simpan posisi (tanpa sinkronisasi).
3. Sinkronisasi Drive dan Worker.
4. Bookmark, daftar isi, zoom, mode malam, dan manajemen memori.
5. Panduan setup untuk pemilik: Google Cloud, Cloudflare, dan GitHub Pages.
