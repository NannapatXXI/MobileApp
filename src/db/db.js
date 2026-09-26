// db/schema.js
// สร้างตารางทั้งหมด + ใส่ข้อมูลตั้งต้น สำหรับแอปสั่งอาหารในร้าน (expo-sqlite)
//
// วิธีใช้ใน App.tsx:
//
//   import { SQLiteProvider } from 'expo-sqlite';
//   import { DATABASE_NAME, initDb, seedDb } from './db/schema';
//
//   <SQLiteProvider
//     databaseName={DATABASE_NAME}
//     onInit={async (db) => {
//       await initDb(db);
//       await seedDb(db);
//     }}
//   >
//     <App />
//   </SQLiteProvider>
//
// ข้อควรรู้:
// - ห้ามเรียก openDatabaseAsync เองในหน้าจอ ให้ SQLiteProvider จัดการที่เดียว (ตามข้อกำหนด §4)
// - ทุกคำสั่งที่รับค่าจากผู้ใช้ ต้องส่งผ่าน ? เท่านั้น ห้ามต่อสตริง SQL เอง
// - ราคาเก็บเป็น INTEGER หน่วยสตางค์เสมอ (ห้ามใช้ REAL)  ดำดำ
 
export const DATABASE_NAME = 'restaurant_order_v6.db';
 
