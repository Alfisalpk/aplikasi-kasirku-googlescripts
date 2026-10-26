/**
 * Kasirku — backend Google Apps Script.
 * Data disimpan di Google Sheets yang terhubung ke project ini.
 */
const APP = {
  name: 'Kasirku',
  sheets: {
    products: 'Produk',
    sales: 'Penjualan',
    details: 'Detail Penjualan',
    staff: 'Staff',
    sessions: 'Sesi Staff',
    activities: 'Log Aktivitas',
    purchases: 'Pembelian Stok'
  },
  headers: {
    products: ['ID Produk', 'Nama Produk', 'SKU', 'Kategori', 'Harga', 'Stok', 'Stok Minimum', 'Diperbarui'],
    sales: ['ID Transaksi', 'Tanggal', 'Kasir', 'Subtotal', 'Diskon', 'Total', 'Metode Bayar', 'Dibayar', 'Kembalian', 'ID Staff'],
    details: ['ID Detail', 'ID Transaksi', 'ID Produk', 'Nama Produk', 'Qty', 'Harga', 'Subtotal'],
    staff: ['ID Staff', 'Nama', 'Username', 'Role', 'Password Hash', 'Salt', 'Status', 'Dibuat', 'Diperbarui'],
    sessions: ['Token', 'ID Staff', 'Nama', 'Username', 'Role', 'Login', 'Aktivitas Terakhir', 'Status'],
    activities: ['ID Log', 'Waktu', 'ID Staff', 'Nama Staff', 'Role', 'Aktivitas', 'Keterangan', 'Nilai'],
    purchases: ['ID Pembelian', 'Waktu', 'ID Staff', 'Nama Staff', 'ID Produk', 'Nama Produk', 'Qty', 'Harga Modal', 'Total Modal', 'Pemasok', 'Catatan']
  }
};

const AUTH = { sessionHours: 8, activeMinutes: 10, passwordMinLength: 8 };

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.name + ' | Point of Sale')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Jalankan sekali dari editor Apps Script untuk menyiapkan database. */
function setupKasirku() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Hubungkan project Apps Script ke Google Sheets terlebih dahulu.');
  const definitions = [
    [APP.sheets.products, APP.headers.products],
    [APP.sheets.sales, APP.headers.sales],
    [APP.sheets.details, APP.headers.details],
    [APP.sheets.staff, APP.headers.staff],
    [APP.sheets.sessions, APP.headers.sessions],
    [APP.sheets.activities, APP.headers.activities],
    [APP.sheets.purchases, APP.headers.purchases]
  ];
  definitions.forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#072f1f').setFontColor('#ffffff').setFontWeight('bold');
      sheet.autoResizeColumns(1, headers.length);
    } else if (name === APP.sheets.sales && sheet.getLastColumn() < headers.length) {
      const firstNewColumn = sheet.getLastColumn() + 1;
      sheet.getRange(1, firstNewColumn, 1, headers.length - sheet.getLastColumn())
        .setValues([headers.slice(sheet.getLastColumn())]);
      sheet.getRange(1, firstNewColumn, 1, headers.length - firstNewColumn + 1)
        .setBackground('#072f1f').setFontColor('#ffffff').setFontWeight('bold');
      sheet.autoResizeColumns(1, headers.length);
    }
  });
  seedProducts_();
  const createdAdmin = seedInitialAdmin_();
  if (createdAdmin) {
    Logger.log('Akun admin pertama — username: admin — password sementara: ' + createdAdmin.password);
    return { success: true, message: 'Database siap. Kredensial admin pertama hanya tercetak satu kali di execution log Apps Script.' };
  }
  return { success: true, message: 'Database Kasirku siap digunakan.' };
}

function login(username, password) {
  ensureReady_();
  const rows = sheet_(APP.sheets.staff).getDataRange().getValues();
  const normalized = String(username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const attemptKey = 'login:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized));
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= 8) throw new Error('Terlalu banyak percobaan login. Coba kembali dalam beberapa menit.');
  const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[2]).toLowerCase() === normalized && row[6] === 'Aktif');
  const row = rowIndex > 0 ? rows[rowIndex] : null;
  if (!row || passwordHash_(password, row[5]) !== String(row[4])) {
    cache.put(attemptKey, String(attempts + 1), 300);
    throw new Error('Username atau password salah.');
  }
  cache.remove(attemptKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  const now = new Date();
  sheet_(APP.sheets.sessions).appendRow([token, row[0], row[1], row[2], row[3], now, now, 'Aktif']);
  logActivity_(row, 'Login', 'Staff masuk ke aplikasi', 0);
  return { token, user: publicStaff_(row) };
}

