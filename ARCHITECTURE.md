# ARCHITECTURE.md — คู่มือโค้ดสำหรับทีม

## ภาพรวม flow ของแอป (ฝั่งลูกค้า → ฝั่งครัว)

```
Select_Table.js  →  Menu_Screen.js  →  Item_Detail_Screen.js (modal)
                          ↓                      ↓
                          └────── CartContext ───┘
                          ↓
                   Review_Screen.js  →  กด "ส่งเข้าครัว" → PreSendToKitchen.js
                                                   ↓ (เขียนลง DB)
                          OrderKitScreen.js  →  RoundStatusScreen.js  →  CancelItemScreen.js
                                   ↑────────────── อ่าน order_rounds / order_items ชุดเดียวกัน
```

- **`CartContext`** คือ "ตะกร้าของรอบที่กำลังสั่ง" เก็บอยู่ที่เดียว ทุกหน้าจออ่าน/แก้ผ่าน `useCart()` — ยังไม่มีอะไรลง DB จนกว่าจะกด "ส่งเข้าครัว"
- ทุก query ที่คุยกับ SQLite แยกไว้ในโฟลเดอร์ `src/db/` (ตามข้อกำหนดโจทย์ §4 ห้ามหน้าจอเขียน SQL เอง)
- **ฝั่งครัวไม่มีตารางของตัวเอง** ครัวอ่าน/เขียน `order_rounds` + `order_items` ชุดเดียวกับที่ลูกค้าสั่งไว้ สถานะที่ครัวเปลี่ยนจึงกลับไปโชว์ฝั่งลูกค้า (`PreSendToKitchen` / `DetailScreen`) ทันที
- ทุกเวลาที่บันทึกลง DB มาจาก `datetime('now')` ของ SQLite (UTC) เสมอ และเวลาปัจจุบัน (Now Date) บนหน้าจอใช้ `src/utils/time.js` ที่แปลงเป็นเวลาไทย (UTC+7) ไม่พึ่ง timezone ของเครื่อง

---

## `App.js` (root)

จุดเริ่มต้นของแอป ทำ 3 อย่าง:
1. เปิด SQLite ด้วย `SQLiteProvider` (ที่เดียวในทั้งแอป) — `onInit` เรียก `initDb` (สร้างตาราง) แล้ว `seedDb` (ใส่ข้อมูลตั้งต้น)
   - `onInit` ต้องเป็นฟังก์ชันที่ประกาศไว้**นอก component** (ชื่อ `initDatabase`) — `SQLiteProvider` ใช้ค่า `onInit` เป็น dependency ของ `useEffect` ถ้าส่ง arrow function ที่สร้างใหม่ทุก render provider จะปิด/เปิด DB และรัน `initDb`+`seedDb` ซ้ำทุกครั้งที่ `App` re-render
2. ครอบด้วย `CartProvider` ให้ทุกหน้าจอเข้าถึงตะกร้าเดียวกันได้
3. ตั้ง `Stack.Navigator` ลงทะเบียนทุกหน้าจอ — ฝั่งลูกค้า (`SelectTable`, `MenuScreen`, `ReviewScreen`, `ItemDetailScreen`) / ฝั่งออเดอร์ (`SendToKitchen`, `Detail`, `Bill`) / ฝั่งครัว (`OrderKitScreen`, `RoundStatusScreen`, `CancelItemScreen`)

เข้าหน้าครัวได้จากปุ่ม **"เปิดหน้าครัว"** ที่แผงซ้ายของ `Select_Table.js` (พนักงานเปิดจากเครื่องเดียวกัน)

---

## `src/db/` — query ทั้งหมด (ห้ามหน้าจอเขียน SQL เอง)

```
src/db/
├── db.js                    ← schema + ข้อมูลตั้งต้น + รีเซ็ต (setup ทั้งระบบ)
├── queries_customer/        ← query ที่หน้าจอฝั่งลูกค้าเรียกใช้ตอนแอปทำงานจริง (แยกตาม entity)
│   ├── tables.js
│   ├── menu.js
│   └── orders.js
└── queries_kitchen/
    └── queue.js            ← query ฝั่งครัว (คิวครัว / เปลี่ยนสถานะ / ยกเลิก / ประวัติ)
```

