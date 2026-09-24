// src/db/mockDb.js
// ฐานข้อมูลจำลอง (mock) หน้าตาเหมือน db จริง: มี "ตาราง" ชื่อและคอลัมน์ตรงกับ db/schema.js
//   categories, menu_items, menu_options, restaurant_tables,
//   bills, order_rounds, order_items, order_item_options
// แล้วมีฟังก์ชันคิวรีที่คืนรูปแบบผลลัพธ์เดียวกับ Salesqueries.js (เงินเป็นสตางค์)
//
// ฟังก์ชันที่ส่งออกมี signature เหมือน src/db/salesDb.js (SQL จริง) ทุกตัว
// ตอนต่อ db จริง แค่เปลี่ยนบรรทัด import ใน Salesqueries.js โดยไม่ต้องแก้หน้าจอ
//
// ข้อมูลบิลสร้างย้อนหลัง MOCK_MONTHS เดือนนับจาก "วันนี้ (เวลาไทย)"
// ทุกเดือนมีข้อมูลครบทุกวันตามปฏิทินจริง (30/31 วัน, กุมภาพันธ์ 28 วัน และ 29 วันในปีอธิกสุรทิน)
// ยกเว้นเดือนปัจจุบันที่มีถึงวันนี้เท่านั้น
// ใช้ตัวสุ่มที่คงที่ → ได้ชุดเดิมทุกครั้ง
// เวลาเก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS' เหมือน datetime('now') ใน SQLite
// แล้วแปลงเป็นเวลาไทยด้วย +7 ชั่วโมงตอนคิวรี เหมือนที่ SQL ทำ

export const MOCK_MONTHS = 12; // ย้อนหลังกี่เดือน (รวมเดือนนี้)
const OFFSET_MS = 7 * 3600 * 1000;

// ---------------------------------------------------------------------------
// ตารางคงที่ (ตรงกับ seed ใน db/schema.js — id เรียงตามลำดับที่ insert)
// ---------------------------------------------------------------------------
const CATEGORY_NAMES = ['ของคาว', 'ทานเล่น', 'ของหวาน', 'เครื่องดื่ม'];
const categories = CATEGORY_NAMES.map((name, i) => ({ category_id: i + 1, name }));

// [category_id, name, price_satang]
const MENU = [
  [1, 'กะเพราหมูสับ', 6000], [1, 'กะเพราไก่', 6000], [1, 'ผัดไทยกุ้งสด', 6500], [1, 'ข้าวผัดปู', 8000],
  [1, 'แกงเขียวหวานไก่', 6500], [1, 'ต้มยำกุ้งน้ำข้น', 9000], [1, 'ข้าวมันไก่', 5500], [1, 'ผัดซีอิ๊วหมู', 5500],
  [2, 'ปอเปี๊ยะทอด', 4000], [2, 'ไก่ทอดหาดใหญ่', 5500], [2, 'เกี๊ยวซ่าหมู', 5000],
  [2, 'ส้มตำไทย', 4500], [2, 'ไข่เจียวหมูสับ', 4000], [2, 'ปีกไก่ทอดน้ำปลา', 6000],
  [3, 'ข้าวเหนียวมะม่วง', 7000], [3, 'บัวลอยไข่หวาน', 3500], [3, 'ทับทิมกรอบ', 3500],
  [3, 'ไอศกรีมกะทิ', 4000], [3, 'กล้วยบวชชี', 3000], [3, 'เฉาก๊วยนมสด', 3500],
  [4, 'น้ำเปล่า', 1500], [4, 'ชาไทยเย็น', 3000], [4, 'น้ำมะนาวโซดา', 3500],
  [4, 'กาแฟเย็น', 3500], [4, 'น้ำอัดลม', 2000], [4, 'น้ำส้มคั้นสด', 4000],
];
const menu_items = MENU.map(([category_id, name, price_satang], i) => ({
  item_id: i + 1, category_id, name, price_satang, is_available: 1,
}));

// ตัวเลือกแบบ "เพิ่มเติม" (multiple) ตาม seed — [item_id, name, price_delta_satang]
const EXTRA_OPTIONS = [
  [1, 'ไข่ดาว', 1000], [1, 'ไข่เจียว', 1000],
  [2, 'ไข่ดาว', 1000], [2, 'ไข่เจียว', 1000],
  [4, 'เพิ่มปู', 1000],
  [7, 'เพิ่มไก่', 2000],
  [22, 'หวานน้อย', 0], [22, 'ไม่ใส่น้ำแข็ง', 0],
];
const menu_options = EXTRA_OPTIONS.map(([item_id, name, price_delta_satang], i) => ({
  option_id: i + 1, item_id, name, price_delta_satang,
  group_name: 'เพิ่มเติม', selection_type: 'multiple', is_available: 1,
}));

