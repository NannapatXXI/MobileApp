// src/db/queries_admin/menuSettings.js
// query สำหรับหน้าตั้งค่าเมนู (MenuSettingsScreen) — ย้ายมาจากไฟล์หน้าจอ
// เพราะข้อกำหนดให้รวม SQL ทั้งหมดไว้ในโฟลเดอร์ db/ หน้าจอห้ามเขียน SQL เอง
// ค่าจากผู้ใช้ทุกตัวส่งผ่าน ? เท่านั้น

// หมวดหมู่ทั้งหมด
export function getCategories(db) {
  return db.getAllAsync('SELECT category_id AS id, name FROM categories ORDER BY category_id');
}

// เมนูทั้งหมด พร้อมชื่อหมวดหมู่
export function getMenuItemsWithCategory(db) {
  return db.getAllAsync(
    `SELECT mi.item_id AS id, mi.name, mi.price_satang AS priceSatang,
            mi.is_available AS isAvailable, mi.category_id AS categoryId, c.name AS categoryName
     FROM menu_items mi
     JOIN categories c ON c.category_id = mi.category_id
     ORDER BY mi.item_id`
  );
}

// จำนวนที่ขายได้วันนี้ของแต่ละเมนู → { item_id: จำนวน }
export async function getSoldTodayByItem(db) {
  const rows = await db.getAllAsync(
    `SELECT oi.item_id AS itemId, SUM(oi.quantity) AS qty
     FROM order_items oi
     JOIN order_rounds r ON r.round_id = oi.round_id
     JOIN bills b ON b.bill_id = r.bill_id
     WHERE oi.status != 'cancelled' AND date(b.opened_at) = date('now', 'localtime')
     GROUP BY oi.item_id`
  );
  const map = {};
  for (const row of rows) map[row.itemId] = row.qty;
  return map;
}

// ตัวเลือกเพิ่มเติมของเมนู 1 รายการ
export function getMenuOptionsByItem(db, itemId) {
  return db.getAllAsync(
    `SELECT option_id AS id, name, price_delta_satang AS priceDeltaSatang
     FROM menu_options
     WHERE item_id = ?
     ORDER BY option_id`,
    [itemId]
  );
}

// แก้ชื่อ / ราคา / หมวดหมู่ของเมนู
export function updateMenuItem(db, itemId, { name, priceSatang, categoryId }) {
  return db.runAsync(
    'UPDATE menu_items SET name = ?, price_satang = ?, category_id = ? WHERE item_id = ?',
    [name, priceSatang, categoryId, itemId]
  );
}

// เปิด/ปิดการขายเมนู
export function setMenuItemAvailability(db, itemId, isAvailable) {
  return db.runAsync(
    'UPDATE menu_items SET is_available = ? WHERE item_id = ?',
    [isAvailable ? 1 : 0, itemId]
  );
}

// เพิ่มตัวเลือกให้เมนู → คืน option_id ที่เพิ่งสร้าง
export async function addMenuOption(db, itemId, name, priceDeltaSatang) {
  const result = await db.runAsync(
    'INSERT INTO menu_options (item_id, name, price_delta_satang) VALUES (?, ?, ?)',
    [itemId, name, priceDeltaSatang]
  );
  return result.lastInsertRowId;
}

// เพิ่มเมนูใหม่ → คืน item_id ที่เพิ่งสร้าง
export async function addMenuItem(db, { name, categoryId, priceSatang }) {
  const result = await db.runAsync(
    'INSERT INTO menu_items (category_id, name, price_satang) VALUES (?, ?, ?)',
    [categoryId, name, priceSatang]
  );
  return result.lastInsertRowId;
}