เหตุผลที่แยก: `db.js` ทำงาน "ครั้งเดียวตอนตั้งค่าระบบ" (schema+seed+reset) ส่วนไฟล์ใน `queries_customer/` ถูกเรียกซ้ำๆ ตลอดตอนผู้ใช้ใช้งานแอป (ตั้งชื่อว่า `_customer` เผื่อภายหลังมี `queries_kitchen/` แยกสำหรับฝั่งครัว — ตอนนี้มีแล้ว)

### `db.js` — schema + ข้อมูลตั้งต้น + รีเซ็ต

| export | หน้าที่ |
|---|---|
| `DATABASE_NAME` | ชื่อไฟล์ DB (เปลี่ยนเลข version ท้ายชื่อทุกครั้งที่แก้ schema/seed เพื่อบังคับสร้างไฟล์ใหม่ตอนทดสอบ) |
| `initDb(db)` | รัน `CREATE TABLE IF NOT EXISTS` ทั้ง 8 ตาราง + `CREATE INDEX` + `ensureColumns()` — เรียกครั้งเดียวตอนแอปเปิด |
| `ensureColumns(db, table, columns)` | เช็ค `PRAGMA table_info` แล้ว `ALTER TABLE ... ADD COLUMN` เฉพาะคอลัมน์ที่ยังไม่มี — กันเคสไฟล์ DB จากบิลด์เก่าที่ยังไม่มีคอลัมน์ใหม่ (`CREATE TABLE IF NOT EXISTS` ไม่เติมคอลัมน์ให้ไฟล์เดิม) ชื่อตาราง/คอลัมน์มาจากค่าคงที่ในโค้ด ไม่ใช่จากผู้ใช้ |
| `seedDb(db)` | ใส่หมวดหมู่/เมนู/ตัวเลือก/โต๊ะตั้งต้น เช็คก่อนว่ามีข้อมูลแล้วหรือยังกันใส่ซ้ำ — มี guard ถ้าสะกด `category`/`itemName` ผิดจะ throw error บอกชัดเจน |
| `resetSalesData(db)` | ลบ `bills` ทั้งหมด (ตารางลูกอย่าง `order_rounds`/`order_items` หายตามเพราะ `ON DELETE CASCADE`) — ผูกกับปุ่ม "ล้างข้อมูลการขาย" ใน `Select_Table.js` แล้ว |
| `getBillWithRounds(db, billId)` | บิล 1 ใบ + รอบทั้งหมด + รายการ/ตัวเลือกของแต่ละรอบ (ใช้ฝั่งออเดอร์: `PreSendToKitchen` / `DetailScreen` / `ExportBillScreen`) |

ตัวแปร seed ข้างในไฟล์ (แก้ตรงนี้ถ้าจะเปลี่ยนเมนู/ราคา/โต๊ะ): `CATEGORY_SEED`, `MENU_ITEM_SEED`, `MENU_OPTION_SEED`, `TABLE_SEED`

### `queries_customer/tables.js` — โต๊ะ + สถานะบิล

| export | รับ | คืนค่า/ทำอะไร |
|---|---|---|
| `getTablesWithStatus(db)` | - | โต๊ะทั้งหมด + บิลที่เปิดอยู่ (ถ้ามี) + จำนวนรอบ + ยอดรวม ต่อโต๊ะ (`LEFT JOIN`) |
| `openNewBill(db, tableId)` | table id | `INSERT` บิลใหม่ คืน `bill_id` ที่สร้าง |

### `queries_customer/menu.js` — หมวดหมู่ + เมนู

| export | รับ | คืนค่า/ทำอะไร |
|---|---|---|
| `getCategoriesWithCounts(db)` | - | หมวดหมู่ทั้งหมด + จำนวนเมนูในแต่ละหมวด |
| `getMenuItems(db, { categoryId, search, onlyAvailable })` | หมวด/คำค้น/toggle | เมนูที่กรองแล้วของหมวดนั้น |
| `getMenuItemDetail(db, itemId)` | item id | `{ item, options }` — เมนู 1 รายการ + ตัวเลือกย่อยทั้งหมด (แยกกลุ่ม `ขนาด`/`เพิ่มเติม` ด้วย `group_name`/`selection_type`) |

### `queries_customer/orders.js` — รอบการสั่ง + รายการที่สั่ง

