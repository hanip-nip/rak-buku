# Panduan setup Rak Buku

Panduan ini untuk kamu yang memakai Windows dan iPhone. Semua akun di bawah gratis. Bagian 1 menyiapkan akun dan login. Bagian 2 menjelaskan cara memasang dan memakai aplikasinya.

Kamu akan memakai tiga layanan: Google Cloud (izin akses ke Drive), Cloudflare (server kecil untuk login) dan GitHub (tempat aplikasi di-host).

## Bagian 1: menyiapkan login Google

### 1. Proyek Google Cloud

1. Buka https://console.cloud.google.com dan masuk dengan akun Google yang Drive-nya mau dipakai.
2. Buat proyek baru, misalnya dengan nama `rak-buku`.
3. Di menu pencarian, ketik "Google Drive API", buka halamannya, lalu klik Enable.

### 2. Layar persetujuan OAuth (consent screen)

1. Cari menu "OAuth consent screen" (atau "Google Auth Platform", tergantung tampilan terbaru) di proyek yang tadi dibuat.
2. Pilih tipe pengguna External. Isi nama aplikasi (`Rak Buku`), email dukungan, dan email kontak developer dengan emailmu.
3. Di bagian scope, tambahkan hanya satu: `https://www.googleapis.com/auth/drive.file`. Dengan scope ini aplikasi hanya bisa melihat file yang ia buat sendiri, bukan seluruh Drive.
4. Setelah selesai, status aplikasi masih Testing. Ubah ke In production lewat tombol Publish app.

Langkah ke-4 penting. Selama berstatus Testing, Google membuat refresh token kedaluwarsa dalam 7 hari, jadi kamu harus login ulang tiap minggu. Di In production, token tidak kedaluwarsa begitu. Karena scope `drive.file` tidak termasuk sensitif, kamu tidak perlu verifikasi dari Google. Layar login akan menampilkan peringatan "Google hasn't verified this app". Itu normal untuk aplikasi pribadi. Klik Advanced, lalu lanjutkan.

### 3. OAuth Client

1. Buka menu Credentials (atau Clients), lalu buat OAuth client ID baru.
2. Pilih tipe Web application, beri nama bebas.
3. Authorized JavaScript origins dikosongkan saja.
4. Di Authorized redirect URIs, isi:

   `https://rak-buku-auth.<subdomain>.workers.dev/callback`

   Ganti `<subdomain>` dengan subdomain workers.dev milikmu. Kamu baru tahu nilainya setelah membuat akun Cloudflare (langkah 5). Jadi boleh kembali ke langkah ini nanti dan mengisinya.
5. Simpan. Salin Client ID dan Client secret. Keduanya dipakai di langkah 6. Jangan dibagikan ke siapa pun dan jangan ditaruh di file yang masuk ke GitHub.

### 4. Akun GitHub dan GitHub Pages

1. Daftar di https://github.com kalau belum punya akun. Catat username-mu, dipakai di langkah berikutnya.
2. Buat repositori baru bernama `rak-buku`. Pilih Public, karena Pages gratis untuk repositori publik. Biarkan kosong: jangan centang README atau opsi tambahan lain.
3. Minta Claude untuk mengirim (push) proyek ke repositori ini. Claude akan meminta izin dulu. Folder `.superpowers/` dan `contoh/` diabaikan git, jadi tidak ikut publik. Folder `worker/` dan `docs/` tidak berisi rahasia, karena secret disimpan di Cloudflare, bukan di file.
4. Setelah proyek terkirim, di repositori buka Settings, lalu Pages. Pada Source pilih "Deploy from a branch", branch `main`, folder `/ (root)`, lalu Save. Setelah satu-dua menit, alamatnya muncul, yaitu `https://<username-github>.github.io/rak-buku/`.

### 5. Akun Cloudflare dan deploy Worker