function logout(token) {
  const session = findSession_(token, false);
  if (!session) return { success: true };
  const sheet = sheet_(APP.sheets.sessions);
  sheet.getRange(session.rowNumber, 7).setValue(new Date());
  sheet.getRange(session.rowNumber, 8).setValue('Keluar');
  logActivity_(session.staffRow, 'Logout', 'Staff keluar dari aplikasi', 0);
  return { success: true };
}

function heartbeat(token) {
  const session = requireSession_(token);
  return { user: publicStaff_(session.staffRow) };
}

function getInitialData(token) {
  const session = requireSession_(token);
  ensureReady_();
  const result = {
    products: getProducts_(),
    summary: session.role === 'admin' ? getSummary_('30days') : getCashierSummary_('30days', session.id),
    sales: getRecentSales_(8, session.role === 'admin' ? '' : session.id),
    chart: getSalesChart_('30days', session.role === 'admin' ? '' : session.id),
    lowStock: getProducts_().filter(p => p.stock <= p.minStock)
  };
  if (session.role === 'admin') result.admin = getAdminOverview_('30days');
  return result;
}

function getDashboardData(token, period) {
  const session = requireSession_(token);
  ensureReady_();
  const range = period || 'month';
  const cashierId = session.role === 'admin' ? '' : session.id;
  const result = { summary: cashierId ? getCashierSummary_(range, cashierId) : getSummary_(range), chart: getSalesChart_(range, cashierId), sales: getRecentSales_(8, cashierId) };
  if (session.role === 'admin') result.admin = getAdminOverview_(period || 'month');
  return result;
}

function getProducts(token) {
  requireSession_(token);
  ensureReady_();
  return getProducts_();
}

function saveProduct(token, product) {
  const session = requireRole_(token, 'admin');
  ensureReady_();
  validateProduct_(product);
  const sheet = sheet_(APP.sheets.products);
  const values = sheet.getDataRange().getValues();
  const id = product.id || Utilities.getUuid();
  const row = [id, String(product.name).trim(), String(product.sku || '').trim(),
    String(product.category || 'Umum').trim(), Number(product.price), Number(product.stock),
    Number(product.minStock || 0), new Date()];
  const index = values.findIndex((item, i) => i > 0 && String(item[0]) === String(id));
  if (index > 0) sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  logActivity_(session.staffRow, index > 0 ? 'Ubah produk' : 'Tambah produk', row[1], 0);
  return { success: true, products: getProducts_() };
}

function deleteProduct(token, productId) {
  const session = requireRole_(token, 'admin');
  ensureReady_();
  const sheet = sheet_(APP.sheets.products);
  const values = sheet.getDataRange().getValues();
  const index = values.findIndex((row, i) => i > 0 && String(row[0]) === String(productId));
  if (index < 1) throw new Error('Produk tidak ditemukan.');
  logActivity_(session.staffRow, 'Hapus produk', String(values[index][1]), 0);
  sheet.deleteRow(index + 1);
  return { success: true, products: getProducts_() };
}