| export | รับ | คืนค่า/ทำอะไร |
|---|---|---|
| `getKitchenQueueCount(db)` | - | จำนวน "จาน" ที่ยังไม่เสิร์ฟทั้งระบบ (`SUM(quantity)` ของ `order_items` ที่ `pending`/`cooking` — นับตามปริมาณจริง ไม่ใช่นับจำนวนแถว) |
| `getBillRoundCount(db, billId)` | bill id | จำนวนรอบที่ส่งครัวไปแล้วของบิลนั้น (ใช้แค่โชว์ผล ไม่ใช้คำนวณ round_number จริงแล้ว) |
| `getPreviousRoundsSummary(db, billId)` | bill id | รายการ `[{round_number, total_satang}]` ของรอบก่อนหน้าที่ส่งไปแล้ว (คำนวณด้วย SQL `SUM`) |
| `submitOrderRound(db, { billId, cart })` | bill id + ตะกร้า | **ทรานแซกชันเดียว**: คำนวณ `round_number` ถัดไปเองจาก DB → insert `order_rounds` → insert `order_items` ทีละรายการ → insert `order_item_options` ของแต่ละรายการ คืนค่า `round_number` ที่ insert ไปจริง |

### `queries_kitchen/queue.js` — คิวครัว + สถานะการทำ

อ่าน/เขียน `order_rounds` + `order_items` ชุดเดียวกับฝั่งลูกค้า (ไม่มีตารางแยกของครัว) — ทุก `UPDATE` เขียนเวลาจาก `datetime('now')` ของ DB

| export | รับ | คืนค่า/ทำอะไร |
|---|---|---|
| `getKitchenQueue(db)` | - | ใบออร์เดอร์ที่ครัวต้องเห็น เรียงตาม `ordered_at` **ใหม่ → เก่า** (ยังมีงานค้าง หรือสั่งภายในวันนี้ตามเวลาไทย) พร้อม `items` ที่ตัดรายการ `cancelled` ออกแล้ว |
| `getNextQueueRounds(db)` | - | ใบที่ยังไม่เริ่มทำเลย (ทุกรายการยัง `pending`) สำหรับแผง "คิวถัดไป" เรียง `ordered_at` ใหม่ → เก่าเหมือนกัน |
| `startRoundCooking(db, roundId)` | round id | ปุ่ม "เริ่มทำทั้งใบ" — `pending` → `cooking` พร้อมบันทึก `started_at` |
| `markRoundAsServed(db, roundId)` | round id | ปุ่ม "เสิร์ฟแล้วทั้งใบ" — `pending`/`cooking` → `served` พร้อมบันทึก `served_at` |
| `updateItemStatus(db, orderItemId, uiStatus)` | id + `waiting`/`cooking`/`served` | เปลี่ยนสถานะรายรายการ **เดินหน้าทางเดียว** `pending → cooking → served` — ย้อนกลับ/กดซ้ำ/แตะรายการที่ `cancelled` แล้วจะ `throw` |
| `cancelItem(db, orderItemId, reason)` | id + เหตุผล | ยกเลิกได้เฉพาะรายการที่ยัง `pending` — เขียน `cancelled_at` + `cancel_reason` (คืนจำนวนแถวที่แก้จริง) |
| `getCancelledItems(db)` | - | log การยกเลิกล่าสุด 100 รายการ `{ id, name, quantity, table_number, round_number, reason, cancelled_time_label }` |
| `getServedHistory(db)` | - | ใบที่เสิร์ฟครบทุกรายการแล้ว 50 ใบล่าสุด `{ round_id, table_number, round_number, item_count, served_time_label }` |

**mapping สถานะ DB ↔ จอครัว**: `pending` → `waiting`, `cooking` → `cooking`, `served` → `served`, `cancelled` → ไม่แสดงในคิว (ถูกตัดออกจากยอดบิลฝั่งลูกค้าแล้ว แต่ยังอยู่ใน log)

**รูปแบบ object ที่จอครัวใช้**
```js
// round
{ round_id, bill_id, bill_code, table_number, round_number,
  order_time /* ordered_at ดิบ */, order_time_label /* 'HH:MM' ไทย */, items }
// item
{ order_item_id, name, quantity, note, status /* waiting|cooking|served */,
  status_time /* 'HH:MM' ไทย หรือ '-' */, modifiers /* string[] */ }
```

