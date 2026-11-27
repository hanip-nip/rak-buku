# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Satu orang: pemiliknya sendiri. Ia membaca komik (manhwa dalam file batch PDF ratusan MB) dan light novel (satu PDF ribuan halaman), kebanyakan di iPhone sebagai aplikasi layar utama, kadang di PC (Brave). Masalah awalnya: lupa sampai halaman berapa.

## Product Purpose

Rak pribadi untuk PDF yang dimasukkan sendiri, yang selalu ingat posisi baca dan bisa dibaca offline. Satu akun Google menghubungkan semua perangkat tanpa upload ulang. Berhasil kalau membuka aplikasi di perangkat mana pun langsung kembali ke halaman terakhir.

## Positioning

Bukan situs baca komik: tidak ada katalog, peringkat, komentar, atau rekomendasi. Isinya hanya file milik pengguna; posisi, bookmark, dan riwayat baca ikut berpindah antarperangkat lewat Google Drive pengguna sendiri.

## Operating Context

- Membaca dengan scroll bersambung (komik strip panjang dan halaman novel), sering satu tangan di HP, kadang malam hari.
- Komik datang per batch (mis. "Ch.001-050"); novel satu file semua chapter, kadang tanpa daftar isi.
- Perangkat baru men-download buku yang dibuka plus 2 batch berikutnya; upload/download besar berjalan sambil membaca.
- Pengguna membandingkan pengalaman bacanya dengan situs baca manhwa populer (mis. Shinigami): navigasi chapter sebelumnya/berikutnya, auto-scroll, pengaturan baca.

## Capabilities and Constraints

- PWA statis di GitHub Pages, tanpa build step (ES modules), pdf.js 4.10.38; iOS 17.4+.
- Login Google lewat Cloudflare Worker kecil; scope hanya drive.file.
- Rak dengan kategori Komik / Novel / Buku lain dan pencarian judul; pembaca dengan daftar isi, bookmark bercatatan, riwayat posisi dari semua perangkat, mode malam, zoom cubit, halaman Transfer.
- Download hanya berjalan selama aplikasi terbuka (keterbatasan web di iPhone).
- Bahasa antarmuka: Indonesia.

## Brand Commitments

Nama "Rak Buku". Tidak ada logo atau aset merek lain yang dikunci.

## Evidence on Hand

Contoh file uji di D:\OnlineBook (13 batch The God of High School, novel Omniscient Reader's Viewpoint). Tidak ada testimoni atau data pengguna lain; jangan dikarang.

## Product Principles

- Posisi baca tidak pernah hilang dan tidak pernah pindah diam-diam.
- Halaman buku adalah pusat perhatian; kontrol muncul saat dibutuhkan lalu menyingkir.
- Status transfer selalu jujur dan terlihat (berapa persen, menunggu apa).
- Offline lebih dulu: semua yang sudah di perangkat bisa dibaca tanpa internet.

## Accessibility & Inclusion

Target sentuh nyaman di HP (≥ 44 px), teks mudah dibaca di layar kecil dan dalam gelap.