function checkout(token, payload) {
  const session = requireSession_(token);
  ensureReady_();
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('Keranjang masih kosong.');
  }
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const productsSheet = sheet_(APP.sheets.products);
    const products = productsSheet.getDataRange().getValues();
    const productMap = {};
    products.slice(1).forEach((row, i) => { productMap[String(row[0])] = { row, rowNumber: i + 2 }; });
    let subtotal = 0;
    const quantities = {};
    payload.items.forEach(item => {
      const productId = String(item.productId);
      quantities[productId] = (quantities[productId] || 0) + Number(item.qty);
    });
    const lineItems = Object.keys(quantities).map(productId => {
      const product = productMap[productId];
      const qty = Math.floor(Number(quantities[productId]));
      if (!product || qty < 1) throw new Error('Produk atau jumlah barang tidak valid.');
      if (!Number.isFinite(qty)) throw new Error('Jumlah barang tidak valid.');
      if (Number(product.row[5]) < qty) throw new Error('Stok ' + product.row[1] + ' tidak mencukupi.');
      const price = Number(product.row[4]);
      subtotal += price * qty;
      return { product, qty, price, amount: price * qty };
    });
    const discount = Math.min(subtotal, Math.max(0, Number(payload.discount || 0)));
    if (!Number.isFinite(discount)) throw new Error('Nilai diskon tidak valid.');
    const total = subtotal - discount;
    const paid = Number(payload.paid || 0);
    if (!Number.isFinite(paid)) throw new Error('Jumlah pembayaran tidak valid.');
    if (paid < total) throw new Error('Jumlah pembayaran kurang dari total transaksi.');
    const methods = ['Tunai', 'QRIS', 'Transfer bank', 'Kartu debit'];
    if (!methods.includes(String(payload.paymentMethod || 'Tunai'))) throw new Error('Metode pembayaran tidak dikenal.');

    const transactionId = 'TRX-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
    const now = new Date();
    sheet_(APP.sheets.sales).appendRow([transactionId, now, session.name, subtotal,
      discount, total, String(payload.paymentMethod || 'Tunai'), paid, paid - total, session.id]);
    const details = sheet_(APP.sheets.details);
    lineItems.forEach(line => {
      details.appendRow([Utilities.getUuid(), transactionId, line.product.row[0], line.product.row[1],
        line.qty, line.price, line.amount]);
      productsSheet.getRange(line.product.rowNumber, 6).setValue(Number(line.product.row[5]) - line.qty);
    });
    logActivity_(session.staffRow, 'Penjualan', transactionId + ' · ' + String(payload.paymentMethod || 'Tunai') +
      ' · produk: ' + lineItems.map(line => line.product.row[1] + ' × ' + line.qty).join(', ') +
      ' · dibayar ' + paid + ' · kembalian ' + (paid - total), total);
    return { success: true, transactionId, subtotal, discount, total, change: paid - total,
      products: getProducts_() };
  } finally {
    lock.releaseLock();
  }
}

function getReport(token, period) {
  requireRole_(token, 'admin');
  ensureReady_();
  const range = dateRange_(period || 'month');
  const sales = rowsAsObjects_(APP.sheets.sales, APP.headers.sales)
    .filter(sale => sale.date >= range.start && sale.date <= range.end);
  const detailRows = rowsAsObjects_(APP.sheets.details, APP.headers.details);
  const quantities = {};
  detailRows.forEach(row => {
    if (sales.some(sale => sale.id === row.transactionId)) {
      const item = quantities[row.productName] || { name: row.productName, qty: 0, revenue: 0 };
      item.qty += Number(row.qty); item.revenue += Number(row.subtotal); quantities[row.productName] = item;
    }
  });
  return {
    summary: summarize_(sales),
    chart: getSalesChart_(period || 'month'),
    topProducts: Object.values(quantities).sort((a, b) => b.qty - a.qty).slice(0, 5),
    paymentMethods: paymentBreakdown_(sales),
    sales: sales.sort((a, b) => b.date - a.date).slice(0, 100).map(serializeSale_),
    strategy: buildSalesStrategy_(sales, Object.values(quantities), getProducts_())
  };
}

function getStaff(token) {
  requireRole_(token, 'admin');
  return sheet_(APP.sheets.staff).getDataRange().getValues().slice(1)
    .filter(row => row[0]).map(publicStaff_);
}

