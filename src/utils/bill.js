// ตัวช่วยเล็กๆ สำหรับหน้าสรุปบิล (DetailScreen) กับหน้าใบเสร็จ (ExportBillScreen)

// เวลาใน DB เป็น UTC ('2026-09-20 07:54:02') -> แปลงเป็นเวลาไทย 'HH:MM'
export function toThaiTime(utcText) {
  if (!utcText) return '-';
  const utcMs = Date.parse(utcText.replace(' ', 'T') + 'Z');
  const thai = new Date(utcMs + 7 * 60 * 60 * 1000); // ไทย = UTC+7
  const hh = String(thai.getUTCHours()).padStart(2, '0');
  const mm = String(thai.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// แปลงบิลจาก getBillWithRounds() ให้เป็นรูปแบบที่ BillOrder ใช้
export function billToOrders(bill) {
  if (!bill?.rounds) return [];

  return bill.rounds.map((round) => {
    const allServed = round.items.every((i) => i.status === 'served');

    return {
      round: round.round_number,
      sentTime: toThaiTime(round.ordered_at),
      status: allServed ? 'เสิร์ฟครบ' : 'กำลังทำ',
      items: round.items.map((item) => {
        // ราคาต่อจาน (หน่วยบาท) — unit_price_satang รวมราคา option มาแล้วตอนเพิ่มลงตะกร้า
        const price = item.unit_price_satang / 100;

        // หมายเหตุ = ชื่อตัวเลือก + note ที่ลูกค้าพิมพ์
        const optionNames = item.options.map((o) => o.option_name_snapshot);
        const note = [...optionNames, item.note].filter(Boolean).join(', ');

        return {
          id: item.order_item_id.toString(),
          name: item.name,
          note,
          price,
          qty: item.quantity,
        };
      }),
    };
  });
}

// คำนวณยอดเงินทั้งบิล (หน่วยบาท)
export function calcBillTotals(orders) {
  let subtotal = 0;
  for (const round of orders) {
    for (const item of round.items) {
      subtotal += item.price * item.qty;
    }
  }
  const service = Math.round(subtotal * 0.10);
  const vat = Math.round(subtotal * 0.07);
  const total = subtotal + service + vat;
  return { subtotal, service, vat, total };
}