// ---------------------------------------------------------------------------
// 1) สร้างตาราง + index ทั้งหมด (รันครั้งเดียวตอนแอปเปิด — IF NOT EXISTS กันการสร้างซ้ำ)
// ---------------------------------------------------------------------------
export async function initDb(db) {
  await db.execAsync(`PRAGMA foreign_keys = ON;`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      category_id  INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS menu_items (
      item_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id   INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
      name          TEXT NOT NULL,
      price_satang  INTEGER NOT NULL CHECK (price_satang > 0),
      is_available  INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1))
    );
  `);
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS menu_options (
      option_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id             INTEGER NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
      name                TEXT NOT NULL,
      price_delta_satang  INTEGER NOT NULL DEFAULT 0,
      group_name          TEXT NOT NULL DEFAULT 'เพิ่มเติม',
      selection_type      TEXT NOT NULL DEFAULT 'multiple' CHECK (selection_type IN ('single', 'multiple')),
      is_available        INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      table_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number  INTEGER NOT NULL UNIQUE,
      seats         INTEGER NOT NULL DEFAULT 4 CHECK (seats > 0)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bills (
      bill_id                INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id               INTEGER NOT NULL REFERENCES restaurant_tables(table_id) ON DELETE RESTRICT,
      opened_at              TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at              TEXT,
      status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      discount_satang        INTEGER NOT NULL DEFAULT 0,
      tax_satang             INTEGER NOT NULL DEFAULT 0,
      service_charge_satang  INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS order_rounds (
      round_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id       INTEGER NOT NULL REFERENCES bills(bill_id) ON DELETE CASCADE,
      round_number  INTEGER NOT NULL CHECK (round_number > 0),
      ordered_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (bill_id, round_number)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS order_items (
      order_item_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id          INTEGER NOT NULL REFERENCES order_rounds(round_id) ON DELETE CASCADE,
      item_id           INTEGER NOT NULL REFERENCES menu_items(item_id) ON DELETE RESTRICT,
      unit_price_satang INTEGER NOT NULL CHECK (unit_price_satang > 0),
      quantity          INTEGER NOT NULL CHECK (quantity > 0),
      note              TEXT,
      status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'cooking', 'served', 'cancelled')),
      cancelled_at      TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS order_item_options (
      order_item_option_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id              INTEGER NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
      option_id                  INTEGER NOT NULL REFERENCES menu_options(option_id) ON DELETE RESTRICT,
      option_name_snapshot       TEXT NOT NULL,
      price_delta_satang_snapshot INTEGER NOT NULL
    );
  `);

  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category_id);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_bills_table_status ON bills (table_id, status);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_order_rounds_bill ON order_rounds (bill_id);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_order_items_round ON order_items (round_id);`);
}
 
// ---------------------------------------------------------------------------
// 2) ข้อมูลตั้งต้น — แก้ชื่อ/ราคา/จำนวนโต๊ะได้ตามร้านจริงของกลุ่ม
// ---------------------------------------------------------------------------
 
// ราคาทุกตัวเป็น "สตางค์" (บาท x 100) ตามข้อห้ามใช้ REAL ของโจทย์
const CATEGORY_SEED = ['ของคาว', 'ทานเล่น', 'ของหวาน', 'เครื่องดื่ม'];
 
const MENU_ITEM_SEED = [
  // ของคาว (8 รายการ)
  { category: 'ของคาว', name: 'กะเพราหมูสับ', priceSatang: 6000 },
  { category: 'ของคาว', name: 'กะเพราไก่', priceSatang: 6000 },
  { category: 'ของคาว', name: 'ผัดไทยกุ้งสด', priceSatang: 6500 },
  { category: 'ของคาว', name: 'ข้าวผัดปู', priceSatang: 8000 },
  { category: 'ของคาว', name: 'แกงเขียวหวานไก่', priceSatang: 6500 },
  { category: 'ของคาว', name: 'ต้มยำกุ้งน้ำข้น', priceSatang: 9000 },
  { category: 'ของคาว', name: 'ข้าวมันไก่', priceSatang: 5500 },
  { category: 'ของคาว', name: 'ผัดซีอิ๊วหมู', priceSatang: 5500 },
  
  
 
  // ทานเล่น (6 รายการ)
  { category: 'ทานเล่น', name: 'ปอเปี๊ยะทอด', priceSatang: 4000 },
  { category: 'ทานเล่น', name: 'ไก่ทอดหาดใหญ่', priceSatang: 5500 },
  { category: 'ทานเล่น', name: 'เกี๊ยวซ่าหมู', priceSatang: 5000 },
  { category: 'ทานเล่น', name: 'ส้มตำไทย', priceSatang: 4500 },
  { category: 'ทานเล่น', name: 'ไข่เจียวหมูสับ', priceSatang: 4000 },
  { category: 'ทานเล่น', name: 'ปีกไก่ทอดน้ำปลา', priceSatang: 6000 },
 
  // ของหวาน (6 รายการ)
  { category: 'ของหวาน', name: 'ข้าวเหนียวมะม่วง', priceSatang: 7000 },
  { category: 'ของหวาน', name: 'บัวลอยไข่หวาน', priceSatang: 3500 },
  { category: 'ของหวาน', name: 'ทับทิมกรอบ', priceSatang: 3500 },
  { category: 'ของหวาน', name: 'ไอศกรีมกะทิ', priceSatang: 4000 },
  { category: 'ของหวาน', name: 'กล้วยบวชชี', priceSatang: 3000 },
  { category: 'ของหวาน', name: 'เฉาก๊วยนมสด', priceSatang: 3500 },
 
  // เครื่องดื่ม (6 รายการ)
  { category: 'เครื่องดื่ม', name: 'น้ำเปล่า', priceSatang: 1500 },
  { category: 'เครื่องดื่ม', name: 'ชาไทยเย็น', priceSatang: 3000 },
  { category: 'เครื่องดื่ม', name: 'น้ำมะนาวโซดา', priceSatang: 3500 },
  { category: 'เครื่องดื่ม', name: 'กาแฟเย็น', priceSatang: 3500 },
  { category: 'เครื่องดื่ม', name: 'น้ำอัดลม', priceSatang: 2000 },
  { category: 'เครื่องดื่ม', name: 'น้ำส้มคั้นสด', priceSatang: 4000 },
];
// รวม 26 รายการ / 4 หมวดหมู่ — ผ่านเกณฑ์ ≥4 หมวด หมวดละ ≥5 รวม ≥25 ของโจทย์ §2.1 ข้อ ก2
 
const MENU_OPTION_SEED = [
  // กะเพราหมูสับ 
  { itemName: 'กะเพราหมูสับ', name: 'ธรรมดา', priceDeltaSatang: 0, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'กะเพราหมูสับ', name: 'พิเศษ', priceDeltaSatang: 2000, groupName: 'ขนาด', selectionType: 'single' },
  // เพิ่มเติม
  { itemName: 'กะเพราหมูสับ', name: 'ไข่ดาว', priceDeltaSatang: 1000 },
  { itemName: 'กะเพราหมูสับ', name: 'ไข่เจียว', priceDeltaSatang: 1000 },
  

  { itemName: 'กะเพราไก่', name: 'ธรรมดา', priceDeltaSatang: 0, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'กะเพราไก่', name: 'พิเศษ', priceDeltaSatang: 2000, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'กะเพราไก่', name: 'ไข่ดาว', priceDeltaSatang: 1000 },
  { itemName: 'กะเพราไก่', name: 'ไข่เจียว', priceDeltaSatang: 1000 },
  
  
  { itemName: 'ข้าวผัดปู', name: 'ธรรมดา', priceDeltaSatang: 0, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'ข้าวผัดปู', name: 'พิเศษ', priceDeltaSatang: 2000, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'ข้าวผัดปู', name: 'เพิ่มปู', priceDeltaSatang: 1000 },
  
  { itemName: 'ข้าวมันไก่', name: 'ธรรมดา', priceDeltaSatang: 0, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'ข้าวมันไก่', name: 'พิเศษ', priceDeltaSatang: 2000, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'ข้าวมันไก่', name: 'เพิ่มไก่', priceDeltaSatang: 2000 },
 
  { itemName: 'ผัดไทยกุ้งสด', name: 'ธรรมดา', priceDeltaSatang: 0, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'ผัดไทยกุ้งสด', name: 'พิเศษ', priceDeltaSatang: 2000, groupName: 'ขนาด', selectionType: 'single' },

  { itemName: 'ผัดซีอิ๊วหมู', name: 'ธรรมดา', priceDeltaSatang: 0, groupName: 'ขนาด', selectionType: 'single' },
  { itemName: 'ผัดซีอิ๊วหมู', name: 'พิเศษ', priceDeltaSatang: 2000, groupName: 'ขนาด', selectionType: 'single' },
  
  { itemName: 'ชาไทยเย็น', name: 'หวานน้อย', priceDeltaSatang: 0 },
  { itemName: 'ชาไทยเย็น', name: 'ไม่ใส่น้ำแข็ง', priceDeltaSatang: 0 },
];
 
// ตามสถานการณ์ในโจทย์ §1: ร้านมี 15 โต๊ะ — จำนวนที่นั่งกำหนดเองต่อโต๊ะ (โต๊ะเล็ก/กลาง/ใหญ่ปนกัน)
const TABLE_SEED = [
  { number: 1, seats: 2 },
  { number: 2, seats: 2 },
  { number: 3, seats: 4 },
  { number: 4, seats: 4 },
  { number: 5, seats: 4 },
  { number: 6, seats: 4 },
  { number: 7, seats: 2 },
  { number: 8, seats: 6 },
  { number: 9, seats: 2 },
  { number: 10, seats: 2 },
  { number: 11, seats: 4 },
  { number: 12, seats: 8 },
  { number: 13, seats: 4 },
  { number: 14, seats: 6 },
  { number: 15, seats: 2 },
];
 
// ---------------------------------------------------------------------------
// 3) ใส่ข้อมูลตั้งต้น — เช็คก่อนว่าเคยใส่ไปแล้วหรือยัง กันการใส่ซ้ำตอนเปิดแอปรอบถัดไป
// ---------------------------------------------------------------------------
export async function seedDb(db) {
  const row = await db.getFirstAsync('SELECT COUNT(*) AS count FROM categories');
  if (row?.count > 0) {
    return; // มีข้อมูลอยู่แล้ว ไม่ต้องใส่ซ้ำ
  }
 
  await db.withTransactionAsync(async () => {
    // categories --------------------------------------------------------
    const categoryIdByName = {};
    for (const name of CATEGORY_SEED) {
      const result = await db.runAsync('INSERT INTO categories (name) VALUES (?)', [name]);
      categoryIdByName[name] = result.lastInsertRowId;
    }
 
    // menu_items ----------------------------------------------------------
    const itemIdByName = {};
    for (const item of MENU_ITEM_SEED) {
      const categoryId = categoryIdByName[item.category];
      if (!categoryId) {
        throw new Error(
          `MENU_ITEM_SEED: ไม่พบหมวดหมู่ "${item.category}" ใน CATEGORY_SEED (สะกดผิดหรือยัง?) — เมนู "${item.name}" จะ insert ไม่ได้`
        );
      }
      const result = await db.runAsync(
        'INSERT INTO menu_items (category_id, name, price_satang) VALUES (?, ?, ?)',
        [categoryId, item.name, item.priceSatang]
      );
      itemIdByName[item.name] = result.lastInsertRowId;
    }
 
    // menu_options --------------------------------------------------------
    for (const opt of MENU_OPTION_SEED) {
      const itemId = itemIdByName[opt.itemName];
      if (!itemId) {
        throw new Error(
          `MENU_OPTION_SEED: ไม่พบเมนูชื่อ "${opt.itemName}" ใน MENU_ITEM_SEED (สะกดผิดหรือยัง?) — ตัวเลือก "${opt.name}" จะ insert ไม่ได้`
        );
      }
      await db.runAsync(
        `INSERT INTO menu_options
           (item_id, name, price_delta_satang, group_name, selection_type, is_available)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          opt.name,
          opt.priceDeltaSatang,
          opt.groupName ?? 'เพิ่มเติม',
          opt.selectionType ?? 'multiple',
          opt.isAvailable === false ? 0 : 1,
        ]
      );
    }
 
    // restaurant_tables -----------------------------------------------------
    for (const table of TABLE_SEED) {
      await db.runAsync(
        'INSERT INTO restaurant_tables (table_number, seats) VALUES (?, ?)',
        [table.number, table.seats]
      );
    }
  });
}
 