function saveStaff(token, staff) {
  const actor = requireRole_(token, 'admin');
  if (!staff || !String(staff.name || '').trim()) throw new Error('Nama staff wajib diisi.');
  const username = String(staff.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda minus.');
  const role = staff.role === 'admin' ? 'admin' : 'staff';
  const status = staff.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
  const sheet = sheet_(APP.sheets.staff);
  const rows = sheet.getDataRange().getValues();
  const existingIndex = staff.id ? rows.findIndex((row, index) => index > 0 && String(row[0]) === String(staff.id)) : -1;
  const duplicate = rows.some((row, index) => index > 0 && index !== existingIndex && String(row[2]).toLowerCase() === username);
  if (duplicate) throw new Error('Username tersebut sudah digunakan.');
  if (existingIndex > 0 && String(rows[existingIndex][0]) === String(actor.id) && (role !== 'admin' || status !== 'Aktif')) {
    throw new Error('Akun admin yang sedang digunakan tidak dapat dinonaktifkan atau diubah menjadi staff.');
  }
  if (existingIndex > 0 && rows[existingIndex][3] === 'admin' && rows[existingIndex][6] === 'Aktif' && (role !== 'admin' || status !== 'Aktif')) {
    const activeAdmins = rows.slice(1).filter(row => row[3] === 'admin' && row[6] === 'Aktif').length;
    if (activeAdmins <= 1) throw new Error('Minimal harus ada satu akun admin aktif.');
  }
  const now = new Date();
  const id = existingIndex > 0 ? rows[existingIndex][0] : Utilities.getUuid();
  let password = '';
  let salt = existingIndex > 0 ? rows[existingIndex][5] : '';
  let hash = existingIndex > 0 ? rows[existingIndex][4] : '';
  if (existingIndex < 1) {
    password = String(staff.password || generateTemporaryPassword_());
    validatePassword_(password);
    salt = Utilities.getUuid(); hash = passwordHash_(password, salt);
  }
  const row = [id, String(staff.name).trim(), username, role, hash, salt, status,
    existingIndex > 0 ? rows[existingIndex][7] : now, now];
  if (existingIndex > 0) sheet.getRange(existingIndex + 1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  if (status !== 'Aktif' || (existingIndex > 0 && rows[existingIndex][3] !== role)) revokeSessions_(id);
  logActivity_(actor.staffRow, existingIndex > 0 ? 'Ubah data staff' : 'Tambah staff', row[1] + ' (' + username + ') · ' + role, 0);
  return { success: true, staff: getStaff(token), temporaryPassword: password || null };
}

function resetStaffPassword(token, staffId, newPassword) {
  const actor = requireRole_(token, 'admin');
  validatePassword_(newPassword);
  const sheet = sheet_(APP.sheets.staff); const rows = sheet.getDataRange().getValues();
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && String(row[0]) === String(staffId));
  if (index < 1) throw new Error('Akun staff tidak ditemukan.');
  const salt = Utilities.getUuid();
  sheet.getRange(index + 1, 5, 1, 2).setValues([[passwordHash_(newPassword, salt), salt]]);
  sheet.getRange(index + 1, 9).setValue(new Date());
  revokeSessions_(staffId);
  logActivity_(actor.staffRow, 'Reset password', String(rows[index][1]) + ' (' + String(rows[index][2]) + ')', 0);
  return { success: true };
}

function changeMyPassword(token, currentPassword, newPassword) {
  const session = requireSession_(token);
  validatePassword_(newPassword);
  const sheet = sheet_(APP.sheets.staff); const rows = sheet.getDataRange().getValues();
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && String(row[0]) === String(session.id));
  if (index < 1 || passwordHash_(currentPassword, rows[index][5]) !== String(rows[index][4])) {
    throw new Error('Password saat ini tidak sesuai.');
  }
  const salt = Utilities.getUuid();
  sheet.getRange(index + 1, 5, 1, 2).setValues([[passwordHash_(newPassword, salt), salt]]);
  sheet.getRange(index + 1, 9).setValue(new Date());
  revokeSessions_(session.id);
  logActivity_(session.staffRow, 'Ganti password', 'Staff mengganti password akun', 0);
  return { success: true };
}

function recordStockPurchase(token, payload) {
  const actor = requireSession_(token);
  if (!payload || !Array.isArray(payload.items) || !payload.items.length) throw new Error('Pilih produk yang ditambahkan ke stok.');
  const lock = LockService.getDocumentLock(); lock.waitLock(10000);
  try {
    const productsSheet = sheet_(APP.sheets.products); const rows = productsSheet.getDataRange().getValues();
    const productMap = {};
    rows.slice(1).forEach((row, index) => { productMap[String(row[0])] = { row, rowNumber: index + 2 }; });
    const itemsByProduct = {};
    payload.items.forEach(item => {
      const productId = String(item.productId);
      if (!itemsByProduct[productId]) itemsByProduct[productId] = { qty: 0, cost: Number(item.cost || 0) };
      itemsByProduct[productId].qty += Number(item.qty);
    });
    const items = Object.keys(itemsByProduct).map(productId => {
      const found = productMap[productId]; const qty = Math.floor(itemsByProduct[productId].qty);
      const cost = itemsByProduct[productId].cost;
      if (!found || !Number.isFinite(qty) || qty < 1 || !Number.isFinite(cost) || cost < 0) throw new Error('Produk, jumlah, atau harga modal tidak valid.');
      return { found, qty, cost, total: qty * cost };
    });
    const purchaseId = 'PO-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
    const purchaseSheet = sheet_(APP.sheets.purchases); const now = new Date();
    items.forEach(item => {
      const product = item.found.row;
      productsSheet.getRange(item.found.rowNumber, 6).setValue(Number(product[5]) + item.qty);
      productsSheet.getRange(item.found.rowNumber, 8).setValue(now);
      purchaseSheet.appendRow([purchaseId, now, actor.id, actor.name, product[0], product[1], item.qty, item.cost,
        item.total, String(payload.supplier || '').trim(), String(payload.note || '').trim()]);
      logActivity_(actor.staffRow, 'Tambah stok', String(product[1]) + ' +' + item.qty + ' unit · pembelian ' + purchaseId, item.total);
    });
    logActivity_(actor.staffRow, 'Pembelian stok', purchaseId + ' · ' + items.length + ' produk · ' + String(payload.supplier || 'pemasok tidak dicatat'), items.reduce((sum, item) => sum + item.total, 0));
    return { success: true, purchaseId, products: getProducts_() };
  } finally { lock.releaseLock(); }
}

