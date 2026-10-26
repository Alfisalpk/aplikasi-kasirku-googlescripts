# Panduan Kasirku

Panduan ini menjelaskan cara memasang dan menjalankan aplikasi Kasirku dari folder Google Apps Script.

## Daftar file aplikasi

Salin empat file ini ke project Apps Script. Batas maksimal lima file Google Apps Script tetap terpenuhi.

1. `Code.gs` — backend, setup database Sheets, validasi transaksi, inventaris, dan laporan.
2. `Index.html` — struktur halaman aplikasi.
3. `Styles.html` — tampilan responsif.
4. `App.html` — interaksi antarmuka.

## 1. Hubungkan project ke Google Sheets

1. Buat Google Spreadsheet baru untuk menyimpan data aplikasi, misalnya **Database Kasirku**.
2. Dari spreadsheet, buka **Extensions → Apps Script**. Project yang terbuka akan terhubung ke spreadsheet tersebut.
3. Di editor Apps Script, buka `Code.gs`, hapus kode awal jika ada, lalu salin seluruh isi file `Code.gs` dari folder ini.

## 2. Tambahkan file antarmuka

1. Klik tombol **+** pada bagian Files dan pilih **HTML**.
2. Buat file bernama `Index` (tanpa ekstensi), lalu salin isi `Index.html`.
3. Ulangi untuk file bernama `Styles` dan `App`, salin isi file yang namanya sesuai.
4. Pastikan di editor terdapat `Code.gs`, `Index.html`, `Styles.html`, dan `App.html`.
5. Simpan project dan beri nama, misalnya **Kasirku UMKM**.

## 3. Siapkan database

1. Pada toolbar editor, pilih fungsi `setupKasirku`, lalu klik **Run**.
2. Pilih akun Google dan berikan izin untuk membaca serta mengubah spreadsheet yang terhubung.
3. Kembali ke spreadsheet. Fungsi setup membuat sheet `Produk`, `Penjualan`, `Detail Penjualan`, `Staff`, `Sesi Staff`, `Log Aktivitas`, dan `Pembelian Stok`.
4. Saat pertama kali, setup membuat akun admin dengan username `admin` dan password sementara acak. Setelah eksekusi selesai, buka **Execution log** di editor Apps Script untuk mengambil password yang dicetak satu kali. Login, lalu ganti password melalui ikon kunci di bagian atas aplikasi.
5. Jika katalog Produk masih kosong, beberapa produk contoh akan ditambahkan. Ubah atau hapus produk tersebut sesuai kebutuhan.

Jangan membagikan execution log atau password awal kepada staff. `setupKasirku()` bisa dijalankan kembali; fungsi ini tidak menimpa header, mereset akun, atau menambahkan contoh produk bila katalog sudah berisi produk.

## 4. Deploy sebagai Web App

1. Di Apps Script, pilih **Deploy → New deployment**.
2. Buka pilihan jenis deployment, lalu pilih **Web app**.
3. Isi deskripsi deployment.
4. Pilih **Execute as** akun pemilik project agar aplikasi memakai akses pemilik ke spreadsheet.
5. Pada **Who has access**, pilih cakupan akses yang sesuai, seperti akun sendiri atau pengguna organisasi.
6. Klik **Deploy**, selesaikan persetujuan izin bila diminta, lalu salin URL Web App yang berakhiran `/exec`.
7. Buka URL `/exec` di browser untuk menggunakan aplikasi. URL `/dev` ditujukan untuk pengujian oleh pengguna yang memiliki akses edit ke project.

## 5. Perbarui versi yang sudah di-deploy

1. Ubah kode di Apps Script dan simpan project.
2. Buka **Deploy → Manage deployments**.
3. Klik ikon edit pada deployment Web App.
4. Pada bagian **Version**, pilih **New version**, kemudian klik **Deploy**.
5. Muat ulang URL `/exec` untuk membuka kode versi terbaru.

## Cara menggunakan aplikasi

### Dashboard

Setelah login, admin dapat melihat ringkasan penjualan, grafik omzet, sesi staff aktif, diagram komposisi produk dan pembayaran, serta log aktivitas. Dashboard staff menampilkan ringkasan dan transaksi miliknya sendiri.

Pada halaman login, masukkan nama pengguna dan kata sandi. Pilih **Ingat saya** bila ingin sesi tetap tersimpan di browser setelah ditutup; sesi server tetap berakhir maksimal setelah 8 jam. Ikon mata dapat digunakan untuk melihat atau menyembunyikan kata sandi saat mengetik.

### Role dan akun staff

