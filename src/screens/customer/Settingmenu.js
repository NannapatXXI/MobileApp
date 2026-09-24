// db/menuQueries.js
// ฟังก์ชันดึง/แก้ไขข้อมูลเมนู หมวดหมู่ และตัวเลือกย่อย ตาม schema ใน db/schema.js
// เรียกใช้จากหน้าจอผ่าน db ที่ได้จาก useSQLiteContext() เท่านั้น
// (ตามข้อกำหนด §4: ห้ามเปิด database เองในหน้าจอ)
//
// ราคาทุกจุดเป็น "สตางค์" (INTEGER) เหมือนใน schema — แปลงเป็นบาทตอนแสดงผลในหน้าจอเท่านั้น

// ---- หมวดหมู่ทั้งหมด ----
export async function getCategories(db) {
  return db.getAllAsync('SELECT category_id AS id, name FROM categories ORDER BY category_id');
}

// ---- เมนูทั้งหมด พร้อมชื่อหมวดหมู่ (join categories) ----
export async function getMenuItemsWithCategory(db) {
  return db.getAllAsync(`
    SELECT
      mi.item_id       AS id,
      mi.name          AS name,
      mi.price_satang  AS priceSatang,
      mi.is_available  AS isAvailable,
      mi.category_id   AS categoryId,
      c.name           AS categoryName
    FROM menu_items mi
    JOIN categories c ON c.category_id = mi.category_id
    ORDER BY mi.item_id
  `);
}

// ---- จำนวนที่ขายไปแล้ว "วันนี้" ต่อเมนู 1 รายการ (ไม่นับรายการที่ถูกยกเลิก) ----
// คืนค่าเป็น { [item_id]: จำนวนจาน } เพื่อเอาไป merge กับ getMenuItemsWithCategory ในหน้าจอ
export async function getSoldTodayByItem(db) {
  const rows = await db.getAllAsync(`
    SELECT oi.item_id AS itemId, SUM(oi.quantity) AS qty
    FROM order_items oi
    JOIN order_rounds r ON r.round_id = oi.round_id
    JOIN bills b ON b.bill_id = r.bill_id
    WHERE oi.status != 'cancelled'
      AND date(b.opened_at) = date('now', 'localtime')
    GROUP BY oi.item_id
  `);
  const map = {};
  for (const row of rows) map[row.itemId] = row.qty;
  return map;
}

// ---- ตัวเลือกย่อยของเมนู 1 รายการ ----
export async function getMenuOptionsByItem(db, itemId) {
  return db.getAllAsync(
    'SELECT option_id AS id, name, price_delta_satang AS priceDeltaSatang FROM menu_options WHERE item_id = ? ORDER BY option_id',
    [itemId]
  );
}

// ---- แก้ไขชื่อ / ราคา / หมวดของเมนู ----
export async function updateMenuItem(db, itemId, { name, priceSatang, categoryId }) {
  await db.runAsync(
    'UPDATE menu_items SET name = ?, price_satang = ?, category_id = ? WHERE item_id = ?',
    [name, priceSatang, categoryId, itemId]
  );
}

// ---- เปิด/ปิดขายเมนู (toggle ในลิสต์ หรือปุ่ม "ปิดขายชั่วคราว") ----
export async function setMenuItemAvailability(db, itemId, isAvailable) {
  await db.runAsync('UPDATE menu_items SET is_available = ? WHERE item_id = ?', [
    isAvailable ? 1 : 0,
    itemId,
  ]);
}

// ---- เพิ่มตัวเลือกย่อยใหม่ให้เมนู ----
export async function addMenuOption(db, itemId, name, priceDeltaSatang) {
  const result = await db.runAsync(
    'INSERT INTO menu_options (item_id, name, price_delta_satang) VALUES (?, ?, ?)',
    [itemId, name, priceDeltaSatang]
  );
  return result.lastInsertRowId;
}

// ---- ลบตัวเลือกย่อย ----
export async function deleteMenuOption(db, optionId) {
  await db.runAsync('DELETE FROM menu_options WHERE option_id = ?', [optionId]);
}

// ---- เพิ่มเมนูใหม่ทั้งรายการ (ปุ่ม "+ เพิ่มเมนูใหม่") ----
export async function addMenuItem(db, { name, categoryId, priceSatang }) {
  const result = await db.runAsync(
    'INSERT INTO menu_items (category_id, name, price_satang) VALUES (?, ?, ?)',
    [categoryId, name, priceSatang]
  );
  return result.lastInsertRowId;
}