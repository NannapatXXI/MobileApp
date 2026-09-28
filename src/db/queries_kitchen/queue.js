// src/db/queries_kitchen/queue.js
// query ฝั่งครัว — อ่าน/เขียน "ฐานข้อมูลชุดเดียวกับฝั่งลูกค้า"
// ไม่มีตารางของตัวเอง: จอครัวดึงจาก orders ที่ลูกค้าสั่งผ่าน flow
// Select_Table → Menu_Screen → Review_Screen (กด "ส่งเข้าครัว") → order_rounds + order_items
// ครัวจึงเห็นออร์เดอร์ทันทีที่ลูกค้ากดส่ง และสถานะที่ครัวเปลี่ยนจะกลับไปโชว์ฝั่งลูกค้าด้วย
// (หน้าจอห้ามเขียน SQL เอง — ทุกอย่างต้องผ่านฟังก์ชันในไฟล์นี้ ตามข้อกำหนดโจทย์ §4)
//
// mapping สถานะระหว่าง DB กับจอครัว
//   DB 'pending'   -> จอ 'waiting'  (รอทำ)
//   DB 'cooking'   -> จอ 'cooking'  (กำลังทำ)
//   DB 'served'    -> จอ 'served'   (เสิร์ฟแล้ว)
//   DB 'cancelled' -> ไม่โชว์ในคิว (ตัดออกจากบิลลูกค้าแล้ว แต่เก็บไว้ดูใน log)

import { formatBangkokHM } from '../../utils/time';

const UI_STATUS = {
  pending: 'waiting',
  cooking: 'cooking',
  served: 'served',
};

const DB_STATUS_BY_UI = {
  waiting: 'pending',
  cooking: 'cooking',
  served: 'served',
};

// ---------------------------------------------------------------------------
// คิวครัว
// ---------------------------------------------------------------------------

// ใบออร์เดอร์ทั้งหมดที่ครัวต้องเห็น เรียงตามเวลาที่สั่งใหม่ -> เก่า (ออร์เดอร์ล่าสุดขึ้นก่อน)
// เงื่อนไข "เห็น" = ยังมีงานค้าง (pending/cooking) OR สั่งภายในวันนี้ตามเวลาไทย
//   → ใบที่เสิร์ฟครบแล้วของเมื่อวานไม่ต้องมากวนอยู่ในคิว แต่ของวันนี้ยังเห็นในฟิลเตอร์ "เสิร์ฟแล้ว"
export async function getKitchenQueue(db) {
  const rounds = await db.getAllAsync(`
    SELECT r.round_id, r.bill_id, r.round_number, r.ordered_at, t.table_number
    FROM order_rounds r
    JOIN bills b ON b.bill_id = r.bill_id
    JOIN restaurant_tables t ON t.table_id = b.table_id
    WHERE EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.round_id = r.round_id AND oi.status != 'cancelled'
          )
      AND (
            EXISTS (
              SELECT 1 FROM order_items oi
              WHERE oi.round_id = r.round_id AND oi.status IN ('pending', 'cooking')
            )
            OR date(r.ordered_at, '+7 hours') = date('now')
          )
    ORDER BY r.ordered_at DESC, r.round_id DESC
  `);

  for (const round of rounds) {
    round.items = await getRoundItems(db, round.round_id);
    round.bill_code = round.bill_id;
    round.order_time = round.ordered_at;
    round.order_time_label = formatBangkokHM(round.ordered_at);
  }
  return rounds;
}

// แผง "คิวถัดไป" = ใบที่ยังไม่เริ่มทำเลย (ทุกรายการยังรอทำอยู่) เรียงเวลาที่สั่งใหม่ -> เก่า
export async function getNextQueueRounds(db) {
  const rows = await db.getAllAsync(`
    SELECT r.round_id, r.round_number, r.ordered_at, t.table_number,
           (SELECT COUNT(*) FROM order_items x
             WHERE x.round_id = r.round_id AND x.status = 'pending') AS item_count
    FROM order_rounds r
    JOIN bills b ON b.bill_id = r.bill_id
    JOIN restaurant_tables t ON t.table_id = b.table_id
    WHERE EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.round_id = r.round_id AND oi.status != 'cancelled'
          )
      AND NOT EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.round_id = r.round_id AND oi.status IN ('cooking', 'served')
          )
    ORDER BY r.ordered_at DESC, r.round_id DESC
  `);

  return rows.map((r) => ({
    round_id: r.round_id,
    table_number: r.table_number,
    round_number: r.round_number,
    item_count: r.item_count,
    order_time: r.ordered_at,
    order_time_label: formatBangkokHM(r.ordered_at),
  }));
}