1. Daftar di https://dash.cloudflare.com/sign-up dan verifikasi emailmu.
2. Di dashboard, buka bagian Workers & Pages. Kamu akan diminta memilih subdomain workers.dev. Catat subdomain itu.
3. Pasang Node.js (versi LTS) dari https://nodejs.org kalau belum ada.
4. Buka PowerShell, lalu jalankan:

   ```
   cd D:\Projects\rak-buku\worker
   npx.cmd wrangler login
   ```

   Browser akan terbuka. Klik izinkan.
5. Buka `worker\wrangler.toml` dan ubah `APP_URL` menjadi alamat aplikasimu di GitHub Pages, yaitu `https://<username-github>.github.io/rak-buku/`. Pakai garis miring di akhir.
6. Deploy:

   ```
   npx.cmd wrangler deploy
   ```

   Hasilnya menampilkan alamat Worker, bentuknya `https://rak-buku-auth.<subdomain>.workers.dev`. Pastikan subdomain-nya sama dengan yang kamu pakai di redirect URI (langkah 3).

### 6. Tiga secret

Masih di folder `worker`, jalankan tiga perintah ini satu per satu. Tiap perintah akan meminta kamu menempelkan nilainya.

```
npx.cmd wrangler secret put GOOGLE_CLIENT_ID
npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET
npx.cmd wrangler secret put SEAL_KEY
```

Untuk GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET, tempel nilai dari langkah 3.

SEAL_KEY adalah kunci acak 32 byte untuk mengenkripsi token. Buat dengan perintah ini di PowerShell, lalu salin hasilnya:

```
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Simpan kunci ini di tempat aman. Kalau kunci diganti, semua perangkat harus login ulang.

### 7. Coba login

Buka alamat aplikasi di browser, ketuk Masuk, pilih akun Google, lalu setujui izinnya. Kamu harus kembali ke aplikasi dalam keadaan sudah login. Uji di iPhone ada di bagian 13.

## Bagian 2: memasang dan memakai aplikasi

### 8. Sebelum aplikasi dipakai

Aplikasi belum bisa login kalau dua hal ini belum diisi:

1. Di `src/config.js`, isi `WORKER_URL` dengan alamat Worker-mu (`https://rak-buku-auth.<subdomain>.workers.dev`).
2. Di `worker\wrangler.toml`, `APP_URL` harus mengarah ke aplikasi yang asli (`https://<username-github>.github.io/rak-buku/`). Setelah diubah, jalankan `npx.cmd wrangler deploy` lagi dari folder `worker`.

Kamu bisa minta Claude yang mengedit dan mengirimnya ke GitHub. Claude akan meminta izin dulu sebelum push.

Siapa pun yang mengirim (push) perubahan file aplikasi, termasuk `src/config.js` ini, wajib menaikkan `VERSION` di baris atas `sw.js` (misalnya `v5` jadi `v6`). Tanpa itu, perangkat yang sudah memasang aplikasi tetap memakai salinan lama. Setelah push, tunggu beberapa menit sebelum mengetes, karena GitHub Pages butuh waktu untuk memperbarui cache-nya.

### 9. Memasang di perangkat

iPhone:

1. Syaratnya iOS 17.4 atau lebih baru, karena mesin pembaca PDF-nya butuh versi itu. Cek di Settings, General, About, lihat baris iOS Version.
2. Buka alamat aplikasi di Safari. Harus Safari, bukan browser lain.
3. Ketuk tombol Share, lalu Add to Home Screen, lalu Add.
4. Mulai sekarang selalu buka dari ikon di layar utama, jangan dari tab Safari. Penyimpanan keduanya terpisah, jadi buku yang kamu tambah lewat tab Safari tidak akan terlihat di ikon.

Android:

1. Buka alamat aplikasi di Chrome.
2. Ketuk menu titik tiga, lalu Install app (atau Add to Home screen).

PC:

1. Buka alamat aplikasi di Chrome atau Edge.
2. Klik ikon install di sisi kanan address bar, lalu Install.