---

## `src/utils/time.js` — เวลาไทยจากเวลาใน DB

เวลาที่ SQLite เก็บเป็น UTC เสมอ (`datetime('now')` → `'2026-09-20 07:54:02'`) ถ้าเอาไป `new Date()` ตรงๆ เวลาจะเพี้ยนตามโซนเวลาของเครื่อง — ไฟล์นี้เป็นที่เดียวที่แปลงเวลา โดยอ่านค่าผ่าน `getUTCxxx` เสมอ (ไทย = UTC+7 ไม่มี DST)

| export | รับ | คืนค่า |
|---|---|---|
| `parseSqliteTime(utcText)` | `'YYYY-MM-DD HH:MM:SS'` | epoch ms (เทียบกับ `Date.now()` ได้ตรงๆ) หรือ `null` |
| `formatNowHM(nowMs?)` / `formatNowHMS(nowMs?)` | Now Date (epoch ms) | `'HH:MM'` / `'HH:MM:SS'` ของเวลาไทย |
| `formatBangkokHM(utcText)` / `formatBangkokHMS(utcText)` | เวลาใน DB | `'HH:MM'` / `'HH:MM:SS'` ของเวลาไทย (ไม่มีค่า → `'-'`) |
| `formatBangkokDate(ms?)` | Now Date | วันที่ไทยแบบ พ.ศ. เช่น `จันทร์ 28 กันยายน 2569` |
| `getWaitMinutes(utcText, nowMs?)` | เวลาใน DB + Now Date | ผ่านไปกี่นาที (หน้าจอที่มีนาฬิกาต้องส่ง `now` เข้าไป เพื่อให้ทุกตัวเลขใช้ "ตอนนี้" เดียวกัน) |


---

## `src/context/CartContext.js` — ตะกร้ารอบปัจจุบัน

`CartProvider` ครอบทั้งแอปใน `App.js` เก็บ state เดียว `cart` (array) — แต่ละ entry มีรูปแบบ:
```js
{
  item_id, name, unit_price_satang, quantity, note,
  options: [{ option_id, name, price_delta_satang }]
}
```
`useCart()` คืนค่า `{ cart, addToCart, removeFromCart, updateQuantity, clearCart }` ให้หน้าจอไหนก็เรียกใช้ได้ ไม่ต้องส่งผ่าน navigation params

---

## หน้าจอ (`src/screens/customer/`)

### `Select_Table.js`

| ตัวแปร/state | คืออะไร |
|---|---|
| `tables` | ผลลัพธ์จาก `getTablesWithStatus` (โต๊ะ+สถานะบิล) |
| `selectedTableId` | โต๊ะที่แตะเลือกไว้ (ยังไม่กดยืนยัน) |
| `kitchenQueueCount` | จำนวนคิวครัวปัจจุบัน โชว์ในแผงซ้าย |
| `isTableBusy(t)` | ฟังก์ชัน — โต๊ะนับว่า "มีบิลค้าง" ก็ต่อเมื่อมีบิลเปิด **และ** สั่งไปแล้วอย่างน้อย 1 รอบ (บิลเปิดเปล่าๆ ไม่นับ) |
| `formatBangkokHM` / `getBangkokNow` / `formatThaiDate` | แปลงเวลา UTC จาก SQLite → เวลาไทย (+7 ชม.) ไม่พึ่ง timezone ของเครื่อง |

### `Menu_Screen.js`

| ตัวแปร/state | คืออะไร |
|---|---|
| `categories` / `selectedCategoryId` | รายการหมวดหมู่ฝั่งซ้าย + หมวดที่เลือกอยู่ |
| `searchText` / `onlyAvailable` | ค้นหา + toggle กรองของหมด |
| `menuItems` | เมนูของหมวดที่เลือก (กรองแล้ว) |
| `cart` (จาก `useCart()`) | ตะกร้ารอบนี้ |
| `roundCount` | จำนวนรอบที่ส่งไปแล้วของบิลนี้ (ใช้โชว์ "ตะกร้ารอบที่ N") |
| `roundTotal` | ยอดรวมตะกร้า **ปัจจุบัน** (คำนวณด้วย JS `.reduce()` ได้ เพราะยังไม่มีอยู่ใน DB) |

