// src/screens/customer/Salesqueries.js
// ตัวกลางระหว่างหน้าจอกับแหล่งข้อมูล — หน้าจอเรียกผ่านไฟล์นี้ไฟล์เดียว
//
// ตอนนี้ดึงจากข้อมูลจำลอง src/db/mockDb.js
// ตอนรวมงาน เปลี่ยนแค่บรรทัด import ด้านล่างให้ชี้ไปไฟล์ในโฟลเดอร์ db ที่ใช้จริง เช่น
//   import * as source from '../../db/salesDb';       // SQL จริง (มีให้แล้ว)
//   import * as source from '../../db/<ไฟล์ของทีม>';
//
// ไฟล์ที่จะมาแทนต้องส่งออกฟังก์ชันชุดนี้ (รับ db เป็นตัวแรก คืนค่าเป็น Promise):
//   getTotalSalesForDate(db, dateStr)  → สตางค์
//   getDailySummary(db, dateStr)       → { totalSales, salesChangePercent, billCount, billClosed, billOpen,
//                                          avgPerBill, avgRoundsPerBill, cancelledCount, cancelledAmount,
//                                          bestHour, bestHourAmount, bestMenuName, bestMenuQty }
//   getCategoryBreakdown(db, dateStr)  → [{ name, qty, amount, percent }] เรียงยอดมากไปน้อย
//   getLatestBillDate(db)              → 'YYYY-MM-DD' | null
//   getBillsForDate(db, dateStr)       → [{ billId, tableNumber, status, openedTime, closedTime, total,
//                                           rounds: [{ roundId, roundNumber, time,
//                                             items: [{ id, name, qty, unitPrice, amount, status, note }] }] }]
//   getBillCountsByDate(db)            → { 'YYYY-MM-DD': จำนวนบิล }
// (เงินเป็นสตางค์ วันที่เป็นเวลาไทย UTC+7 เสมอ)
//
// ฟังก์ชันที่ประกอบขึ้นในไฟล์นี้ (ไม่ต้องให้ source ทำ — ใช้ได้กับ db จริงทันที):
//   getMonthList(db) → [{ month: 'YYYY-MM', days, bills, dates: ['YYYY-MM-DD', ...] }]
//                      เรียงเดือนใหม่→เก่า และ dates เรียงวันใหม่→เก่า (มาจาก getBillCountsByDate)

import * as source from '../../db/Mocksbill/Mockdb';

export const getTotalSalesForDate = (db, dateStr) => source.getTotalSalesForDate(db, dateStr);
export const getDailySummary = (db, dateStr) => source.getDailySummary(db, dateStr);
export const getCategoryBreakdown = (db, dateStr) => source.getCategoryBreakdown(db, dateStr);
export const getLatestBillDate = (db) => source.getLatestBillDate(db);
export const getBillsForDate = (db, dateStr) => source.getBillsForDate(db, dateStr);
export const getBillCountsByDate = (db) => source.getBillCountsByDate(db);

// จัดกลุ่มวันที่ที่มีบิลตามเดือน สำหรับแท็บเลือกเดือนในหน้าสรุปยอดขาย
export async function getMonthList(db) {
  const counts = await source.getBillCountsByDate(db);
  const dates = Object.keys(counts).sort().reverse(); // ใหม่ → เก่า
  const byMonth = new Map();
  for (const d of dates) {
    const month = d.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { month, days: 0, bills: 0, dates: [] });
    const m = byMonth.get(month);
    m.days += 1;
    m.bills += counts[d] || 0;
    m.dates.push(d);
  }
  return [...byMonth.values()]; // ลำดับ insert = เดือนใหม่ → เก่า
}