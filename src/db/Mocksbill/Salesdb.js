// src/db/salesDb.js
// คิวรีสรุปยอดขายจาก SQLite จริง ตาม schema ใน db/schema.js
// ทุกฟังก์ชันรับ (db, ...) โดย db ได้จาก useSQLiteContext()
//
// ทุกยอดเงินคืนเป็น "สตางค์" (INTEGER) — แปลงเป็นบาทตอนแสดงผลในหน้าจอเท่านั้น
// วันที่รับเป็น 'YYYY-MM-DD' เวลาไทย (UTC+7) — แปลง opened_at (UTC) ด้วย date(opened_at, '+7 hours')
//
// รูปแบบฟังก์ชัน/ผลลัพธ์เหมือนกับ src/db/mockDb.js ทุกอย่าง จึงสลับกันได้ที่ import ใน Salesqueries.js

// ชิ้นส่วน SQL ที่ใช้ซ้ำ: รวมราคาตัวเลือกเพิ่มเติมต่อรายการ
const OPTION_TOTAL_JOIN = `
  LEFT JOIN (
    SELECT order_item_id, SUM(price_delta_satang_snapshot) AS option_total
    FROM order_item_options
    GROUP BY order_item_id
  ) opt ON opt.order_item_id = oi.order_item_id
`;
const LINE_AMOUNT = `(oi.unit_price_satang + COALESCE(opt.option_total, 0)) * oi.quantity`;

// ---- ยอดขายรวมของวันนั้น (ไม่นับรายการที่ถูกยกเลิก) ----
export async function getTotalSalesForDate(db, dateStr) {
  const row = await db.getFirstAsync(
    `
    SELECT COALESCE(SUM(${LINE_AMOUNT}), 0) AS total
    FROM order_items oi
    JOIN order_rounds r ON r.round_id = oi.round_id
    JOIN bills b ON b.bill_id = r.bill_id
    ${OPTION_TOTAL_JOIN}
    WHERE oi.status != 'cancelled'
      AND date(b.opened_at, '+7 hours') = ?
    `,
    [dateStr]
  );
  return row?.total ?? 0;
}