กด "+" ที่การ์ดเมนู → navigate ไป `ItemDetailScreen` (ไม่ได้เพิ่มลงตะกร้าตรงๆ)

### `Item_Detail_Screen.js` (modal — เลือกตัวเลือก/จำนวน/หมายเหตุ)

| ตัวแปร/state | คืออะไร |
|---|---|
| `item` / `options` | เมนู + ตัวเลือกทั้งหมดจาก `getMenuItemDetail` |
| `selectedSizeOptionId` | ตัวเลือกกลุ่ม "ขนาด" ที่เลือก (เลือกได้ 1) |
| `selectedAddonIds` | ตัวเลือกกลุ่ม "เพิ่มเติม" ที่เลือก (เลือกได้หลายอัน) |
| `note` / `quantity` | หมายเหตุถึงครัว + จำนวน |
| `unitTotal` / `grandTotal` | ราคาต่อหน่วย/รวม (คำนวณสดจากตัวเลือกที่เลือก) |

กด "เพิ่มลงตะกร้า" → เรียก `addToCart()` จาก Context ตรงๆ แล้ว `goBack()`

### `Review_Screen.js` (ตรวจก่อนส่งครัว)

| ตัวแปร/state | คืออะไร |
|---|---|
| `cart` / `updateQuantity` / `clearCart` (จาก `useCart()`) | แก้จำนวน/ล้างตะกร้าได้จากหน้านี้ |
| `previousRounds` | รอบก่อนหน้าที่ส่งไปแล้ว จาก `getPreviousRoundsSummary` |
| `submitting` | กันกดปุ่ม "ส่งเข้าครัว" ซ้ำระหว่างรอ |
| `roundTotal` / `totalPieces` / `previousTotal` / `grandTotal` | ยอดต่างๆ ที่โชว์ฝั่งขวา |

กด "ส่งเข้าครัว" → `submitOrderRound()` (ทรานแซกชัน) → `clearCart()` → `navigate('SendToKitchen', { billId, tableId })` (หน้าสรุปว่าส่งสำเร็จ + สถานะรายการที่ครัวเขียนกลับมา)

---

## `src/screens/customer/style/colors.js`

ชุดสีกลางของทั้งแอป แบ่งกลุ่ม `core` (สีหลัก), `surface` (พื้นผิวการ์ด/แผง), `text` (โทนตัวหนังสือ), `orange`/`mustard`/`red` (สถานะ), `chart`/`placeholder` (กราฟ/รูป placeholder) + `withAlpha()`/`alpha` สำหรับสีโปร่งใส — ทุกหน้าจอ import จากไฟล์เดียวนี้ ห้าม hardcode สี hex ใหม่ในไฟล์อื่น

## `src/screens/customer/menuImages.js`

`MENU_IMAGES` — map ชื่อเมนู → รูปที่ bundle มากับแอป (`require(...)`) ไม่ได้เก็บรูปใน DB ดูวิธีเพิ่มรูปใหม่ในคอมเมนต์บนสุดของไฟล์

---

## หน้าจอฝั่งครัว (`src/screens/kitchen/`)

ทั้ง 3 จอใช้ `useSQLiteContext()` ตัวเดียวกับฝั่งลูกค้า (เปิดใน `SQLiteProvider` ที่เดียวของ `App.js`) และเรียก query จาก `src/db/queries_kitchen/queue.js` เท่านั้น

### `OrderKitScreen.js` (หน้าหลัก — คิวครัว)