const SEATS = [2, 2, 4, 4, 4, 4, 2, 6, 2, 2, 4, 8, 4, 6, 2];
const restaurant_tables = SEATS.map((seats, i) => ({ table_id: i + 1, table_number: i + 1, seats }));

// ---------------------------------------------------------------------------
// ตัวช่วยเรื่องวันที่/เวลา
// ---------------------------------------------------------------------------
function bangkokDateStr(offsetDays = 0) {
  return new Date(Date.now() + OFFSET_MS - offsetDays * 86400000).toISOString().slice(0, 10);
}
// วันที่ไทย + นาทีนับจากเที่ยงคืน → สตริง UTC แบบที่ SQLite เก็บ
function toUtcStr(dateStr, minutes) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + minutes * 60000 - OFFSET_MS;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}
function utcToBkk(utcStr) {
  return new Date(new Date(utcStr.replace(' ', 'T') + 'Z').getTime() + OFFSET_MS);
}
const bkkDateOf = (utcStr) => utcToBkk(utcStr).toISOString().slice(0, 10); // = date(x,'+7 hours')
const bkkHourOf = (utcStr) => utcToBkk(utcStr).getUTCHours();              // = strftime('%H',x,'+7 hours')
function bkkHHMM(utcStr) {
  const d = utcToBkk(utcStr);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function prevDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// สร้างตารางการขาย: bills / order_rounds / order_items / order_item_options
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORY_WEIGHT = { 1: 45, 2: 20, 3: 10, 4: 25 }; // ความนิยมของแต่ละหมวด
const HOUR_POOL = [10, 11, 11, 12, 12, 12, 13, 13, 14, 15, 17, 18, 18, 19, 19, 19, 20, 20, 21];

let _db = null;
export function getMockDb() {
  if (_db) return _db;

  const db = {
    categories, menu_items, menu_options, restaurant_tables,
    bills: [], order_rounds: [], order_items: [], order_item_options: [],
  };
  const rng = makeRng(20260924);
  const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const itemsByCat = {};
  for (const it of menu_items) (itemsByCat[it.category_id] ||= []).push(it);
  const extrasByItem = {};
  for (const o of menu_options) (extrasByItem[o.item_id] ||= []).push(o);
  const catIds = Object.keys(CATEGORY_WEIGHT).map(Number);
  const weightSum = catIds.reduce((s, c) => s + CATEGORY_WEIGHT[c], 0);
  function pickItem() {
    let r = rng() * weightSum;
    for (const c of catIds) {
      r -= CATEGORY_WEIGHT[c];
      if (r <= 0) return pick(itemsByCat[c]);
    }
    return pick(menu_items);
  }

  // รวมวันที่ทุกวันของ MOCK_MONTHS เดือนล่าสุด (เดือนนี้มีถึงวันนี้)
  function pickMockDates() {
    const today = bangkokDateStr(0);
    const [ty, tm, td] = today.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const out = [];
    for (let i = 0; i < MOCK_MONTHS; i++) {
      const total = ty * 12 + (tm - 1) - i;
      const yy = Math.floor(total / 12);
      const mm = (total % 12) + 1;
      const maxDay = i === 0 ? td : new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // จำนวนวันจริงของเดือน
      for (let d = 1; d <= maxDay; d++) out.push(`${yy}-${pad(mm)}-${pad(d)}`);
    }
    return out.sort(); // เรียงเก่า → ใหม่ เพื่อให้ bill_id เรียงตามเวลา
  }

  const nowBkk = new Date(Date.now() + OFFSET_MS);
  const nowMin = nowBkk.getUTCHours() * 60 + nowBkk.getUTCMinutes();
  let billId = 0, roundId = 0, orderItemId = 0, optRowId = 0;

  const todayStr = bangkokDateStr(0);
  for (const dateStr of pickMockDates()) {
    const isToday = dateStr === todayStr;
    if (isToday && nowMin < 10 * 60 + 30) continue; // ยังไม่ถึงเวลาเปิดร้าน
    const billCount = isToday ? randInt(5, 10) : randInt(18, 40);

    for (let n = 0; n < billCount; n++) {
      let openMin = pick(HOUR_POOL) * 60 + randInt(0, 59);
      if (isToday) openMin = randInt(10 * 60, Math.max(10 * 60, nowMin - 5));

      const roundTimes = [];
      const roundCount = randInt(1, 4);
      for (let r = 0, t = openMin; r < roundCount; r++, t += randInt(15, 30)) {
        if (isToday && t > nowMin) break;
        roundTimes.push(t);
      }
      if (roundTimes.length === 0) roundTimes.push(openMin);

      const last = roundTimes[roundTimes.length - 1];
      const isOpen = isToday && last > nowMin - 60;
      billId++;
      db.bills.push({
        bill_id: billId,
        table_id: pick(restaurant_tables).table_id,
        opened_at: toUtcStr(dateStr, openMin),
        closed_at: isOpen ? null : toUtcStr(dateStr, last + randInt(25, 50)),
        status: isOpen ? 'open' : 'closed',
        discount_satang: 0, tax_satang: 0, service_charge_satang: 0,
      });

      roundTimes.forEach((t, r) => {
        roundId++;
        const orderedAt = toUtcStr(dateStr, t);
        db.order_rounds.push({ round_id: roundId, bill_id: billId, round_number: r + 1, ordered_at: orderedAt });
        const latestRound = r === roundTimes.length - 1;
        const used = new Set();

        const lineCount = randInt(1, 4);
        for (let l = 0; l < lineCount; l++) {
          const it = pickItem();
          if (used.has(it.item_id)) continue;
          used.add(it.item_id);

          let status = 'served', cancelled_at = null;
          if (rng() < 0.03) { status = 'cancelled'; cancelled_at = orderedAt; }
          else if (isOpen && latestRound) status = pick(['pending', 'cooking', 'cooking']);

          orderItemId++;
          db.order_items.push({
            order_item_id: orderItemId, round_id: roundId, item_id: it.item_id,
            unit_price_satang: it.price_satang, quantity: randInt(1, 3),
            note: null, status, cancelled_at,
          });
          const opts = extrasByItem[it.item_id];
          if (opts && rng() < 0.25) {
            const o = pick(opts);
            optRowId++;
            db.order_item_options.push({
              order_item_option_id: optRowId, order_item_id: orderItemId, option_id: o.option_id,
              option_name_snapshot: o.name, price_delta_satang_snapshot: o.price_delta_satang,
            });
          }
        }
      });
    }
  }

  _db = db;
  return _db;
}

// ---------------------------------------------------------------------------
// "JOIN" ทุกแถวของ order_items เข้ากับบิล/รอบ/เมนู/หมวด/ตัวเลือก (เทียบเท่าชุด JOIN ใน SQL)
// ---------------------------------------------------------------------------
let _lines = null;
function lines() {
  if (_lines) return _lines;
  const db = getMockDb();
  const bills = new Map(db.bills.map((b) => [b.bill_id, b]));
  const rounds = new Map(db.order_rounds.map((r) => [r.round_id, r]));
  const items = new Map(db.menu_items.map((m) => [m.item_id, m]));
  const cats = new Map(db.categories.map((c) => [c.category_id, c]));
  const optTotal = {};
  for (const o of db.order_item_options) {
    optTotal[o.order_item_id] = (optTotal[o.order_item_id] || 0) + o.price_delta_satang_snapshot;
  }
  _lines = db.order_items.map((oi) => {
    const r = rounds.get(oi.round_id);
    const b = bills.get(r.bill_id);
    const mi = items.get(oi.item_id);
    return {
      orderItemId: oi.order_item_id,
      billId: b.bill_id,
      billDate: bkkDateOf(b.opened_at),
      roundId: r.round_id,
      roundNumber: r.round_number,
      orderedAt: r.ordered_at,
      itemId: mi.item_id,
      itemName: mi.name,
      categoryId: mi.category_id,
      categoryName: cats.get(mi.category_id).name,
      qty: oi.quantity,
      unitPrice: oi.unit_price_satang,
      note: oi.note,
      status: oi.status,
      amount: (oi.unit_price_satang + (optTotal[oi.order_item_id] || 0)) * oi.quantity,
    };
  });
  return _lines;
}

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

// ---------------------------------------------------------------------------
// คิวรี (คืนรูปแบบเดียวกับ Salesqueries.js)
// ---------------------------------------------------------------------------
function getTotalSalesForDateSync(dateStr) {
  return sum(lines().filter((l) => l.billDate === dateStr && l.status !== 'cancelled'), (l) => l.amount);
}

function getDailySummarySync(dateStr) {
  const db = getMockDb();
  const all = lines().filter((l) => l.billDate === dateStr);
  const active = all.filter((l) => l.status !== 'cancelled');
  const cancelled = all.filter((l) => l.status === 'cancelled');

  const bills = db.bills.filter((b) => bkkDateOf(b.opened_at) === dateStr);
  const billIds = new Set(bills.map((b) => b.bill_id));
  const rounds = db.order_rounds.filter((r) => billIds.has(r.bill_id)).length;

  const totalToday = sum(active, (l) => l.amount);
  const totalYesterday = getTotalSalesForDateSync(prevDate(dateStr));

  const byHour = new Map();
  for (const l of active) {
    const h = bkkHourOf(l.orderedAt);
    byHour.set(h, (byHour.get(h) || 0) + l.amount);
  }
  let bestHour = null, bestHourAmount = 0;
  for (const [h, amt] of byHour) if (amt > bestHourAmount) { bestHour = h; bestHourAmount = amt; }

  const byMenu = new Map();
  for (const l of active) byMenu.set(l.itemName, (byMenu.get(l.itemName) || 0) + l.qty);
  let bestMenuName = null, bestMenuQty = 0;
  for (const [name, qty] of byMenu) if (qty > bestMenuQty) { bestMenuName = name; bestMenuQty = qty; }

  const billCount = bills.length;
  return {
    totalSales: totalToday,
    salesChangePercent:
      totalYesterday > 0 ? Math.round(((totalToday - totalYesterday) / totalYesterday) * 100) : null,
    billCount,
    billClosed: bills.filter((b) => b.status === 'closed').length,
    billOpen: bills.filter((b) => b.status === 'open').length,
    avgPerBill: billCount > 0 ? Math.round(totalToday / billCount) : 0,
    avgRoundsPerBill: billCount > 0 ? Math.round((rounds / billCount) * 10) / 10 : 0,
    cancelledCount: cancelled.length,
    cancelledAmount: sum(cancelled, (l) => l.amount),
    bestHour,
    bestHourAmount,
    bestMenuName,
    bestMenuQty,
  };
}

function getCategoryBreakdownSync(dateStr) {
  const active = lines().filter((l) => l.billDate === dateStr && l.status !== 'cancelled');
  const byCat = new Map();
  for (const l of active) {
    const c = byCat.get(l.categoryId) || { name: l.categoryName, qty: 0, amount: 0 };
    c.qty += l.qty;
    c.amount += l.amount;
    byCat.set(l.categoryId, c);
  }
  const rows = [...byCat.values()].sort((a, b) => b.amount - a.amount);
  const grand = sum(rows, (r) => r.amount);
  return rows.map((r) => ({
    ...r,
    percent: grand > 0 ? Math.round((r.amount / grand) * 1000) / 10 : 0,
  }));
}

function getLatestBillDateSync() {
  const bills = getMockDb().bills;
  if (bills.length === 0) return null;
  const latest = bills.reduce((m, b) => (b.opened_at > m ? b.opened_at : m), bills[0].opened_at);
  return bkkDateOf(latest);
}

// บิลทั้งหมดของวันนั้น พร้อมรอบสั่งและรายการอาหาร
function getBillsForDateSync(dateStr) {
  const db = getMockDb();
  const tableNo = new Map(db.restaurant_tables.map((t) => [t.table_id, t.table_number]));
  const dayLines = lines().filter((l) => l.billDate === dateStr);

  return db.bills
    .filter((b) => bkkDateOf(b.opened_at) === dateStr)
    .sort((a, b) => (a.opened_at < b.opened_at ? -1 : 1))
    .map((b) => {
      const roundsMap = new Map();
      let total = 0;
      for (const l of dayLines.filter((x) => x.billId === b.bill_id)) {
        if (!roundsMap.has(l.roundId)) {
          roundsMap.set(l.roundId, { roundId: l.roundId, roundNumber: l.roundNumber, time: bkkHHMM(l.orderedAt), items: [] });
        }
        roundsMap.get(l.roundId).items.push({
          id: l.orderItemId, name: l.itemName, qty: l.qty, unitPrice: l.unitPrice,
          amount: l.amount, status: l.status, note: l.note,
        });
        if (l.status !== 'cancelled') total += l.amount;
      }
      return {
        billId: b.bill_id,
        tableNumber: tableNo.get(b.table_id),
        status: b.status,
        openedTime: bkkHHMM(b.opened_at),
        closedTime: b.closed_at ? bkkHHMM(b.closed_at) : null,
        rounds: [...roundsMap.values()].sort((x, y) => x.roundNumber - y.roundNumber),
        total,
      };
    });
}

// จำนวนบิลต่อวัน → { 'YYYY-MM-DD': จำนวนบิล }
function getBillCountsByDateSync() {
  const out = {};
  for (const b of getMockDb().bills) {
    const d = bkkDateOf(b.opened_at);
    out[d] = (out[d] || 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ส่วนที่ส่งออก — signature เหมือน src/db/salesDb.js (รับ db เป็นตัวแรก แต่ mock ไม่ใช้)
// ---------------------------------------------------------------------------
export const getTotalSalesForDate = async (_db, dateStr) => getTotalSalesForDateSync(dateStr);
export const getDailySummary = async (_db, dateStr) => getDailySummarySync(dateStr);
export const getCategoryBreakdown = async (_db, dateStr) => getCategoryBreakdownSync(dateStr);
export const getLatestBillDate = async (_db) => getLatestBillDateSync();
export const getBillsForDate = async (_db, dateStr) => getBillsForDateSync(dateStr);
export const getBillCountsByDate = async (_db) => getBillCountsByDateSync();