function getAdminOverview(token, period) {
  requireRole_(token, 'admin'); ensureReady_();
  return getAdminOverview_(period || 'month');
}

function getMyPurchases(token) {
  const session = requireSession_(token);
  return sheet_(APP.sheets.purchases).getDataRange().getValues().slice(1).filter(row => String(row[2]) === session.id)
    .sort((a, b) => new Date(b[1]) - new Date(a[1])).slice(0, 20).map(row => ({
      id: String(row[0]), date: new Date(row[1]).toISOString(), staff: String(row[3]), product: String(row[5]),
      qty: Number(row[6]), cost: Number(row[7]), total: Number(row[8]), supplier: String(row[9] || '')
    }));
}

function getAdminOverview_(period) {
  const sessionsSheet = sheet_(APP.sheets.sessions);
  const activeStaff = new Map(sheet_(APP.sheets.staff).getDataRange().getValues().slice(1)
    .filter(row => row[6] === 'Aktif').map(row => [String(row[0]), row]));
  const now = new Date();
  const activeSessions = sessionsSheet.getDataRange().getValues().slice(1).filter(row => {
    if (row[7] !== 'Aktif' || !activeStaff.has(String(row[1]))) return false;
    const lastSeen = row[6] instanceof Date ? row[6] : new Date(row[6]);
    return now - lastSeen <= AUTH.activeMinutes * 60000 && now - new Date(row[5]) <= AUTH.sessionHours * 3600000;
  }).map(row => {
    const staff = activeStaff.get(String(row[1]));
    return { name: String(staff[1]), username: String(staff[2]), role: String(staff[3]), lastSeen: new Date(row[6]).toISOString() };
  });
  const range = dateRange_(period);
  const allActivities = sheet_(APP.sheets.activities).getDataRange().getValues().slice(1).filter(row => row[0]);
  const activities = allActivities.filter(row => new Date(row[1]) >= range.start && new Date(row[1]) <= range.end)
    .sort((a, b) => new Date(b[1]) - new Date(a[1])).slice(0, 40).map(row => ({
      id: String(row[0]), date: new Date(row[1]).toISOString(), staffId: String(row[2]), name: String(row[3]),
      role: String(row[4]), activity: String(row[5]), detail: String(row[6]), amount: Number(row[7] || 0)
    }));
  const allPurchases = sheet_(APP.sheets.purchases).getDataRange().getValues().slice(1).filter(row => row[0]);
  const periodPurchases = allPurchases.filter(row => new Date(row[1]) >= range.start && new Date(row[1]) <= range.end);
  const purchases = allPurchases.sort((a, b) => new Date(b[1]) - new Date(a[1])).slice(0, 30).map(row => ({
      id: String(row[0]), date: new Date(row[1]).toISOString(), staff: String(row[3]), product: String(row[5]),
      qty: Number(row[6]), cost: Number(row[7]), total: Number(row[8]), supplier: String(row[9] || '')
    }));
  const sales = rowsAsObjects_(APP.sheets.sales, APP.headers.sales).filter(sale => sale.date >= range.start && sale.date <= range.end);
  const products = getProducts_();
  const productRevenue = {};
  rowsAsObjects_(APP.sheets.details, APP.headers.details).forEach(line => {
    if (sales.some(sale => sale.id === line.transactionId)) productRevenue[line.productName] = (productRevenue[line.productName] || 0) + line.subtotal;
  });
  const paymentMethods = paymentBreakdown_(sales);
  return {
    activeSessions,
    activities,
    purchases,
    purchaseCount: periodPurchases.length,
    purchaseValue: periodPurchases.reduce((sum, row) => sum + Number(row[8] || 0), 0),
    paymentMethods,
    productMix: Object.keys(productRevenue).map(name => ({ name, value: productRevenue[name] })).sort((a, b) => b.value - a.value).slice(0, 6),
    stockByStaff: purchases.slice(0, 12),
    lowStock: products.filter(product => product.stock <= product.minStock),
    staffCount: sheet_(APP.sheets.staff).getLastRow() - 1
  };
}