// รายการในใบ (ตัดรายการที่ถูกยกเลิกออก เพราะถูกตัดออกจากบิลลูกค้าแล้ว)
async function getRoundItems(db, roundId) {
  const rows = await db.getAllAsync(`
    SELECT oi.order_item_id, oi.quantity, oi.note, oi.status,
           oi.started_at, oi.served_at, m.name
    FROM order_items oi
    JOIN menu_items m ON m.item_id = oi.item_id
    WHERE oi.round_id = ? AND oi.status != 'cancelled'
    ORDER BY oi.order_item_id
  `, [roundId]);

  const items = [];
  for (const row of rows) {
    items.push({
      order_item_id: row.order_item_id,
      name: row.name,
      quantity: row.quantity,
      note: row.note,
      status: UI_STATUS[row.status] ?? 'waiting',
      // เวลาที่สถานะนี้เริ่มมีผล (เริ่มทำ / เสิร์ฟ) — รอทำยังไม่มีเวลา
      status_time: formatBangkokHM(row.status === 'served' ? row.served_at : row.started_at),
      modifiers: await getItemModifierNames(db, row.order_item_id),
    });
  }
  return items;
}

async function getItemModifierNames(db, orderItemId) {
  const rows = await db.getAllAsync(
    'SELECT option_name_snapshot FROM order_item_options WHERE order_item_id = ? ORDER BY order_item_option_id',
    [orderItemId]
  );
  return rows.map((r) => r.option_name_snapshot);
}

// ---------------------------------------------------------------------------
// เปลี่ยนสถานะ (เวลาทุกครั้งมาจาก datetime('now') ของ DB ไม่ใช่นาฬิกาเครื่อง)
// ---------------------------------------------------------------------------

// ปุ่ม "เริ่มทำทั้งใบ" — เฉพาะรายการที่ยังรอทำ
export async function startRoundCooking(db, roundId) {
  const result = await db.runAsync(
    `UPDATE order_items
     SET status = 'cooking',
         started_at = COALESCE(started_at, datetime('now'))
     WHERE round_id = ? AND status = 'pending'`,
    [roundId]
  );
  return result.changes;
}

// ปุ่ม "เสิร์ฟแล้วทั้งใบ" — รายการที่ยังไม่เสิร์ฟเท่านั้น (cancelled ไม่ถูกแตะ)
export async function markRoundAsServed(db, roundId) {
  const result = await db.runAsync(
    `UPDATE order_items
     SET status = 'served',
         started_at = COALESCE(started_at, datetime('now')),
         served_at = datetime('now')
     WHERE round_id = ? AND status IN ('pending', 'cooking')`,
    [roundId]
  );
  return result.changes;
}

// เปลี่ยนสถานะรายรายการจากหน้า RoundStatusScreen
// กฎเดียว: เดินหน้าทางเดียว ไม่ย้อนกลับ — รอทำ (pending) → กำลังทำ (cooking) → เสิร์ฟแล้ว (served)
// · ย้อนกลับ (เช่น served → cooking) หรือกดสถานะเดิมซ้ำ → throw
// · cancelled ถือเป็นทางตันของสายนี้ เปลี่ยนสถานะต่อไม่ได้ (แก้ได้ทางเดียวคือลบรายการ)
// · ล็อกด้วย AND status = <ค่าเดิมที่อ่านมา> กันกดจากสองจอพร้อมกัน
const STATUS_STEP_BY_DB = { pending: 0, cooking: 1, served: 2 };

