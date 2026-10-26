# Kasirku — Aplikasi Kasir UMKM

Kasirku adalah aplikasi kasir berbasis web untuk membantu UMKM mengelola transaksi, produk, stok, dan performa penjualan. Aplikasi menggunakan Google Apps Script dan Google Sheets, dengan antarmuka yang mengadaptasi template Spark Admin.

## Highlight aplikasi

- **Dashboard usaha:** ringkasan omzet, jumlah transaksi, rata-rata belanja, stok menipis, dan transaksi terbaru.
- **Login ber-role:** akun admin dan staff memiliki akses berbeda; sesi login memiliki batas waktu.
- **Manajemen staff:** admin dapat menambah akun, mengubah nama dan role, menonaktifkan akun, serta mereset password.
- **Kasir (POS):** cari produk, kelola keranjang, berikan diskon, pilih metode pembayaran, dan hitung kembalian.
- **Kontrol inventaris:** admin mengelola katalog, staff mencatat pembelian dan penambahan stok dengan pemasok serta harga modal.
- **Pencatatan stok otomatis:** stok divalidasi sebelum transaksi dan diperbarui setelah pembayaran berhasil.
- **Pemantauan operasional:** admin melihat log pemasukan, detail produk terjual, metode pembayaran, sesi staff aktif, dan staff yang menambahkan stok.
- **Analisis visual dan strategi:** grafik tren, diagram pie produk dan pembayaran, rekomendasi penjualan, serta proyeksi omzet 7 hari.
- **Data mudah dikelola:** data produk dan transaksi tersimpan di Google Sheets.
- **Tampilan responsif:** nyaman digunakan melalui desktop maupun perangkat seluler.
- **Kode terstruktur:** empat file Apps Script memisahkan backend, halaman, gaya, dan interaksi agar mudah dibaca dan dirawat.

## Panduan

Lihat [PANDUAN.md](PANDUAN.md) untuk langkah setup Google Sheets, deployment Web App, penggunaan, serta pemecahan masalah.