// ---------------------------------------------------------------------------
// 4) ล้างข้อมูลการขายทั้งหมด (ปุ่ม "รีเซ็ต" ตามข้อกำหนด §4.1 ของโจทย์)
//    ลบแค่ bills พอ — order_rounds / order_items / order_item_options ถูกลบตาม
//    อัตโนมัติเพราะตั้ง ON DELETE CASCADE ไว้ทั้งสายแล้ว (ต้องเปิด PRAGMA foreign_keys
//    ไว้ก่อนถึงจะ cascade จริง ซึ่ง initDb() เปิดให้แล้วทุกครั้งที่เชื่อมต่อ)
//    เมนู/หมวดหมู่/โต๊ะ/ตัวเลือกเมนู "ไม่ถูกลบ" เพราะไม่ใช่ข้อมูลการขาย
// ---------------------------------------------------------------------------
export async function resetSalesData(db) {
  await db.runAsync('DELETE FROM bills');
}


export async function logAllData(db) {
  const categories = await db.getAllAsync('SELECT * FROM categories');
  const menuItems = await db.getAllAsync('SELECT * FROM menu_items');
  const tables = await db.getAllAsync('SELECT * FROM restaurant_tables');
  
  console.log('=== categories ===', JSON.stringify(categories, null, 2));
  console.log('=== menu_items ===', JSON.stringify(menuItems, null, 2));
  console.log('=== tables ===', JSON.stringify(tables, null, 2));
}