- **Admin:** mengelola produk, melihat laporan dan pemantauan usaha, serta mengelola akun staff.
- **Staff:** melakukan transaksi kasir dan mencatat barang yang dibeli untuk menambah stok.
- Admin membuka **Kelola staff** untuk membuat akun dan mengubah nama, username, role, atau status.
- Gunakan tombol kunci di bar atas untuk mengganti password sendiri. Admin dapat mereset password staff dari daftar akun; reset mencabut sesi staff tersebut.
- Sesi login berlaku maksimal 8 jam. Dashboard admin menandai sesi aktif jika staff melakukan aktivitas dalam 10 menit terakhir.
- Simpan execution log setup dengan aman dan jangan membagikan password sementara admin.

### Kasir

1. Buka menu **Kasir**.
2. Cari produk atau filter berdasarkan kategori, lalu klik produk untuk menambahkannya ke keranjang.
3. Atur jumlah barang. Sistem membatasi jumlah sesuai stok yang tersedia.
4. Masukkan diskon bila diperlukan, pilih metode pembayaran, lalu masukkan nominal uang yang diterima.
5. Klik **Bayar sekarang**. Sistem memeriksa kecukupan pembayaran dan stok, menyimpan transaksi, lalu mengurangi stok.

### Produk

Buka menu **Produk** untuk melihat katalog. Admin dapat menambah, mengubah, atau menghapus produk. Setiap produk memiliki SKU, kategori, harga jual, stok, dan batas minimum stok.

### Tambah stok

Staff atau admin membuka **Tambah stok**, memilih produk, lalu memasukkan jumlah dan harga modal per unit. Pemasok dan catatan dapat diisi bila tersedia. Stok bertambah dan pembelian tercatat atas nama akun yang login. Admin dapat meninjau rincian tersebut di **Log pemantauan**.

### Log pemantauan admin

Menu ini mencatat login/logout, transaksi penjualan, metode pembayaran, rincian produk dan jumlah terjual, pemasukan, perubahan katalog, reset password, serta pembelian stok oleh staff. Tabel pembelian menunjukkan staff pencatat, produk, jumlah masuk, harga modal, dan pemasok.

### Laporan

Buka menu **Laporan** untuk melihat omzet, jumlah transaksi, rata-rata transaksi, tren, komposisi metode pembayaran dan produk, serta produk terlaris. Bagian **Strategi penjualan** memberi saran berbasis perubahan omzet mingguan, produk terlaris, dan stok minimum.

Proyeksi omzet tujuh hari dihitung dari rata-rata pemasukan harian tujuh hari terakhir. Ini estimasi sederhana dari data yang tercatat, bukan jaminan hasil atau prediksi yang memperhitungkan musim, hari libur, dan faktor pasar.

## Pemecahan masalah

- **Database belum disiapkan:** jalankan `setupKasirku()` dari editor Apps Script pada project yang terhubung ke spreadsheet.
- **Sheet tidak ditemukan:** pastikan tujuh sheet database tidak diganti nama atau dihapus, lalu jalankan kembali setup.
- **Tidak bisa login:** username awal adalah `admin`; ambil password sementara dari execution log saat setup pertama. Admin dapat membuat akun atau mereset password staff dari menu **Kelola staff**.
- **Aplikasi lama setelah menambahkan fitur login:** salin keempat file terbaru ke Apps Script, jalankan `setupKasirku()` sekali untuk membuat sheet baru dan menambahkan kolom ID staff, lalu deploy **New version**.
- **Diminta login kembali:** sesi berakhir setelah 8 jam, akun dinonaktifkan, atau password direset. Login lagi untuk meneruskan.
- **Gagal membaca atau menyimpan data:** pastikan deployment berjalan sebagai akun yang memiliki akses edit ke spreadsheet dan izin Apps Script sudah diberikan.
- **Perubahan kode belum terlihat:** buat versi deployment baru dari **Manage deployments**, lalu muat ulang URL `/exec`.
- **Grafik, ikon, atau font tidak muncul:** aset tersebut dimuat dari CDN; pastikan browser memiliki koneksi internet dan akses ke CDN.
- **File HTML dibuka langsung tetapi aplikasi tidak berfungsi:** gunakan URL Web App hasil deployment. Pemanggilan backend memerlukan Google Apps Script.

## Catatan penggunaan

- Jangan menghapus atau mengganti nama tujuh sheet database.
- Pilih cakupan akses deployment dengan cermat. Role aplikasi mengatur fitur yang tersedia setelah pengguna masuk.
- Rekomendasi strategi dan proyeksi memerlukan catatan penjualan yang memadai.
- Aplikasi versi ini belum mencakup pajak, retur, maupun cetak struk.