| ตัวแปร/state | คืออะไร |
|---|---|
| `rounds` / `nextQueue` | ใบออร์เดอร์ในคิว (`getKitchenQueue`) + ใบที่ยังไม่เริ่มทำ (`getNextQueueRounds`) |
| `activeFilter` / `counts` / `filteredRounds` | ชิปกรอง ทั้งหมด / รอทำ / กำลังทำ / เสิร์ฟแล้ว — **ค่าเริ่มต้นเป็น `'waiting'` (รอทำ)** แถบชิปกรองอยู่ใน header (`filterRow`) |
| `now` | Now Date (epoch ms) อัปเดตทุกวินาที — ใช้ทั้งนาฬิกา (`formatNowHM`) และนับเวลารอ (`getWaitMinutes(round.order_time, now)`) จึงไม่ขึ้นกับ timezone เครื่อง |
| `updatingRoundId` | กันกดปุ่มซ้ำระหว่างรอ |
| `REFRESH_INTERVAL_MS` | ดึงคิวใหม่ทุก 20 วินาที (จอครัวเปิดค้าง ไม่ได้พึ่ง focus event) |
| `windowWidth` / `isNarrow` / `columnCount` | จำนวนคอลัมน์กริด จาก `useWindowDimensions()` — `>= 700px` = 3 · `480-699px` = 2 · `< 480px` = 1 |
| `mainRounds` / `mainCardRows` | การ์ดหลัก = `filteredRounds.slice(0, MAIN_CARD_LIMIT)` แบ่งเป็นแถวละ `columnCount` ใบ |
| `gridWidth` / `cardWidth` | วัดความกว้างพื้นที่การ์ดหลักด้วย `onLayout` แล้วคำนวณ `cardWidth = floor((gridWidth - CARD_GAP * 2) / 3)` — การ์ดกว้างคงที่ 1 ใน 3 เสมอ ไม่ว่าจะมีกี่โต๊ะ (การ์ดใช้ `flexGrow: 0` + `width` ตายตัว จึงชิดซ้ายและเหลือที่ว่างขวาตามธรรมชาติ) |
| `sideRounds` | เนื้อหาแผง "คิวถัดไป" = ใบที่เกิน `MAIN_CARD_LIMIT` + `nextQueue` รวมกัน โดยตัด `round_id` ที่ซ้ำกับการ์ดหลักออก |

`MAIN_CARD_LIMIT = 3` — การ์ดหลักโชว์พร้อมกันสูงสุด 3 ใบ ที่เหลือไปอยู่ในแผง "คิวถัดไป · N ใบ" (แสดงโต๊ะ / รอบ+เวลา / จำนวนรายการ และตัดรายการที่ `cancelled` ออกจากการนับ)
แผงนี้เป็นแนวตั้งทุกโหมดและ**แสดงตลอด** แม้ไม่มีคิวรอ (`nextQueueEmpty` = "ยังไม่มีโต๊ะรอคิว") จอแคบจะย้ายไปอยู่ใต้พื้นที่การ์ดแทนการอยู่ข้าง (`bodyNarrow` + `nextQueuePanelNarrow`)

สัดส่วนความสูง: พื้นที่การ์ดไม่มี `ScrollView` ซ้อน — `roundsGrid` เป็น column และแต่ละ `roundCardRow` ใช้ `flex: 1` เท่ากัน การ์ดจึงยืดเต็มความสูงแถว (`alignItems: 'stretch'` ค่า default) โดยไม่ยืดตามจำนวนการ์ด ส่วน `itemList` เป็น `ScrollView` (`flex: 1`) ให้รายการอาหารยาวเลื่อนได้และปุ่ม action + ข้อความสรุปชิดล่างการ์ดเสมอ

ปุ่มล่างการ์ดมาจาก `getRoundAction(round)`: ยังมีรายการรอทำ → "เริ่มทำทั้งใบ" (`startRoundCooking`) · ไม่เหลือรอทำ → "เสิร์ฟแล้วทั้งใบ" (`markRoundAsServed`) · เสิร์ฟครบ → "เสิร์ฟครบแล้ว" (ปุ่มถูกปิด)
แตะการ์ด → `RoundStatusScreen` · footer มีปุ่ม "← ไปหน้าเลือกโต๊ะ" (`navigation.navigate('SelectTable')` · ถ้าหน้า SelectTable อยู่ใน stack แล้ว React Navigation จะ pop กลับไปใบเดิม) และ modal ประวัติที่เสิร์ฟแล้ว (`getServedHistory`) กับรายการที่ถูกยกเลิก (`getCancelledItems`)

### `RoundStatusScreen.js` (รายละเอียดใบออร์เดอร์ + เปลี่ยนสถานะ)

| ตัวแปร/state | คืออะไร |
|---|---|
| `selectedRoundId` | ใบที่เลือกอยู่ (ค่าเริ่มต้นมาจาก `route.params.roundId`) |
| `updatingKey` | `order_item_id` ที่กำลังเปลี่ยนสถานะ หรือ `'ROUND'` ตอนกดทั้งใบ |
| `showPrintPreview` | modal ตัวอย่างใบครัวก่อนพิมพ์ |

