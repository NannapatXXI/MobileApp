-- =============================================================================
-- schema.sql — ฐานข้อมูลแอปสั่งอาหารในร้าน "ครัว 4 สหาย"
-- รวม CREATE TABLE ทุกตาราง + CREATE INDEX + ข้อมูลตั้งต้นของเมนูและโต๊ะ
--
-- ตรงกับโค้ดในแอป: src/db/db.js (initDb + seedDb)
-- รันได้ใน SQLite (เช่น DB Browser for SQLite, sqlite3, DBeaver)
--
-- หลักการสำคัญ
--   - ราคาทุกคอลัมน์เก็บเป็น INTEGER หน่วย "สตางค์" (บาท x 100) ไม่ใช้ REAL
--   - เวลาเก็บเป็น TEXT รูปแบบ UTC 'YYYY-MM-DD HH:MM:SS' จาก datetime('now')
--   - ราคาตอนสั่งถูก "บันทึกค่าไว้" (snapshot) ใน order_items / order_item_options
--     แก้ราคาเมนูทีหลัง บิลเก่าจึงไม่เปลี่ยน
--
-- ไฟล์นี้รันซ้ำได้: ลบตารางเดิมทิ้งก่อน (DROP TABLE IF EXISTS) แล้วสร้างใหม่
-- =============================================================================

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ลบตารางเดิม (ลูกก่อน แม่ทีหลัง ไม่งั้น FOREIGN KEY จะไม่ยอมให้ลบ)
DROP TABLE IF EXISTS order_item_options;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS order_rounds;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS restaurant_tables;
DROP TABLE IF EXISTS menu_options;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;

-- =============================================================================
-- 1) ตาราง
-- =============================================================================

-- หมวดหมู่อาหาร
CREATE TABLE categories (
  category_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL
);

-- เมนูอาหาร
-- ON DELETE RESTRICT: ลบหมวดที่ยังมีเมนูอยู่ไม่ได้ (กันเมนูไม่มีหมวด)
CREATE TABLE menu_items (
  item_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  price_satang  INTEGER NOT NULL CHECK (price_satang > 0),
  is_available  INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1))
);

-- ตัวเลือกย่อยของเมนู (มีผลต่อราคา) เช่น ขนาดพิเศษ, ไข่ดาว
-- selection_type: 'single' = เลือกได้ 1 อย่าง (เช่น ขนาด), 'multiple' = เลือกได้หลายอย่าง
-- ON DELETE CASCADE: ลบเมนูแล้วตัวเลือกของเมนูนั้นหายตามไปด้วย
CREATE TABLE menu_options (
  option_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id             INTEGER NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  price_delta_satang  INTEGER NOT NULL DEFAULT 0,
  group_name          TEXT NOT NULL DEFAULT 'เพิ่มเติม',
  selection_type      TEXT NOT NULL DEFAULT 'multiple' CHECK (selection_type IN ('single', 'multiple')),
  is_available        INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1))
);

-- โต๊ะในร้าน
CREATE TABLE restaurant_tables (
  table_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number  INTEGER NOT NULL UNIQUE,
  seats         INTEGER NOT NULL DEFAULT 4 CHECK (seats > 0)
);

-- บิล (1 โต๊ะเปิดได้หลายบิลตามเวลา แต่เปิดค้างได้ทีละบิล)
-- ON DELETE RESTRICT: ลบโต๊ะที่มีประวัติบิลไม่ได้ (กันบิลเก่าหาย)
CREATE TABLE bills (
  bill_id                INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id               INTEGER NOT NULL REFERENCES restaurant_tables(table_id) ON DELETE RESTRICT,
  opened_at              TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at              TEXT,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  discount_satang        INTEGER NOT NULL DEFAULT 0,
  tax_satang             INTEGER NOT NULL DEFAULT 0,
  service_charge_satang  INTEGER NOT NULL DEFAULT 0
);

-- รอบการสั่ง (1 บิลสั่งได้หลายรอบ)
-- ON DELETE CASCADE: ลบบิลแล้วรอบของบิลนั้นหายตาม (ใช้ตอน "ล้างข้อมูลการขาย")
-- UNIQUE (bill_id, round_number): บิลเดียวกันมีรอบเลขซ้ำไม่ได้
CREATE TABLE order_rounds (
  round_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id       INTEGER NOT NULL REFERENCES bills(bill_id) ON DELETE CASCADE,
  round_number  INTEGER NOT NULL CHECK (round_number > 0),
  ordered_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (bill_id, round_number)
);