// mock data รอของภูริ data นัี้เกี่ยวกับข้อมูลพวกบิลที่เปิดกับโต้ะ
export async function seedMockBill(db) {
  const existing = await db.getFirstAsync('SELECT COUNT(*) AS count FROM bills');
  if (existing?.count > 0) return;

  await db.withTransactionAsync(async () => {
    const bill = await db.runAsync(
      `INSERT INTO bills (table_id, opened_at, status) VALUES (?, datetime('now'), 'open')`,
      [1]
    );
    const billId = bill.lastInsertRowId;

    // รอบที่ 1
    const round1 = await db.runAsync(
      `INSERT INTO order_rounds (bill_id, round_number, ordered_at) VALUES (?, 1, datetime('now'))`,
      [billId]
    );
    const round1Id = round1.lastInsertRowId;

    const item1 = await db.runAsync(
      `INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [round1Id, 1, 6000, 2, 'ธรรมดา', 'served']
    );
    await db.runAsync(
      `INSERT INTO order_item_options (order_item_id, option_id, option_name_snapshot, price_delta_satang_snapshot) VALUES (?, ?, ?, ?)`,
      [item1.lastInsertRowId, 1, 'ไข่ดาว', 1000]
    );
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round1Id, 3, 6500, 1, '', 'served']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round1Id, 4, 8000, 1, '', 'served']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round1Id, 7, 5500, 2, '', 'served']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round1Id, 17, 3500, 2, '', 'served']);

    // รอบที่ 2
    const round2 = await db.runAsync(
      `INSERT INTO order_rounds (bill_id, round_number, ordered_at) VALUES (?, 2, datetime('now'))`,
      [billId]
    );
    const round2Id = round2.lastInsertRowId;

    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round2Id, 10, 5500, 3, 'หวานน้อย', 'cooking']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round2Id, 23, 3000, 2, '', 'pending']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round2Id, 6, 9000, 1, 'เผ็ดน้อย', 'cooking']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round2Id, 11, 5500, 2, '', 'pending']);
    await db.runAsync(`INSERT INTO order_items (round_id, item_id, unit_price_satang, quantity, note, status) VALUES (?, ?, ?, ?, ?, ?)`, [round2Id, 25, 2000, 4, '', 'pending']);
  });
}
export async function getBillWithRounds(db, billId) {
  const bill = await db.getFirstAsync(`
    SELECT b.*, t.table_number
    FROM bills b
    JOIN restaurant_tables t ON t.table_id = b.table_id
    WHERE b.bill_id = ?
  `, [billId]);

  if (!bill) return null;

  const rounds = await db.getAllAsync(`
    SELECT round_id, round_number, ordered_at
    FROM order_rounds
    WHERE bill_id = ?
    ORDER BY round_number
  `, [billId]);

  for (const round of rounds) {
    round.items = await db.getAllAsync(`
      SELECT 
        i.order_item_id,
        i.unit_price_satang,
        i.quantity,
        i.note,
        i.status,
        m.name
      FROM order_items i
      JOIN menu_items m ON m.item_id = i.item_id
      WHERE i.round_id = ?
      ORDER BY i.order_item_id
    `, [round.round_id]);

    for (const item of round.items) {
      item.options = await db.getAllAsync(`
        SELECT option_name_snapshot, price_delta_satang_snapshot
        FROM order_item_options
        WHERE order_item_id = ?
      `, [item.order_item_id]);
    }
  }

  return { ...bill, rounds };
}
