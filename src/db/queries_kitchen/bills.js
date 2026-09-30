// src/db/queries_kitchen/bills.js
// query ปิดบิล — ใช้ในหน้าจอครัว (ฝั่งพนักงาน) ตามโจทย์ ก10
//
// ปิดบิล = เปลี่ยน bills.status เป็น 'closed' และบันทึก closed_at
//   - ข้อมูลบิลไม่ถูกลบ → บิลเก่ายังเรียกดูย้อนหลังได้ในหน้าสรุปยอดขาย (Salesdb.js)
//   - หน้าเลือกโต๊ะนับเฉพาะบิลที่ status = 'open' → โต๊ะกลับเป็น "ว่าง" และเปิดบิลใหม่ได้ทันที

// บิลที่ยังเปิดอยู่และสั่งไปแล้วอย่างน้อย 1 รอบ เรียงตามเวลาเปิดเก่า -> ใหม่
// ยอดเงิน = unit_price_satang * quantity (รวม option แล้ว) ไม่นับรายการที่ยกเลิก
// บิลที่เปิดแต่ยังไม่สั่ง (0 รอบ) ไม่แสดง — ให้ตรงกับหน้าเลือกโต๊ะที่นับโต๊ะแบบนี้เป็น "ว่าง"
// (ถ้าลูกค้าเลือกโต๊ะนั้นอีก หน้าเลือกโต๊ะจะใช้บิลเดิมต่อ ไม่สร้างบิลซ้อน)
export function getOpenBills(db) {
  return db.getAllAsync(`
    SELECT b.bill_id, b.opened_at, t.table_number,
           COUNT(DISTINCT r.round_id) AS round_count,
           COALESCE(SUM(CASE WHEN oi.status != 'cancelled'
                             THEN oi.unit_price_satang * oi.quantity ELSE 0 END), 0) AS total_satang,
           COALESCE(SUM(CASE WHEN oi.status IN ('pending', 'cooking')
                             THEN 1 ELSE 0 END), 0) AS unserved_count
    FROM bills b
    JOIN restaurant_tables t ON t.table_id = b.table_id
    LEFT JOIN order_rounds r ON r.bill_id = b.bill_id
    LEFT JOIN order_items oi ON oi.round_id = r.round_id
    WHERE b.status = 'open'
    GROUP BY b.bill_id
    HAVING COUNT(DISTINCT r.round_id) > 0
    ORDER BY b.opened_at ASC
  `);
}

// ปิดบิล 1 ใบ → คืนจำนวนแถวที่ถูกแก้
//   1 = ปิดสำเร็จ
//   0 = ปิดไม่ได้ (บิลถูกปิดไปแล้ว หรือยังมีรายการที่ครัวยังไม่เสิร์ฟ)
// เงื่อนไขอยู่ใน SQL เลย เพื่อกันกรณีมีออร์เดอร์ใหม่เข้ามาพอดีระหว่างที่พนักงานกดยืนยัน
//   - AND status = 'open'      → กดปิดซ้ำแล้วเวลาปิดไม่ถูกเขียนทับ
//   - AND NOT EXISTS (...)     → ห้ามปิดถ้ายังมีรายการ รอทำ/กำลังทำ ค้างอยู่
export async function closeBill(db, billId) {
  const result = await db.runAsync(
    `UPDATE bills
     SET status = 'closed', closed_at = datetime('now')
     WHERE bill_id = ?
       AND status = 'open'
       AND NOT EXISTS (
             SELECT 1
             FROM order_rounds r
             JOIN order_items oi ON oi.round_id = r.round_id
             WHERE r.bill_id = bills.bill_id
               AND oi.status IN ('pending', 'cooking')
           )`,
    [billId]
  );
  return result.changes;
}
