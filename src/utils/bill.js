// ตัวช่วยเล็กๆ สำหรับหน้าสรุปบิล (DetailScreen) กับหน้าใบเสร็จ (ExportBillScreen)
// หมายเหตุ: ไฟล์นี้ "ไม่รวมยอดเงิน" — ยอดรวมทุกตัวมาจาก SQL (getBillTotals / total_satang / line_total_satang)
// ตามข้อกำหนด 3.2 ข้อ 5 ไฟล์นี้แค่จัดรูปแบบข้อมูลเพื่อแสดงผล

// เวลาใน DB เป็น UTC ('2026-09-20 07:54:02') -> แปลงเป็นเวลาไทย 'HH:MM'
export function toThaiTime(utcText) {
  if (!utcText) return '-';
  const utcMs = Date.parse(utcText.replace(' ', 'T') + 'Z');
  const thai = new Date(utcMs + 7 * 60 * 60 * 1000); // ไทย = UTC+7
  const hh = String(thai.getUTCHours()).padStart(2, '0');
  const mm = String(thai.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// สตางค์ -> ข้อความบาท เช่น 18135 -> "181.35", 14000 -> "140"
export function satangToBaht(satang) {
  return ((satang ?? 0) / 100).toLocaleString();
}

// แปลงบิลจาก getBillWithRounds() ให้เป็นรูปแบบที่ BillOrder ใช้
// รายการที่ถูกยกเลิกไม่แสดงในบิล/ใบเสร็จ เพราะถูกตัดออกจากยอดที่ต้องจ่ายแล้ว
export function billToOrders(bill) {
  if (!bill?.rounds) return [];

  return bill.rounds.map((round) => {
    const activeItems = round.items.filter((i) => i.status !== 'cancelled');
    const allServed = activeItems.every((i) => i.status === 'served');

    return {
      round: round.round_number,
      sentTime: toThaiTime(round.ordered_at),
      status: allServed ? 'เสิร์ฟครบ' : 'กำลังทำ',
      items: activeItems.map((item) => {
        // หมายเหตุ = ชื่อตัวเลือก + note ที่ลูกค้าพิมพ์
        const optionNames = item.options.map((o) => o.option_name_snapshot);
        const note = [...optionNames, item.note].filter(Boolean).join(', ');

        return {
          id: item.order_item_id.toString(),
          name: item.name,
          note,
          price: satangToBaht(item.unit_price_satang),         // ราคาต่อหน่วย (รวม option แล้ว)
          qty: item.quantity,
          lineTotal: satangToBaht(item.line_total_satang),     // ราคารวมของรายการ (คิดใน SQL)
        };
      }),
    };
  });
}