### 10. Pemakaian pertama

1. Di bawah rak ada baris status bertuliskan "Belum masuk Google" dengan tombol Masuk. Ketuk Masuk, pilih akun yang sama dengan yang dipakai di Google Cloud, lalu setujui izinnya.
2. Untuk menambah buku, pakai tombol tambah, lalu pilih PDF dari aplikasi Files. Kalau satu seri komik terpecah jadi beberapa file (batch), pilih semuanya sekaligus supaya jadi satu seri. Pilih juga kategorinya.
3. Tiap buku punya keterangan di kartunya:
   - Ada di HP: semua bagian buku sudah tersimpan di perangkat ini dan bisa dibaca tanpa internet.
   - Sebagian di HP: sebagian batch sudah ada, sisanya masih di Drive.
   - Hanya di Drive: belum ada di perangkat ini. Perlu internet untuk membukanya.
4. Saat kamu membuka buku dan sedang online, aplikasi mengunduh batch yang kamu buka plus 2 batch berikutnya.

### 11. Peringatan penting

- Menghapus ikon aplikasi di iPhone ikut menghapus buku yang tersimpan di HP. Salinan di Drive tetap aman, dan posisi bacamu aman kalau sudah tersinkron.
- Buku yang masih di "antrean upload" hanya ada di HP itu sampai upload selesai. Kalau ikon terhapus sebelum itu, bukunya hilang. Saat pertama kali menambah komik besar, biarkan aplikasi terbuka di Wi-Fi sampai antreannya kosong.

### 12. Memperbarui aplikasi

Tiap pembaruan harus disertai kenaikan `VERSION` di `sw.js` oleh orang yang melakukan push (lihat langkah 8). Setelah push, tunggu beberapa menit dulu (cache GitHub Pages), baru lakukan langkah di bawah.

Tutup aplikasi sepenuhnya (geser ke atas dari app switcher), lalu buka lagi. Kalau tampilannya belum berubah, ulangi sekali lagi. Versi baru baru dipakai setelah dibuka kedua kalinya.

### 13. Tes di iPhone yang perlu kamu laporkan

Beberapa hal hanya bisa dicek di perangkat asli. Coba enam ini dan laporkan lulus atau gagal, dengan keterangan kalau gagal:

1. Cubit untuk zoom: taruh dua jari di layar dengan jeda sedikit (tidak persis bersamaan). Zoom harus tetap jalan.
2. Buka satu batch berukuran sekitar 250 MB. Aplikasi tidak boleh crash.
3. Gulir halaman, lalu langsung tutup aplikasi. Buka lagi, posisinya harus sama.
4. Tambah satu buku di PC. Buka di iPhone, baca beberapa halaman. Lalu buka lagi di PC, bacanya harus lanjut dari posisi terakhir di iPhone.
5. Download sambil membaca: buka seri yang hanya ada di Drive, lalu terus baca batch pertama selagi batch berikutnya ter-download. Bacaan tidak boleh melompat atau macet, dan batch berikutnya harus bisa dibaca setelah selesai.
6. Zoom 4x pada seri yang punya 6 batch atau lebih di perangkat. Gulir sampai ke batch-batch berikutnya; semua halaman harus tetap bisa dicapai.

### 14. Kalau ada masalah

- "Login ulang diperlukan": ketuk Masuk di baris status.
- "Sinkron gagal, dicoba lagi nanti": tidak perlu berbuat apa-apa. Aplikasi mencoba lagi saat dibuka ulang, saat internet tersambung kembali, setelah kamu mengubah sesuatu di rak, dan tiap 30 detik selama sedang membaca. Pastikan saja internet menyala.
- Pesan penyimpanan penuh: hapus buku yang sudah selesai dibaca dari perangkat lewat menu di kartunya, pilih "Hapus dari perangkat". File di Drive tidak ikut terhapus.
