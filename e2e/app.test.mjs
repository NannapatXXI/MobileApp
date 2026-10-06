// e2e/app.test.mjs
// เทสอัตโนมัติด้วย Appium + WebdriverIO ตามข้อกำหนดระดับ ก (ก1–ก10) + ข2
//
// ติดตั้งครั้งเดียว:   npm install --save-dev webdriverio
// ก่อนรันต้องเปิดค้างไว้:
//   1. Android emulator (แท็บเล็ต)
//   2. แอปเปิดอยู่ที่หน้า "เลือกโต๊ะ" (ผ่าน Expo Go หรือ npm run android ก็ได้)
//   3. Appium:  appium
// แล้วรัน:  node e2e/app.test.mjs
//
// ⚠️ เทสจะกด "ล้างข้อมูลการขาย" ก่อนเริ่ม (บิลทั้งหมดหาย เมนู/โต๊ะไม่หาย)
//
// เทสนี้เป็น "flow ต่อเนื่อง" เหมือนลูกค้าใช้จริง 1 รอบ:
//   เปิดบิลโต๊ะ 3 → สั่ง 2 รอบ → ดูสรุปบิล → โต๊ะ 4 สั่ง 1 รอบ
//   → ครัวดูคิว/เปลี่ยนสถานะ → ปิดบิลโต๊ะ 3 → เปิดบิลใหม่ได้ → ดูบิลย้อนหลัง
// ขั้นหลังใช้ผลจากขั้นก่อน ถ้าขั้นไหนพัง จะหยุดทันที (ขั้นที่เหลือจะพังตามอยู่แล้ว)

import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  logLevel: 'error',
  capabilities: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    // ไม่ระบุ appPackage → Appium จับหน้าจอที่เปิดอยู่ตอนนี้
    // ใช้ได้ทั้ง Expo Go และแอปที่ build เอง
    'appium:noReset': true,
    'appium:autoLaunch': false,
  },
});

// ---------------------------------------------------------------------------
// ตัวช่วยหา element
// ---------------------------------------------------------------------------

// testID ใน React Native = resource-id ใน Android
// ใช้ resourceIdMatches เพราะบางเครื่องเติมชื่อ package ข้างหน้า
function idSelector(id) {
  return `new UiSelector().resourceIdMatches(".*${id}$")`;
}

// หา element จาก testID (ถ้าอยู่นอกจอ เลื่อนหาให้)
async function byId(id) {
  const el = await driver.$(`android=${idSelector(id)}`);
  if (await el.isExisting()) return el;
  return driver.$(
    `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(${idSelector(id)})`
  );
}

// ใช้ $$ (หาทุกตัว) แล้วดูว่าเจออย่างน้อย 1 ตัวไหม
// ถ้าใช้ $ แล้วเจอหลายตัว WebdriverIO รุ่นใหม่จะ error (strict mode)
async function idExists(id) {
  const els = await driver.$$(`android=${idSelector(id)}`);
  return els.length > 0;
}

// มีข้อความนี้บนจอไหม (มีคำนี้อยู่ข้างในก็พอ / เลื่อนหาให้)
// ข้อความเดียวกันอาจขึ้นหลายที่ เช่น "ปิดแล้ว" ในการ์ดสถิติ + ป้ายบิล จึงใช้ $$
async function hasText(text) {
  const els = await driver.$$(`android=new UiSelector().textContains("${text}")`);
  if (els.length > 0) return true;
  try {
    const scrolled = await driver.$(
      `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("${text}"))`
    );
    return await scrolled.isExisting();
  } catch {
    return false;
  }
}

async function tapId(id) {
  await (await byId(id)).click();
  await driver.pause(700); // รอหน้าจออัปเดต / เปลี่ยนหน้า
}

// กดข้อความตัวแรกที่เจอ (ถ้ามีหลายตัว กดตัวบนสุด)
async function tapText(text) {
  const els = await driver.$$(`android=new UiSelector().textContains("${text}")`);
  if (els.length === 0) throw new Error(`หาข้อความ "${text}" ไม่เจอ`);
  await els[0].click();
  await driver.pause(700);
}

async function textOf(id) {
  return (await byId(id)).getText();
}

// "฿1,234" / "155 บาท" → 1234 / 155
function toNumber(text) {
  return Number(String(text).replace(/[^\d.]/g, ''));
}