-- รายการที่สั่งในแต่ละรอบ
-- unit_price_satang = ราคาต่อหน่วยตอนสั่ง (รวมตัวเลือกแล้ว) — snapshot ไม่อ่านจาก menu_items
-- ON DELETE CASCADE (round_id): ลบรอบแล้วรายการหายตาม
-- ON DELETE RESTRICT (item_id): ลบเมนูที่เคยถูกสั่งไม่ได้ (กันบิลเก่าชี้ไปหาเมนูที่ไม่มี)
CREATE TABLE order_items (
  order_item_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id          INTEGER NOT NULL REFERENCES order_rounds(round_id) ON DELETE CASCADE,
  item_id           INTEGER NOT NULL REFERENCES menu_items(item_id) ON DELETE RESTRICT,
  unit_price_satang INTEGER NOT NULL CHECK (unit_price_satang > 0),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'cooking', 'served', 'cancelled')),
  started_at        TEXT,
  served_at         TEXT,
  cancelled_at      TEXT,
  cancel_reason     TEXT
);

-- ตัวเลือกที่ลูกค้าเลือกในแต่ละรายการ — เก็บชื่อและราคาตอนสั่งไว้ (snapshot)
-- ON DELETE CASCADE (order_item_id): ลบรายการแล้วตัวเลือกหายตาม
-- ON DELETE RESTRICT (option_id): ลบตัวเลือกเมนูที่เคยถูกสั่งไม่ได้
CREATE TABLE order_item_options (
  order_item_option_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id               INTEGER NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
  option_id                   INTEGER NOT NULL REFERENCES menu_options(option_id) ON DELETE RESTRICT,
  option_name_snapshot        TEXT NOT NULL,
  price_delta_satang_snapshot INTEGER NOT NULL
);

-- =============================================================================
-- 2) INDEX — บนคอลัมน์ที่ค้นหาบ่อย
-- =============================================================================

-- หน้าเมนู: ดึงเมนูของหมวดที่เลือก (WHERE category_id = ?)
CREATE INDEX idx_menu_items_category ON menu_items (category_id);

-- หน้าเลือกโต๊ะ / ปิดบิล: หาบิลที่เปิดอยู่ของแต่ละโต๊ะ (table_id + status = 'open')
CREATE INDEX idx_bills_table_status ON bills (table_id, status);

-- สรุปบิล / ยอดรวม: ดึงทุกรอบของบิล (WHERE bill_id = ?)
CREATE INDEX idx_order_rounds_bill ON order_rounds (bill_id);

-- สรุปบิล / คิวครัว: ดึงทุกรายการของรอบ (WHERE round_id = ?)
CREATE INDEX idx_order_items_round ON order_items (round_id);

-- คิวครัว: หารายการที่ยังรอทำ/กำลังทำ (WHERE status IN ('pending', 'cooking'))
CREATE INDEX idx_order_items_status ON order_items (status);

-- =============================================================================
-- 3) ข้อมูลตั้งต้น
-- ระบุ id ตรง ๆ เพื่อให้ตัวเลือกเมนูอ้างถึงเมนูได้ถูกตัว (ตรงกับลำดับที่แอป insert)
-- =============================================================================

-- หมวดหมู่ 4 หมวด
INSERT INTO categories (category_id, name) VALUES
  (1, 'ของคาว'),
  (2, 'ทานเล่น'),
  (3, 'ของหวาน'),
  (4, 'เครื่องดื่ม');

-- เมนู 26 รายการ (ของคาว 8 / ทานเล่น 6 / ของหวาน 6 / เครื่องดื่ม 6)
INSERT INTO menu_items (item_id, category_id, name, price_satang) VALUES
  -- ของคาว
  (1,  1, 'กะเพราหมูสับ',     6000),
  (2,  1, 'กะเพราไก่',        6000),
  (3,  1, 'ผัดไทยกุ้งสด',     6500),
  (4,  1, 'ข้าวผัดปู',         8000),
  (5,  1, 'แกงเขียวหวานไก่',  6500),
  (6,  1, 'ต้มยำกุ้งน้ำข้น',   9000),
  (7,  1, 'ข้าวมันไก่',        5500),
  (8,  1, 'ผัดซีอิ๊วหมู',      5500),
  -- ทานเล่น
  (9,  2, 'ปอเปี๊ยะทอด',      4000),
  (10, 2, 'ไก่ทอดหาดใหญ่',    5500),
  (11, 2, 'เกี๊ยวซ่าหมู',      5000),
  (12, 2, 'ส้มตำไทย',         4500),
  (13, 2, 'ไข่เจียวหมูสับ',    4000),
  (14, 2, 'ปีกไก่ทอดน้ำปลา',  6000),
  -- ของหวาน
  (15, 3, 'ข้าวเหนียวมะม่วง', 7000),
  (16, 3, 'บัวลอยไข่หวาน',    3500),
  (17, 3, 'ทับทิมกรอบ',       3500),
  (18, 3, 'ไอศกรีมกะทิ',      4000),
  (19, 3, 'กล้วยบวชชี',       3000),
  (20, 3, 'เฉาก๊วยนมสด',      3500),
  -- เครื่องดื่ม
  (21, 4, 'น้ำเปล่า',          1500),
  (22, 4, 'ชาไทยเย็น',        3000),
  (23, 4, 'น้ำมะนาวโซดา',     3500),
  (24, 4, 'กาแฟเย็น',         3500),
  (25, 4, 'น้ำอัดลม',          2000),
  (26, 4, 'น้ำส้มคั้นสด',      4000);