export async function updateItemStatus(db, orderItemId, uiStatus) {
  const status = DB_STATUS_BY_UI[uiStatus];
  if (!status) throw new Error(`สถานะที่รับได้มีแค่ waiting/cooking/served แต่ได้ "${uiStatus}"`);

  const current = await db.getFirstAsync(
    `SELECT status,
            CASE status WHEN 'pending' THEN 0 WHEN 'cooking' THEN 1 WHEN 'served' THEN 2 ELSE -1 END AS step
     FROM order_items
     WHERE order_item_id = ?`,
    [orderItemId]
  );
  if (!current) throw new Error('ไม่พบรายการที่จะเปลี่ยนสถานะ');
  if (current.step < 0) {
    throw new Error('รายการนี้ถูกยกเลิกแล้ว เปลี่ยนสถานะต่อไม่ได้');
  }
  if (STATUS_STEP_BY_DB[status] <= current.step) {
    throw new Error('เปลี่ยนสถานะย้อนกลับไม่ได้ (รอทำ → กำลังทำ → เสิร์ฟแล้ว)');
  }

  if (status === 'cooking') {
    return db.runAsync(
      `UPDATE order_items
       SET status = 'cooking',
           started_at = COALESCE(started_at, datetime('now'))
       WHERE order_item_id = ? AND status = ?`,
      [orderItemId, current.status]
    );
  }

  // served — เดินจาก cooking หรือกระโดดจาก pending (เช่น จานที่เสิร์ฟทันทีหลังสั่ง)
  return db.runAsync(
    `UPDATE order_items
     SET status = 'served',
         started_at = COALESCE(started_at, datetime('now')),
         served_at = datetime('now')
     WHERE order_item_id = ? AND status = ?`,
    [orderItemId, current.status]
  );
}

// ---------------------------------------------------------------------------
// ยกเลิกรายการ
// ---------------------------------------------------------------------------

// ยกเลิกได้เฉพาะรายการที่ยัง "รอทำ" (กฎเดียวกับที่แสดงบนหน้าจอ) — เริ่มทำแล้วต้องให้หน้าร้านอนุมัติ
// เก็บทั้งเวลาและเหตุผลไว้ เพราะรายการที่ cancelled ถูกตัดออกจากยอดบิลฝั่งลูกค้าทันที
export async function cancelItem(db, orderItemId, reason) {
  const result = await db.runAsync(
    `UPDATE order_items
     SET status = 'cancelled',
         started_at = COALESCE(started_at, datetime('now')),
         cancelled_at = datetime('now'),
         cancel_reason = ?
     WHERE order_item_id = ? AND status = 'pending'`,
    [reason || null, orderItemId]
  );
  return result.changes;
}

// บันทึกการยกเลิก (log ในหน้ายกเลิกรายการ + modal บนหน้าคิวครัว)
export async function getCancelledItems(db) {
  const rows = await db.getAllAsync(`
    SELECT oi.order_item_id, oi.quantity, oi.cancelled_at, oi.cancel_reason, m.name,
           r.round_number, t.table_number
    FROM order_items oi
    JOIN order_rounds r ON r.round_id = oi.round_id
    JOIN bills b ON b.bill_id = r.bill_id
    JOIN restaurant_tables t ON t.table_id = b.table_id
    JOIN menu_items m ON m.item_id = oi.item_id
    WHERE oi.status = 'cancelled'
    ORDER BY oi.cancelled_at DESC, oi.order_item_id DESC
    LIMIT 100
  `);

  return rows.map((r) => ({
    id: r.order_item_id,
    name: r.name,
    quantity: r.quantity,
    table_number: r.table_number,
    round_number: r.round_number,
    reason: r.cancel_reason ?? '-',
    cancelled_time_label: formatBangkokHM(r.cancelled_at),
  }));
}

// ---------------------------------------------------------------------------
// ประวัติ
// ---------------------------------------------------------------------------

// ใบที่เสิร์ฟครบทุกรายการแล้ว (นับเฉพาะรายการที่ยังไม่ถูกยกเลิก) เก่า -> ใหม่
export async function getServedHistory(db) {
  const rows = await db.getAllAsync(`
    SELECT r.round_id, r.round_number, t.table_number,
           COUNT(oi.order_item_id) AS item_count,
           MAX(oi.served_at) AS served_at
    FROM order_rounds r
    JOIN order_items oi ON oi.round_id = r.round_id AND oi.status != 'cancelled'
    JOIN bills b ON b.bill_id = r.bill_id
    JOIN restaurant_tables t ON t.table_id = b.table_id
    WHERE NOT EXISTS (
            SELECT 1 FROM order_items x
            WHERE x.round_id = r.round_id AND x.status IN ('pending', 'cooking')
          )
    GROUP BY r.round_id
    ORDER BY served_at DESC
    LIMIT 50
  `);

  return rows.map((r) => ({
    round_id: r.round_id,
    table_number: r.table_number,
    round_number: r.round_number,
    item_count: r.item_count,
    served_time_label: formatBangkokHM(r.served_at),
  }));
}