// กดปุ่มฝั่งยืนยันของ Alert (ปุ่มขวาสุด เช่น "ล้างข้อมูล" / "ปิดบิล" / "OK")
// ปุ่มใน Alert ของ Android ไม่มี testID แต่มี id ของระบบเป็น android:id/button1
async function confirmAlert() {
  await driver.$(`android=${idSelector('android:id/button1')}`).click();
  await driver.pause(700);
}

// กลับไปหน้าเลือกโต๊ะ ไม่ว่าตอนนี้แอปค้างอยู่หน้าไหน
// (เช่น รอบก่อนเทสจบที่หน้าสรุปยอดขาย) — กดปุ่ม Back ของ Android ไปเรื่อยๆ จนเจอปุ่มล้างข้อมูล
// เช็คก่อนกดทุกครั้ง เพราะถ้ากด Back ตอนอยู่หน้าเลือกโต๊ะแล้ว แอปจะถูกปิด
async function goToSelectTable() {
  for (let i = 0; i < 10; i++) {
    if (await idExists('btn-reset')) return;
    await driver.back();
    await driver.pause(700);
  }
  throw new Error('กด Back 10 ครั้งแล้วยังไม่เจอหน้าเลือกโต๊ะ (แอปถูกปิดไปหรือยังไม่ reload หลังใส่ testID)');
}

async function hideKeyboard() {
  try {
    await driver.hideKeyboard();
  } catch {
    // ไม่มีคีย์บอร์ดเปิดอยู่
  }
}

// ---------------------------------------------------------------------------
// ตัวรันเทส
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let stopped = false;