-- ตัวเลือกย่อยของเมนู
INSERT INTO menu_options (option_id, item_id, name, price_delta_satang, group_name, selection_type) VALUES
  -- กะเพราหมูสับ (item 1)
  (1,  1,  'ธรรมดา',        0,    'ขนาด',     'single'),
  (2,  1,  'พิเศษ',         2000, 'ขนาด',     'single'),
  (3,  1,  'ไข่ดาว',        1000, 'เพิ่มเติม', 'multiple'),
  (4,  1,  'ไข่เจียว',      1000, 'เพิ่มเติม', 'multiple'),
  -- กะเพราไก่ (item 2)
  (5,  2,  'ธรรมดา',        0,    'ขนาด',     'single'),
  (6,  2,  'พิเศษ',         2000, 'ขนาด',     'single'),
  (7,  2,  'ไข่ดาว',        1000, 'เพิ่มเติม', 'multiple'),
  (8,  2,  'ไข่เจียว',      1000, 'เพิ่มเติม', 'multiple'),
  -- ข้าวผัดปู (item 4)
  (9,  4,  'ธรรมดา',        0,    'ขนาด',     'single'),
  (10, 4,  'พิเศษ',         2000, 'ขนาด',     'single'),
  (11, 4,  'เพิ่มปู',        1000, 'เพิ่มเติม', 'multiple'),
  -- ข้าวมันไก่ (item 7)
  (12, 7,  'ธรรมดา',        0,    'ขนาด',     'single'),
  (13, 7,  'พิเศษ',         2000, 'ขนาด',     'single'),
  (14, 7,  'เพิ่มไก่',       2000, 'เพิ่มเติม', 'multiple'),
  -- ผัดไทยกุ้งสด (item 3)
  (15, 3,  'ธรรมดา',        0,    'ขนาด',     'single'),
  (16, 3,  'พิเศษ',         2000, 'ขนาด',     'single'),
  -- ผัดซีอิ๊วหมู (item 8)
  (17, 8,  'ธรรมดา',        0,    'ขนาด',     'single'),
  (18, 8,  'พิเศษ',         2000, 'ขนาด',     'single'),
  -- ชาไทยเย็น (item 22)
  (19, 22, 'หวานน้อย',      0,    'เพิ่มเติม', 'multiple'),
  (20, 22, 'ไม่ใส่น้ำแข็ง',  0,    'เพิ่มเติม', 'multiple');

-- โต๊ะ 15 โต๊ะ
INSERT INTO restaurant_tables (table_id, table_number, seats) VALUES
  (1,  1,  2),
  (2,  2,  2),
  (3,  3,  4),
  (4,  4,  4),
  (5,  5,  4),
  (6,  6,  4),
  (7,  7,  2),
  (8,  8,  6),
  (9,  9,  2),
  (10, 10, 2),
  (11, 11, 4),
  (12, 12, 8),
  (13, 13, 4),
  (14, 14, 6),
  (15, 15, 2);

COMMIT;

-- =============================================================================
-- (ไม่บังคับ) ตัวอย่างเช็คว่าดัชนีถูกใช้จริง — เอาเครื่องหมาย -- ออกแล้วรันทีละบรรทัด
-- ผลที่ควรเห็น: "SEARCH ... USING INDEX idx_..."
-- =============================================================================
-- EXPLAIN QUERY PLAN SELECT * FROM menu_items WHERE category_id = 1;
-- EXPLAIN QUERY PLAN SELECT * FROM bills WHERE table_id = 3 AND status = 'open';
-- EXPLAIN QUERY PLAN SELECT * FROM order_rounds WHERE bill_id = 1;
-- EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE round_id = 1;
-- EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE status IN ('pending', 'cooking');
