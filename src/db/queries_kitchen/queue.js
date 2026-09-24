// วางไฟล์นี้ไว้ที่: src/db/queries_kitchen/queue.js
// ตอนนี้เป็น MOCK ล้วน ๆ (ไม่แตะ SQLite จริง) เพื่อเอาไว้เดินหน้า UI ของ OrderKitScreen ก่อน
// ทุกฟังก์ชัน export ออกไปมี signature เดียวกับของจริง (db, ...args) => Promise<...>
// เพื่อให้ภายหลังสลับไปต่อ useSQLiteContext จริงได้โดยไม่ต้องแก้ OrderKitScreen.js

function minutesAgoISO(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function timeLabel(minutesAgo) {
  const d = new Date(Date.now() - minutesAgo * 60000);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// ---- Mock state ในหน่วยความจำ (reset ทุกครั้งที่ reload app) ----
let mockRounds = [
  {
    round_id: 'r1',
    table_number: 4,
    round_number: 2,
    bill_code: 'A-1039',
    order_time: minutesAgoISO(23),
    order_time_label: timeLabel(23),
    items: [
      {
        item_id: 'i1',
        quantity: 2,
        name: 'ผัดกะเพราหมูสับ',
        modifiers: ['พิเศษ · ไข่ดาว'],
        note: 'ไม่ใส่ผัก เผ็ดน้อย แยกข้าว',
        status: 'cooking',
        status_time: timeLabel(18),
      },
      {
        item_id: 'i2',
        quantity: 1,
        name: 'ต้มยำกุ้งน้ำข้น',
        modifiers: ['ธรรมดา'],
        note: '',
        status: 'waiting',
        status_time: null,
      },
      {
        item_id: 'i3',
        quantity: 4,
        name: 'ข้าวสวย',
        modifiers: [],
        note: '',
        status: 'served',
        status_time: timeLabel(20),
      },
    ],
  },
  {
    round_id: 'r2',
    table_number: 7,
    round_number: 1,
    bill_code: 'A-1042',
    order_time: minutesAgoISO(17),
    order_time_label: timeLabel(17),
    items: [
      {
        item_id: 'i4',
        quantity: 1,
        name: 'ยำวุ้นเส้นทะเล',
        modifiers: ['เผ็ดกลาง'],
        note: 'ไม่ใส่ผักชี',
        status: 'waiting',
        status_time: null,
      },
      {
        item_id: 'i5',
        quantity: 2,
        name: 'ปีกไก่ทอดน้ำปลา',
        modifiers: [],
        note: '',
        status: 'cooking',
        status_time: timeLabel(14),
      },
    ],
  },
  {
    round_id: 'r3',
    table_number: 5,
    round_number: 2,
    bill_code: 'A-1044',
    order_time: minutesAgoISO(12),
    order_time_label: timeLabel(12),
    items: [
      {
        item_id: 'i6',
        quantity: 2,
        name: 'ข้าวผัดกุ้ง',
        modifiers: ['ไม่ใส่หอมใหญ่'],
        note: '',
        status: 'waiting',
        status_time: null,
      },
      {
        item_id: 'i7',
        quantity: 1,
        name: 'คะน้าน้ำมันหอย',
        modifiers: ['ใส่หมูกรอบ'],
        note: '',
        status: 'waiting',
        status_time: null,
      },
      {
        item_id: 'i8',
        quantity: 3,
        name: 'ชามะนาว',
        modifiers: ['หวานน้อย'],
        note: '',
        status: 'waiting',
        status_time: null,
      },
    ],
  },
  {
    round_id: 'r6',
    table_number: 9,
    round_number: 1,
    bill_code: 'A-1031',
    order_time: minutesAgoISO(28),
    order_time_label: timeLabel(28),
    items: [
      {
        item_id: 'i9',
        quantity: 1,
        name: 'ส้มตำไทย',
        modifiers: ['เผ็ดมาก'],
        note: 'ไม่ใส่ถั่วลิสง',
        status: 'served',
        status_time: timeLabel(20),
      },
      {
        item_id: 'i10',
        quantity: 2,
        name: 'ไก่ย่าง',
        modifiers: [],
        note: '',
        status: 'served',
        status_time: timeLabel(16),
      },
      {
        item_id: 'i11',
        quantity: 1,
        name: 'ข้าวเหนียว',
        modifiers: [],
        note: '',
        status: 'served',
        status_time: timeLabel(20),
      },
    ],
  },
  {
    round_id: 'r7',
    table_number: 2,
    round_number: 1,
    bill_code: 'A-1050',
    order_time: minutesAgoISO(5),
    order_time_label: timeLabel(5),
    items: [
      {
        item_id: 'i12',
        quantity: 1,
        name: 'แกงเขียวหวานไก่',
        modifiers: ['เพิ่มมะเขือ'],
        note: '',
        status: 'waiting',
        status_time: null,
      },
      {
        item_id: 'i13',
        quantity: 4,
        name: 'ข้าวสวย',
        modifiers: [],
        note: '',
        status: 'waiting',
        status_time: null,
      },
    ],
  },
  {
    round_id: 'r8',
    table_number: 1,
    round_number: 3,
    bill_code: 'A-1029',
    order_time: minutesAgoISO(9),
    order_time_label: timeLabel(9),
    items: [
      {
        item_id: 'i14',
        quantity: 2,
        name: 'ปลาทอดราดพริก',
        modifiers: ['เผ็ดน้อย'],
        note: 'แพ้กุ้ง',
        status: 'cooking',
        status_time: timeLabel(3),
      },
    ],
  },
];

let mockNextQueue = [
  {
    round_id: 'q1',
    table_number: 10,
    round_number: 1,
    order_time_label: '18:58',
    item_count: 4,
  },
  {
    round_id: 'q2',
    table_number: 3,
    round_number: 1,
    order_time_label: '19:01',
    item_count: 2,
  },
  {
    round_id: 'q3',
    table_number: 8,
    round_number: 2,
    order_time_label: '19:03',
    item_count: 5,
  },
  {
    round_id: 'q4',
    table_number: 6,
    round_number: 1,
    order_time_label: '19:06',
    item_count: 3,
  },
];

// ---- Query functions (mock) ----

export function getKitchenQueue(db) {
  return Promise.resolve(mockRounds);
}

export function getNextQueueRounds(db) {
  return Promise.resolve(mockNextQueue);
}

export function markRoundAsServed(db, roundId) {
  mockRounds = mockRounds.map((r) =>
    r.round_id === roundId
      ? {
          ...r,
          items: r.items.map((i) =>
            i.status !== 'served' ? { ...i, status: 'served', status_time: timeLabel(0) } : i
          ),
        }
      : r
  );
  return Promise.resolve(true);
}

export function startRoundCooking(db, roundId) {
  mockRounds = mockRounds.map((r) =>
    r.round_id === roundId
      ? {
          ...r,
          items: r.items.map((i) =>
            i.status === 'waiting' ? { ...i, status: 'cooking', status_time: timeLabel(0) } : i
          ),
        }
      : r
  );
  return Promise.resolve(true);
}

// เปลี่ยนสถานะรายการเดียว — ใช้กับปุ่ม รอทำ/กำลังทำ/เสิร์ฟแล้ว ในหน้ารายละเอียดใบออร์เดอร์
export function updateItemStatus(db, itemId, status) {
  mockRounds = mockRounds.map((r) => ({
    ...r,
    items: r.items.map((i) =>
      i.item_id === itemId
        ? { ...i, status, status_time: status === 'waiting' ? null : timeLabel(0) }
        : i
    ),
  }));
  return Promise.resolve(true);
}

// ---- ประวัติที่เสิร์ฟแล้ว / รายการที่ถูกยกเลิก (mock) ----
// ใช้กับปุ่มท้ายจอ "ประวัติที่เสิร์ฟแล้ว" และ "รายการที่ถูกยกเลิก"

const mockServedHistory = [
  {
    round_id: 'h1',
    table_number: 2,
    round_number: 1,
    item_count: 3,
    served_time_label: timeLabel(35),
  },
  {
    round_id: 'h2',
    table_number: 6,
    round_number: 2,
    item_count: 2,
    served_time_label: timeLabel(50),
  },
  {
    round_id: 'h3',
    table_number: 9,
    round_number: 1,
    item_count: 3,
    served_time_label: timeLabel(16),
  },
  {
    round_id: 'h4',
    table_number: 11,
    round_number: 1,
    item_count: 4,
    served_time_label: timeLabel(70),
  },
];

let mockCancelledItems = [
  {
    id: 'c1',
    table_number: 7,
    round_number: 1,
    name: 'ยำวุ้นเส้นทะเล',
    quantity: 1,
    cancelled_time_label: timeLabel(8),
    reason: 'ลูกค้าขอยกเลิก',
  },
  {
    id: 'c2',
    table_number: 1,
    round_number: 2,
    name: 'ต้มยำกุ้ง',
    quantity: 1,
    cancelled_time_label: timeLabel(25),
    reason: 'ของหมด',
  },
  {
    id: 'c3',
    table_number: 5,
    round_number: 1,
    name: 'น้ำมะนาวโซดา',
    quantity: 2,
    cancelled_time_label: timeLabel(40),
    reason: 'สั่งซ้ำโดยพนักงาน',
  },
];

export function getServedHistory(db) {
  return Promise.resolve(mockServedHistory);
}

export function getCancelledItems(db) {
  return Promise.resolve(mockCancelledItems);
}

// ยกเลิกรายการ — อนุญาตเฉพาะรายการที่ยังเป็น 'waiting' เท่านั้น (ตามกฎการยกเลิก)
// ตัดออกจากใบออร์เดอร์ (mockRounds) แล้วบันทึกเข้า log ยกเลิก (mockCancelledItems)
export function cancelItem(db, itemId, reason) {
  let cancelledRecord = null;

  mockRounds = mockRounds.map((r) => {
    const target = r.items.find((i) => i.item_id === itemId);
    if (!target) return r;
    if (target.status !== 'waiting') {
      // กันพลาด: ยกเลิกได้เฉพาะรายการที่ยังรอทำเท่านั้น
      return r;
    }
    cancelledRecord = {
      id: `c_${itemId}_${Date.now()}`,
      table_number: r.table_number,
      round_number: r.round_number,
      name: target.name,
      quantity: target.quantity,
      cancelled_time_label: timeLabel(0),
      reason,
    };
    return { ...r, items: r.items.filter((i) => i.item_id !== itemId) };
  });

  if (cancelledRecord) {
    mockCancelledItems = [cancelledRecord, ...mockCancelledItems];
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}