รายการในใบมีปุ่ม 3 สถานะ (`รอทำ` / `กำลังทำ` / `เสิร์ฟแล้ว`) → `updateItemStatus(db, order_item_id, status)` · ปุ่ม "ทั้งใบ → เสิร์ฟแล้ว" → `markRoundAsServed` · ปุ่ม "ยกเลิกรายการ" → `CancelItemScreen`

**กฎสถานะ: เดินหน้าทางเดียว ย้อนกลับไม่ได้** (`รอทำ → กำลังทำ → เสิร์ฟแล้ว`) บังคับไว้ 2 ชั้น
1. **UI** (`RoundStatusScreen`) — `getNextStatus(status)` คืนขั้นถัดไปเท่านั้น ปุ่มที่ผ่านแล้ว/ขั้นปัจจุบัน/หลังเสิร์ฟครบ ถูก `disabled` + จาง (`statusStepButtonDisabled`) ขั้นที่ผ่านแล้วขึ้นเครื่องหมาย `✓` · เสิร์ฟแล้ว = จบ ไม่มีปุ่มให้กด
2. **DB** (`updateItemStatus`) — อ่าน `status` เดิมมาเทียบลำดับก่อนเขียน ถ้าขั้นใหม่ไม่มากกว่าขั้นเดิมจะ `throw` ("เปลี่ยนสถานะย้อนกลับไม่ได้") · รายการ `cancelled` ถือเป็นทางตัน (`throw` "ถูกยกเลิกแล้ว") · `UPDATE ... AND status = <ค่าเดิม>` กันกดจากสองจอพร้อมกัน
ปุ่มระดับใบก็เดินหน้าอย่างเดียวเช่นกัน: `startRoundCooking` แตะเฉพาะ `pending` และ `markRoundAsServed` แตะเฉพาะ `pending/cooking` (เรียกซ้ำได้ผล 0 แถว ไม่ย้อนสถานะ)

### `CancelItemScreen.js` (ยกเลิกรายการ + log)

| ตัวแปร/state | คืออะไร |
|---|---|
| `round` | ใบจาก `route.params.roundId` (ถ้าไม่เจอใช้ใบแรกในคิว) |
| `selectedItemId` | `order_item_id` ที่เลือกจะยกเลิก (เลือกอัตโนมัติตัวแรกที่ยัง `รอทำ`) |
| `reasonKey` | เหตุผลจาก `REASON_OPTIONS` (บังคับเลือกก่อนกดยืนยัน) |
| `cancelledLog` | ผลจาก `getCancelledItems` (ล่าสุดอยู่บนสุด) |
| `itemScrollRef` / `itemOffsetsRef` | เก็บตำแหน่ง `y` ของแต่ละการ์ด (จาก `onLayout`) เพื่อ `scrollTo` ให้รายการที่เลือกเห็นเสมอแม้อยู่นอกจอ |

คอลัมน์ซ้ายแบ่ง 3 ส่วนแนวตั้ง: `leftTop` (ปุ่ม "← กลับ" + หัวข้อ "โต๊ะ [X] · รอบที่ [Y]" · ตายตัว) → `itemScroll` (`flex: 1` เป็น `ScrollView` ของตัวเอง **ไม่มี `height`/`maxHeight` ตายตัว** จึงไม่ตัดกลางการ์ด) → `leftBottom` (`ruleBox` + `logTitle` + `logList` · `flexShrink: 0` ชิดล่างสุดของคอลัมน์)
กล่องกฎและกล่อง log ถูกบีบความสูง (`ruleBox` padding 10 · ตัวอักษร 11-12 · `logList` `maxHeight: 78` ≈ 3 รายการล่าสุดแล้วเลื่อนอ่านในกล่อง) เพื่อไม่แย่งพื้นที่รายการเมนู การ์ดที่เลือกไว้ยังคงกรอบแดง (`itemRowSelected`)

กด "ยืนยันยกเลิก" → `cancelItem(db, order_item_id, เหตุผล)` — ใน DB ล็อกด้วย `WHERE status = 'pending'` เสมอ กันการยกเลิกรายการที่เริ่มทำแล้วจากกดรัวสองจอพร้อมกัน