function buildSalesStrategy_(sales, topProducts, products) {
  const now = new Date(); const thisWeek = new Date(now); thisWeek.setHours(0, 0, 0, 0); thisWeek.setDate(thisWeek.getDate() - 6);
  const lastWeek = new Date(thisWeek); lastWeek.setDate(lastWeek.getDate() - 7);
  const currentRevenue = sales.filter(item => item.date >= thisWeek).reduce((sum, item) => sum + item.total, 0);
  const priorRevenue = sales.filter(item => item.date >= lastWeek && item.date < thisWeek).reduce((sum, item) => sum + item.total, 0);
  const trend = priorRevenue ? ((currentRevenue - priorRevenue) / priorRevenue) * 100 : null;
  const days = Math.max(1, Math.min(7, Math.ceil((now - thisWeek) / 86400000) + 1));
  const top = topProducts.slice().sort((a, b) => b.qty - a.qty)[0];
  const lowStock = products.filter(product => product.stock <= product.minStock);
  const strategies = [];
  if (trend !== null && trend < -10) strategies.push({ title: 'Pulihkan omzet mingguan', detail: 'Omzet 7 hari terakhir turun ' + Math.abs(trend).toFixed(1) + '%. Uji promo bundling pada jam sepi dan evaluasi hasilnya setelah satu minggu.', type: 'attention' });
  else if (trend !== null && trend > 10) strategies.push({ title: 'Jaga momentum penjualan', detail: 'Omzet mingguan tumbuh ' + trend.toFixed(1) + '%. Pastikan stok produk terlaris cukup sebelum menjalankan promosi tambahan.', type: 'positive' });
  else strategies.push({ title: 'Uji promosi terukur', detail: 'Bandingkan penjualan mingguan dan lakukan satu eksperimen promo dengan periode serta target yang jelas.', type: 'neutral' });
  if (top) strategies.push({ title: 'Prioritaskan produk terlaris', detail: top.name + ' menjadi produk teratas dengan ' + top.qty + ' unit terjual. Pertimbangkan bundling pelengkap dan jaga stok pengaman.', type: 'positive' });
  if (lowStock.length) strategies.push({ title: 'Restock sebelum kehabisan', detail: lowStock.slice(0, 3).map(product => product.name + ' (' + product.stock + ' tersisa)').join(', ') + '. Tinjau kebutuhan restock sebelum jam ramai.', type: 'attention' });
  const dailyAverage = currentRevenue / days;
  return { trend, forecast7Days: Math.round(dailyAverage * 7), currentWeekRevenue: currentRevenue, strategies };
}

function getProducts_() {
  const rows = sheet_(APP.sheets.products).getDataRange().getValues().slice(1);
  return rows.filter(row => row[0]).map(row => ({ id: String(row[0]), name: String(row[1]), sku: String(row[2] || ''),
    category: String(row[3] || 'Umum'), price: Number(row[4]), stock: Number(row[5]), minStock: Number(row[6] || 0) }));
}

function getSummary_(period) {
  const range = dateRange_(period);
  const sales = rowsAsObjects_(APP.sheets.sales, APP.headers.sales)
    .filter(sale => sale.date >= range.start && sale.date <= range.end);
  const current = summarize_(sales);
  const priorStart = new Date(range.start); priorStart.setTime(priorStart.getTime() - (range.end - range.start + 86400000));
  const prior = summarize_(rowsAsObjects_(APP.sheets.sales, APP.headers.sales)
    .filter(sale => sale.date >= priorStart && sale.date < range.start));
  current.growth = prior.revenue ? ((current.revenue - prior.revenue) / prior.revenue) * 100 : 0;
  return current;
}