async function step(name, fn) {
  if (stopped) {
    console.log(`⏭️  SKIP  ${name}`);
    return;
  }
  try {
    await fn();
    passed++;
    console.log(`✅ PASS  ${name}`);
  } catch (e) {
    failed++;
    stopped = true;
    console.log(`❌ FAIL  ${name}`);
    console.log(`         → ${e.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// ค่าที่ขั้นก่อนหน้าส่งต่อให้ขั้นหลัง
const ctx = {
  billId: null,      // เลขบิลของโต๊ะ 3
  round1Total: 0,    // ยอดรอบ 1 (บาท) อ่านจากตะกร้า
  round2Total: 0,    // ยอดรอบ 2 (บาท)
};

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
try {
  await step('เตรียม: อยู่หน้าเลือกโต๊ะ แล้วล้างข้อมูลการขาย', async () => {
    await goToSelectTable();
    await tapId('btn-reset');
    await confirmAlert(); // ปุ่ม "ล้างข้อมูล"
    expect(await hasText('มีบิลค้าง 0'), 'ล้างแล้วยังมีบิลค้างอยู่');
  });

  // ----- ฝั่งลูกค้า -----

  await step('ก1 เลือกโต๊ะ 3 แล้วเปิดบิลใหม่', async () => {
    await tapId('table-3');
    await tapId('btn-open-bill');
    expect(await hasText('TBL - 3'), 'ไม่ได้เข้าหน้าเมนูของโต๊ะ 3');
    expect((await textOf('text-cart-title')).includes('รอบที่ 1'), 'บิลใหม่ต้องเริ่มที่รอบที่ 1');
  });

  await step('ก2 เมนูแบ่ง ≥4 หมวด หมวดละ ≥5 รายการ รวม ≥25', async () => {
    let total = 0;
    for (const categoryId of [1, 2, 3, 4]) {
      await tapId(`category-${categoryId}`);
      const count = toNumber(await textOf('text-menu-count'));
      expect(count >= 5, `หมวดที่ ${categoryId} มีแค่ ${count} รายการ`);
      total += count;
    }
    expect(total >= 25, `รวมทุกหมวดได้แค่ ${total} รายการ`);
  });

  await step('ข2 ค้นหาเมนูจากชื่อ', async () => {
    await tapId('category-1');
    const search = await byId('input-search');
    await search.setValue('กะเพรา');
    await hideKeyboard();
    await driver.pause(500);
    expect(await hasText('กะเพราหมูสับ'), 'ค้นหา "กะเพรา" แล้วไม่เจอกะเพราหมูสับ');
    expect(!(await hasText('ผัดไทยกุ้งสด')), 'ค้นหา "กะเพรา" แต่ยังเห็นผัดไทยกุ้งสด');
    await search.clearValue();
    await hideKeyboard();
    await driver.pause(500);
  });

  await step('ก3 เลือกจำนวน + ตัวเลือก + ใส่หมายเหตุ', async () => {
    await tapId('category-1');
    await tapId('add-item-1');                 // กะเพราหมูสับ
    await tapText('ไข่ดาว');                   // ตัวเลือกเพิ่มเติม
    await tapId('btn-qty-plus');               // จำนวน 1 → 2
    await (await byId('input-note')).setValue('ไม่ใส่ผัก');
    await hideKeyboard();
    await tapId('btn-add-to-cart');

    expect(await hasText('2× กะเพราหมูสับ'), 'ตะกร้าไม่มี 2× กะเพราหมูสับ');
    expect(await hasText('ไข่ดาว'), 'ตะกร้าไม่แสดงตัวเลือกไข่ดาว');
    expect(await hasText('ไม่ใส่ผัก'), 'ตะกร้าไม่แสดงหมายเหตุ');
    ctx.round1Total = toNumber(await textOf('text-round-total'));
    expect(ctx.round1Total > 0, 'ยอดรอบนี้เป็น 0');
  });

  await step('ก4 ตรวจรายการ แล้วส่งเข้าครัวเป็นรอบที่ 1', async () => {
    await tapId('btn-review');
    expect(await hasText('ตรวจรายการก่อนส่งครัว'), 'ไม่ได้เข้าหน้าตรวจรายการ');
    expect(await hasText('กะเพราหมูสับ'), 'หน้าตรวจรายการไม่มีกะเพราหมูสับ');

    await tapId('btn-submit-kitchen');
    await driver.pause(800);
    expect(await hasText('ส่งเข้าครัวแล้ว'), 'ส่งแล้วไม่ไปหน้าส่งเข้าครัวแล้ว');

    const info = await textOf('text-send-info'); // "รอบที่ : 1    ส่ง: 22:03  โต๊ะ: 3  บิล: 7"
    expect(info.includes('รอบที่ : 1'), `ข้อมูลหัวจอไม่ใช่รอบที่ 1 (${info})`);
    expect(info.includes('โต๊ะ: 3'), `ข้อมูลหัวจอไม่ใช่โต๊ะ 3 (${info})`);
    ctx.billId = toNumber(info.split('บิล:')[1]);
    expect(ctx.billId > 0, 'อ่านเลขบิลไม่ได้');
  });

  await step('ก5 สั่งเพิ่มเป็นรอบที่ 2 ในบิลเดิม รอบแรกยังอยู่ครบ', async () => {
    await tapId('btn-order-more');
    expect((await textOf('text-cart-title')).includes('รอบที่ 2'), 'ตะกร้าไม่ขึ้นเป็นรอบที่ 2');

    await tapId('category-4');
    await tapId('add-item-21');                // น้ำเปล่า
    await tapId('btn-add-to-cart');
    ctx.round2Total = toNumber(await textOf('text-round-total'));

    await tapId('btn-review');
    await tapId('btn-submit-kitchen');
    await driver.pause(800);

    const info = await textOf('text-send-info');
    expect(info.includes('รอบที่ : 2'), `หลังส่งต้องเป็นรอบที่ 2 (${info})`);
    expect(info.includes(`บิล: ${ctx.billId}`), 'รอบที่ 2 ไม่ได้อยู่ในบิลเดิม');
    expect(await hasText('รอบที่ 1  เวลา'), 'รอบที่ 1 หายไป');
    expect(await hasText('รอบที่ 2  เวลา'), 'ไม่เห็นการ์ดรอบที่ 2');

    const billTotal = toNumber(await textOf('text-bill-total'));
    const expected = ctx.round1Total + ctx.round2Total;
    expect(billTotal === expected, `ยอดบิลสะสม ${billTotal} ไม่เท่ากับรอบ1+รอบ2 = ${expected}`);
  });

  await step('ก6 สรุปบิล: เห็นทุกรอบ รายการ จำนวน ราคา และยอดรวมทั้งบิล', async () => {
    await tapId('btn-see-summary');
    expect(await hasText(`สรุปบิล #${ctx.billId}`), 'ไม่ได้เข้าหน้าสรุปบิลของบิลนี้');
    expect(await hasText('2 รอบ'), 'สรุปบิลไม่ได้บอกว่ามี 2 รอบ');
    expect(await hasText('กะเพราหมูสับ'), 'สรุปบิลไม่มีกะเพราหมูสับ');
    expect(await hasText('น้ำเปล่า'), 'สรุปบิลไม่มีน้ำเปล่า');

    // ราคาต่อหน่วยของกะเพรา = ยอดรอบ 1 ÷ 2 จาน / ราคารวมของรายการ = ยอดรอบ 1
    const unitPrice = ctx.round1Total / 2;
    expect(await hasText(`฿${unitPrice.toLocaleString()}`), `ไม่เห็นราคาต่อหน่วย ฿${unitPrice}`);
    expect(await hasText(`฿${ctx.round1Total.toLocaleString()}`), `ไม่เห็นราคารวมของรายการ ฿${ctx.round1Total}`);

    const subtotal = toNumber(await textOf('text-subtotal'));
    const expectedSubtotal = ctx.round1Total + ctx.round2Total;
    expect(subtotal === expectedSubtotal, `รวมค่าอาหาร ${subtotal} ≠ ${expectedSubtotal}`);

    // สูตรเดียวกับ getBillTotals (SQL): คิดเป็นสตางค์ ค่าบริการ 10% + VAT 7% ปัดเป็นสตางค์ทีละตัว
    const subtotalSatang = Math.round(subtotal * 100);
    const expectedTotal =
      (subtotalSatang + Math.round(subtotalSatang * 0.10) + Math.round(subtotalSatang * 0.07)) / 100;
    const grandTotal = toNumber(await textOf('text-grand-total'));
    expect(grandTotal === expectedTotal, `ยอดรวมทั้งบิล ${grandTotal} ≠ ${expectedTotal}`);
  });

  await step('เตรียม: โต๊ะ 4 สั่ง 1 รอบ (สั่งทีหลังโต๊ะ 3)', async () => {
    await driver.back();                       // สรุปบิล → หน้าส่งเข้าครัวแล้ว
    await tapId('btn-home');
    await tapId('table-4');
    await tapId('btn-open-bill');
    await tapId('category-1');
    await tapId('add-item-3');                 // ผัดไทยกุ้งสด
    await tapId('btn-add-to-cart');
    await tapId('btn-review');
    await tapId('btn-submit-kitchen');
    await driver.pause(800);
    expect((await textOf('text-send-info')).includes('โต๊ะ: 4'), 'โต๊ะ 4 ส่งเข้าครัวไม่สำเร็จ');
    await tapId('btn-home');
  });

  // ----- ฝั่งครัว -----

  await step('ก7 คิวครัวเรียงตามเวลาที่สั่ง เก่าสุดขึ้นก่อน', async () => {
    await tapId('btn-staff');
    await tapId('staff-mode-kitchen');
    await tapId('filter-all');

    const cards = await driver.$$(`android=${idSelector('kitchen-card-table')}`);
    const tables = [];
    for (const card of cards) tables.push(await card.getText());
    // คาดหวัง: [โต๊ะ 3 (รอบ1), โต๊ะ 3 (รอบ2), โต๊ะ 4]
    expect(tables[0] === 'โต๊ะ 3', `การ์ดแรกควรเป็นโต๊ะ 3 แต่ได้ ${tables.join(', ')}`);
    expect(tables.indexOf('โต๊ะ 4') > tables.indexOf('โต๊ะ 3'), `โต๊ะ 4 ขึ้นก่อนโต๊ะ 3 (${tables.join(', ')})`);
  });

  await step('ก9 ครัวเห็นว่ามาจากโต๊ะไหน รอบที่เท่าไร และหมายเหตุ', async () => {
    expect(await hasText(`รอบที่ 1 · บิล #${ctx.billId}`), 'การ์ดไม่บอกรอบที่ 1 ของบิลนี้');
    expect(await hasText(`รอบที่ 2 · บิล #${ctx.billId}`), 'การ์ดไม่บอกรอบที่ 2 ของบิลนี้');
    expect(await hasText('ไม่ใส่ผัก'), 'การ์ดไม่แสดงหมายเหตุ');
  });

  await step('ก10 (กันพลาด) ปิดบิลที่ครัวยังไม่เสิร์ฟไม่ได้', async () => {
    await tapId('btn-open-close-bill');
    await tapId('close-bill-t3');
    expect(await hasText('ยังปิดบิลไม่ได้'), 'ปิดบิลได้ทั้งที่ยังมีรายการรอทำ');
    await confirmAlert();                      // ปุ่ม OK
    await tapId('btn-modal-close');
  });

  await step('ก8 เปลี่ยนสถานะ รอทำ → กำลังทำ → เสิร์ฟแล้ว', async () => {
    // ดูจากข้อความบนปุ่มล่างการ์ด เพราะคำว่า "รอทำ/กำลังทำ" ซ้ำกับแท็บกรองด้านบน
    //   ทั้งใบรอทำ    → ปุ่ม "เริ่มทำทั้งใบ"
    //   ทั้งใบกำลังทำ → ปุ่ม "เสิร์ฟแล้วทั้งใบ"
    //   เสิร์ฟครบ     → ปุ่ม "เสิร์ฟครบแล้ว"
    // testID อยู่ที่ตัวปุ่ม (Pressable) ข้อความอยู่ใน Text ลูกข้างใน จึงหา TextView ในปุ่มอีกที
    const button = async () => {
      const pressable = await byId('round-action-t3-r1');
      return pressable.$('android.widget.TextView').getText();
    };

    expect((await button()) === 'เริ่มทำทั้งใบ', `ตอนแรกควรเป็น "รอทำ" (ปุ่ม: ${await button()})`);

    await tapId('round-action-t3-r1');
    expect((await button()) === 'เสิร์ฟแล้วทั้งใบ', `กดแล้วควรเป็น "กำลังทำ" (ปุ่ม: ${await button()})`);

    await tapId('round-action-t3-r1');
    expect((await button()) === 'เสิร์ฟครบแล้ว', `กดแล้วควรเป็น "เสิร์ฟแล้ว" (ปุ่ม: ${await button()})`);

    // รอบ 2 ของโต๊ะ 3 ให้เสิร์ฟครบด้วย จะได้ปิดบิลได้ในขั้นต่อไป
    await tapId('round-action-t3-r2');
    await tapId('round-action-t3-r2');
  });

  await step('ก10 ปิดบิลโต๊ะ 3 (เสิร์ฟครบแล้ว)', async () => {
    await tapId('btn-open-close-bill');
    await tapId('close-bill-t3');
    expect(await hasText('ปิดบิล?'), 'ไม่ขึ้นหน้าต่างยืนยันปิดบิล');
    await confirmAlert();                      // ปุ่ม "ปิดบิล"
    expect(!(await idExists('close-bill-t3')), 'ปิดแล้วบิลโต๊ะ 3 ยังอยู่ในรายการบิลที่เปิด');
    expect(await idExists('close-bill-t4'), 'บิลโต๊ะ 4 ต้องยังเปิดอยู่');
    await tapId('btn-modal-close');
  });

  await step('ก10 หลังปิดแล้ว โต๊ะ 3 เปิดบิลใหม่ได้', async () => {
    await tapId('btn-kitchen-home');
    expect(await hasText('มีบิลค้าง 1'), 'ควรเหลือบิลค้างแค่โต๊ะ 4');
    await tapId('table-3');
    await tapId('btn-open-bill');
    expect(await hasText('TBL - 3'), 'เปิดบิลใหม่ให้โต๊ะ 3 ไม่ได้');
    expect((await textOf('text-cart-title')).includes('รอบที่ 1'), 'บิลใหม่ต้องเริ่มรอบที่ 1 ไม่ใช่ต่อจากบิลเก่า');
    await tapText('กลับไปหน้าเลือกโต๊ะ');
  });

  await step('ก10 บิลเก่ายังเรียกดูย้อนหลังได้', async () => {
    await tapId('btn-staff');
    await tapId('staff-mode-manage');
    await tapText('บิลทั้งร้าน');
    await driver.pause(1000);
    expect(await hasText('ปิดแล้ว'), 'หน้าสรุปไม่มีบิลที่ปิดแล้ว');
    expect(await hasText('ยังเปิด'), 'หน้าสรุปไม่มีบิลที่ยังเปิด (โต๊ะ 4)');
  });

  // จบเทสแล้วพากลับหน้าเลือกโต๊ะ รอบหน้ารันต่อได้เลย
  await step('เก็บกวาด: กลับหน้าเลือกโต๊ะ', async () => {
    await goToSelectTable();
  });
} finally {
  console.log(`\nสรุป: ผ่าน ${passed} / ไม่ผ่าน ${failed}`);
  await driver.deleteSession();
}
