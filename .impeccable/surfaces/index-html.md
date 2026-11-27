---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/library.js","src/reader.js","src/transfers.js","app.css"]
---

Scope: semua layar Rak Buku (rak, detail seri, pembaca, transfer, sheet). Mode: Operate.
Audience/job: pemilik sendiri, kebanyakan iPhone malam hari; buka aplikasi -> lanjut baca; kadang memilih seri dan batch, memantau transfer.
Constraints: PWA tanpa build, DOM dibangun di src/*.js, perilaku dan posisi baca tidak boleh berubah; target sentuh >= 44px; offline.
Reference bar: user memilih standar kategori (standing exit); produk pembanding yang ia sebut: Shinigami (situs baca manhwa) untuk fungsi dan tingkat kerapian, bukan tampilan.

## Direction contract
THESIS: Aplikasi baca komik gelap yang dikerjakan sangat rapi; halaman buku adalah pusat, kontrol menyingkir. Menolak rak bergaya katalog toko atau dekorasi apa pun.
OWN-WORLD: latar hampir hitam #0E0F12, permukaan #17191E/#1F2229, teks #F2F3F5 dan #A3A8B3, satu aksen biru #3D7BFF untuk aksi dan progres; ikon SVG garis 1.75px; sudut 12px kartu, 999px pil; huruf sistem (SF di iPhone), angka tabular.
STORY: membuka aplikasi langsung melihat Lanjut baca dengan posisi dan perangkat terakhir; satu ketukan masuk ke halaman; di pembaca bisa pindah batch/chapter, auto-scroll, atur baca; status transfer selalu jujur.
FIRST VIEWPORT: bar atas (judul Rak Buku kiri, tombol Transfer dan Sinkron kanan), kotak cari, kartu Lanjut baca besar (sampul 96px, judul, Batch/hal, perangkat+waktu, bar progres, tombol biru Lanjut baca), tab kategori pil, grid sampul 3 kolom (HP) dengan progres tipis di bawah sampul; tombol + mengambang biru.
FORM: canon (standing exit), seed: e5fbf8e67d93d5c8
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