function getCashierSummary_(period, staffId) {
  const range = dateRange_(period);
  const allSales = rowsAsObjects_(APP.sheets.sales, APP.headers.sales).filter(sale => sale.cashierId === staffId);
  const sales = allSales.filter(sale => sale.date >= range.start && sale.date <= range.end);
  const duration = range.end - range.start + 86400000;
  const priorStart = new Date(range.start.getTime() - duration);
  const current = summarize_(sales);
  const prior = summarize_(allSales.filter(sale => sale.date >= priorStart && sale.date < range.start));
  current.growth = prior.revenue ? ((current.revenue - prior.revenue) / prior.revenue) * 100 : 0;
  return current;
}

function summarize_(sales) {
  return { revenue: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    transactions: sales.length, average: sales.length ? sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0) / sales.length : 0 };
}

function getRecentSales_(limit, staffId) {
  return rowsAsObjects_(APP.sheets.sales, APP.headers.sales)
    .filter(sale => !staffId || sale.cashierId === staffId)
    .sort((a, b) => b.date - a.date)
    .slice(0, limit)
    .map(serializeSale_);
}

function serializeSale_(sale) {
  return Object.assign({}, sale, { date: sale.date.toISOString() });
}

function getSalesChart_(period, staffId) {
  const range = dateRange_(period);
  const sales = rowsAsObjects_(APP.sheets.sales, APP.headers.sales)
    .filter(sale => sale.date >= range.start && sale.date <= range.end && (!staffId || sale.cashierId === staffId));
  const count = period === 'week' ? 7 : period === 'year' ? 12 : period === 'month' ? range.end.getDate() : 30;
  const labels = []; const values = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(range.end);
    if (period === 'year') { date.setDate(1); date.setMonth(range.end.getMonth() - i); }
    else date.setDate(date.getDate() - i);
    const key = period === 'year' ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM') : Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    labels.push(period === 'year' ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM') : Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMM'));
    values.push(sales.filter(sale => Utilities.formatDate(sale.date, Session.getScriptTimeZone(), period === 'year' ? 'yyyy-MM' : 'yyyy-MM-dd') === key)
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0));
  }
  return { labels, values };
}

function paymentBreakdown_(sales) {
  const totals = {};
  sales.forEach(sale => { totals[sale.paymentMethod] = (totals[sale.paymentMethod] || 0) + Number(sale.total || 0); });
  return Object.keys(totals).map(method => ({ method, total: totals[method] }));
}

function rowsAsObjects_(sheetName, headers) {
  const rows = sheet_(sheetName).getDataRange().getValues().slice(1);
  return rows.filter(row => row[0]).map(row => {
    const date = row[1] instanceof Date ? row[1] : new Date(row[1]);
    if (sheetName === APP.sheets.sales) return { id: String(row[0]), date, cashier: String(row[2]), subtotal: Number(row[3]), discount: Number(row[4]), total: Number(row[5]), paymentMethod: String(row[6]), paid: Number(row[7]), change: Number(row[8]), cashierId: String(row[9] || '') };
    if (sheetName === APP.sheets.details) return { id: String(row[0]), transactionId: String(row[1]), productId: String(row[2]), productName: String(row[3]), qty: Number(row[4]), price: Number(row[5]), subtotal: Number(row[6]) };
    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });
}

function dateRange_(period) {
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - 6);
  else if (period === '30days') start.setDate(start.getDate() - 29);
  else if (period === 'year') { start.setDate(1); start.setMonth(0); }
  else { start.setDate(1); }
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return { start, end };
}

function seedInitialAdmin_() {
  const sheet = sheet_(APP.sheets.staff);
  if (sheet.getLastRow() > 1) return null;
  const password = generateTemporaryPassword_();
  const salt = Utilities.getUuid(); const now = new Date();
  sheet.appendRow([Utilities.getUuid(), 'Administrator', 'admin', 'admin', passwordHash_(password, salt), salt, 'Aktif', now, now]);
  return { username: 'admin', password };
}

function generateTemporaryPassword_() {
  return (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 20);
}

function validatePassword_(password) {
  if (String(password || '').length < AUTH.passwordMinLength) {
    throw new Error('Password harus terdiri dari minimal ' + AUTH.passwordMinLength + ' karakter.');
  }
}

function passwordHash_(password, salt) {
  const properties = PropertiesService.getScriptProperties();
  let pepper = properties.getProperty('KASIRKU_AUTH_PEPPER');
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('KASIRKU_AUTH_PEPPER', pepper);
  }
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(
    String(salt) + ':' + String(password || ''), pepper, Utilities.Charset.UTF_8
  ));
}