// ---- สรุปตัวเลขหลักทั้งหมดของวันนั้น ----
export async function getDailySummary(db, dateStr) {
  const [totalToday, totalYesterday, billCounts, roundCount, cancelled, bestHour, bestMenu] =
    await Promise.all([
      getTotalSalesForDate(db, dateStr),
      getTotalSalesForDate(db, yesterday(dateStr)),

      db.getFirstAsync(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
        FROM bills
        WHERE date(opened_at, '+7 hours') = ?
        `,
        [dateStr]
      ),

      db.getFirstAsync(
        `
        SELECT COUNT(*) AS cnt
        FROM order_rounds r
        JOIN bills b ON b.bill_id = r.bill_id
        WHERE date(b.opened_at, '+7 hours') = ?
        `,
        [dateStr]
      ),

      db.getFirstAsync(
        `
        SELECT COUNT(*) AS cnt, COALESCE(SUM(${LINE_AMOUNT}), 0) AS amt
        FROM order_items oi
        JOIN order_rounds r ON r.round_id = oi.round_id
        JOIN bills b ON b.bill_id = r.bill_id
        ${OPTION_TOTAL_JOIN}
        WHERE oi.status = 'cancelled'
          AND date(b.opened_at, '+7 hours') = ?
        `,
        [dateStr]
      ),

      db.getFirstAsync(
        `
        SELECT
          CAST(strftime('%H', r.ordered_at, '+7 hours') AS INTEGER) AS hour,
          SUM(${LINE_AMOUNT}) AS amt
        FROM order_items oi
        JOIN order_rounds r ON r.round_id = oi.round_id
        JOIN bills b ON b.bill_id = r.bill_id
        ${OPTION_TOTAL_JOIN}
        WHERE oi.status != 'cancelled'
          AND date(b.opened_at, '+7 hours') = ?
        GROUP BY hour
        ORDER BY amt DESC
        LIMIT 1
        `,
        [dateStr]
      ),

      db.getFirstAsync(
        `
        SELECT mi.name AS name, SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN order_rounds r ON r.round_id = oi.round_id
        JOIN bills b ON b.bill_id = r.bill_id
        JOIN menu_items mi ON mi.item_id = oi.item_id
        WHERE oi.status != 'cancelled'
          AND date(b.opened_at, '+7 hours') = ?
        GROUP BY oi.item_id
        ORDER BY qty DESC
        LIMIT 1
        `,
        [dateStr]
      ),
    ]);

  const billTotal = billCounts?.total ?? 0;
  const rounds = roundCount?.cnt ?? 0;

  return {
    totalSales: totalToday,
    salesChangePercent:
      totalYesterday > 0 ? Math.round(((totalToday - totalYesterday) / totalYesterday) * 100) : null,
    billCount: billTotal,
    billClosed: billCounts?.closed ?? 0,
    billOpen: billCounts?.open ?? 0,
    avgPerBill: billTotal > 0 ? Math.round(totalToday / billTotal) : 0,
    avgRoundsPerBill: billTotal > 0 ? Math.round((rounds / billTotal) * 10) / 10 : 0,
    cancelledCount: cancelled?.cnt ?? 0,
    cancelledAmount: cancelled?.amt ?? 0,
    bestHour: bestHour?.hour ?? null,
    bestHourAmount: bestHour?.amt ?? 0,
    bestMenuName: bestMenu?.name ?? null,
    bestMenuQty: bestMenu?.qty ?? 0,
  };
}

// ---- ยอดขายแยกตามหมวดหมู่อาหาร (เรียงจากมากไปน้อย) ----
export async function getCategoryBreakdown(db, dateStr) {
  const rows = await db.getAllAsync(
    `
    SELECT c.name AS name, SUM(oi.quantity) AS qty, SUM(${LINE_AMOUNT}) AS amount
    FROM order_items oi
    JOIN order_rounds r ON r.round_id = oi.round_id
    JOIN bills b ON b.bill_id = r.bill_id
    JOIN menu_items mi ON mi.item_id = oi.item_id
    JOIN categories c ON c.category_id = mi.category_id
    ${OPTION_TOTAL_JOIN}
    WHERE oi.status != 'cancelled'
      AND date(b.opened_at, '+7 hours') = ?
    GROUP BY c.category_id
    ORDER BY amount DESC
    `,
    [dateStr]
  );

  const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);
  return rows.map((r) => ({
    name: r.name,
    qty: r.qty,
    amount: r.amount,
    percent: grandTotal > 0 ? Math.round((r.amount / grandTotal) * 1000) / 10 : 0,
  }));
}

// ---- วันล่าสุดที่มีบิลอยู่จริง (เวลาไทย) หรือ null ถ้ายังไม่มีบิลเลย ----
export async function getLatestBillDate(db) {
  const row = await db.getFirstAsync(
    `SELECT date(opened_at, '+7 hours') AS d FROM bills ORDER BY opened_at DESC LIMIT 1`
  );
  return row?.d ?? null;
}

// ---- บิลทั้งหมดของวันนั้น พร้อมรอบสั่งและรายการอาหาร ----
export async function getBillsForDate(db, dateStr) {
  const bills = await db.getAllAsync(
    `SELECT b.bill_id, b.status, b.opened_at, b.closed_at, t.table_number
       FROM bills b
       JOIN restaurant_tables t ON t.table_id = b.table_id
      WHERE date(b.opened_at, '+7 hours') = ?
      ORDER BY b.opened_at`,
    [dateStr]
  );
  if (bills.length === 0) return [];

  const rows = await db.getAllAsync(
    `SELECT r.bill_id, r.round_id, r.round_number, r.ordered_at,
            oi.order_item_id, oi.quantity, oi.unit_price_satang, oi.status, oi.note,
            mi.name, ${LINE_AMOUNT} AS amount
       FROM order_rounds r
       JOIN order_items oi ON oi.round_id = r.round_id
       JOIN menu_items mi ON mi.item_id = oi.item_id
       ${OPTION_TOTAL_JOIN}
      WHERE r.bill_id IN (SELECT bill_id FROM bills WHERE date(opened_at, '+7 hours') = ?)
      ORDER BY r.bill_id, r.round_number, oi.order_item_id`,
    [dateStr]
  );

  const byBill = new Map(
    bills.map((b) => [
      b.bill_id,
      {
        billId: b.bill_id,
        tableNumber: b.table_number,
        status: b.status,
        openedTime: utcToBangkokHHMM(b.opened_at),
        closedTime: b.closed_at ? utcToBangkokHHMM(b.closed_at) : null,
        rounds: [],
        total: 0,
      },
    ])
  );
  for (const r of rows) {
    const bill = byBill.get(r.bill_id);
    let round = bill.rounds.find((x) => x.roundId === r.round_id);
    if (!round) {
      round = { roundId: r.round_id, roundNumber: r.round_number, time: utcToBangkokHHMM(r.ordered_at), items: [] };
      bill.rounds.push(round);
    }
    round.items.push({
      id: r.order_item_id, name: r.name, qty: r.quantity, unitPrice: r.unit_price_satang,
      amount: r.amount, status: r.status, note: r.note,
    });
    if (r.status !== 'cancelled') bill.total += r.amount;
  }
  return Array.from(byBill.values());
}

// ---- จำนวนบิลต่อวัน → { 'YYYY-MM-DD': จำนวนบิล } ใช้ในหน้าต่างเลือกวันที่ ----
export async function getBillCountsByDate(db) {
  const rows = await db.getAllAsync(
    `SELECT date(opened_at, '+7 hours') AS d, COUNT(*) AS c FROM bills GROUP BY d`
  );
  const out = {};
  for (const r of rows) out[r.d] = r.c;
  return out;
}

// ---- ตัวช่วย ----
function yesterday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function utcToBangkokHHMM(utcStr) {
  if (!utcStr) return '-';
  const d = new Date(new Date(utcStr.replace(' ', 'T') + 'Z').getTime() + 7 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}