function publicStaff_(row) {
  return { id: String(row[0]), name: String(row[1]), username: String(row[2]), role: String(row[3]),
    status: String(row[6]), createdAt: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || '') };
}

function findSession_(token, touch) {
  if (!token) return null;
  const sheet = sheet_(APP.sheets.sessions); const rows = sheet.getDataRange().getValues();
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && String(row[0]) === String(token) && row[7] === 'Aktif');
  if (index < 1) return null;
  const row = rows[index]; const now = new Date(); const lastSeen = row[6] instanceof Date ? row[6] : new Date(row[6]);
  const loginTime = row[5] instanceof Date ? row[5] : new Date(row[5]);
  if (!Number.isFinite(lastSeen.getTime()) || now - loginTime > AUTH.sessionHours * 3600000) {
    sheet.getRange(index + 1, 8).setValue('Kedaluwarsa');
    return null;
  }
  const staffRows = sheet_(APP.sheets.staff).getDataRange().getValues();
  const staffRow = staffRows.find((staff, staffIndex) => staffIndex > 0 && String(staff[0]) === String(row[1]));
  if (!staffRow || staffRow[6] !== 'Aktif') {
    sheet.getRange(index + 1, 8).setValue('Dicabut');
    return null;
  }
  if (touch) sheet.getRange(index + 1, 7).setValue(now);
  return { token: String(token), id: String(row[1]), name: String(staffRow[1]), username: String(staffRow[2]),
    role: String(staffRow[3]), staffRow, rowNumber: index + 1 };
}

function requireSession_(token) {
  const session = findSession_(token, true);
  if (!session) throw new Error('Sesi berakhir atau akun dinonaktifkan. Silakan login kembali.');
  return session;
}

function requireRole_(token, role) {
  const session = requireSession_(token);
  if (session.role !== role) throw new Error('Akses ini hanya tersedia untuk admin.');
  return session;
}

function logActivity_(staffRow, activity, detail, amount) {
  sheet_(APP.sheets.activities).appendRow([Utilities.getUuid(), new Date(), String(staffRow[0]), String(staffRow[1]),
    String(staffRow[3]), String(activity), String(detail || ''), Number(amount || 0)]);
}

function revokeSessions_(staffId) {
  const sheet = sheet_(APP.sheets.sessions); const rows = sheet.getDataRange().getValues(); const now = new Date();
  rows.forEach((row, index) => {
    if (index > 0 && String(row[1]) === String(staffId) && row[7] === 'Aktif') {
      sheet.getRange(index + 1, 7).setValue(now); sheet.getRange(index + 1, 8).setValue('Dicabut');
    }
  });
}

function validateProduct_(product) {
  if (!product || !String(product.name || '').trim()) throw new Error('Nama produk wajib diisi.');
  if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) throw new Error('Harga produk tidak valid.');
  if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < 0) throw new Error('Stok produk tidak valid.');
}

function ensureReady_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || !ss.getSheetByName(APP.sheets.products) || !ss.getSheetByName(APP.sheets.sales)) {
    throw new Error('Database belum disiapkan. Jalankan setupKasirku() dari editor Apps Script.');
  }
}

function sheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan setupKasirku().');
  return sheet;
}

function seedProducts_() {
  const sheet = sheet_(APP.sheets.products);
  if (sheet.getLastRow() > 1) return;
  const samples = [
    ['PRD-001', 'Kopi Susu Gula Aren', 'KPG-001', 'Minuman', 18000, 42, 8, new Date()],
    ['PRD-002', 'Roti Sourdough', 'ROT-002', 'Makanan', 26000, 18, 5, new Date()],
    ['PRD-003', 'Matcha Latte', 'MTC-003', 'Minuman', 22000, 6, 8, new Date()],
    ['PRD-004', 'Croissant Butter', 'CRS-004', 'Makanan', 16000, 24, 6, new Date()],
    ['PRD-005', 'Es Cokelat', 'COK-005', 'Minuman', 20000, 31, 8, new Date()],
    ['PRD-006', 'Cookies Choco Chip', 'CKS-006', 'Camilan', 12000, 4, 8, new Date()]
  ];
  sheet.getRange(2, 1, samples.length, samples[0].length).setValues(samples);
}
