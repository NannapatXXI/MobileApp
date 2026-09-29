// src/utils/time.js
// ตัวช่วยเรื่องเวลาที่ใช้ร่วมกันทุกจอ (ทั้งฝั่งลูกค้าและฝั่งครัว)
//
// ปัญหาที่ต้องระวัง: เวลาที่ SQLite เก็บไว้เป็น UTC เสมอ (datetime('now') -> '2026-09-20 07:54:02')
// แต่ร้านอยู่ไทย (UTC+7 ไม่มี DST) ถ้าเอาไป new Date(...) ตรงๆ เวลาจะเพี้ยนตามโซนเวลาของเครื่อง
// ไฟล์นี้จึงเป็นที่เดียวที่แปลงเวลา โดยอ่านค่าผ่าน getUTCxxx เสมอ ไม่พึ่ง timezone ของเครื่อง
// ทั้งเวลาในอดีต (ที่ส่งมา/บันทึกไว้ใน DB) และเวลาปัจจุบัน (Now Date) ใช้เกณฑ์เดียวกัน

export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // ไทย = UTC+7 เสมอ

// เวลาในรูปแบบ SQLite ('YYYY-MM-DD HH:MM:SS' = UTC) -> epoch ms (เทียบกับ Date.now() ได้ตรงๆ)
export function parseSqliteTime(utcText) {
  if (!utcText) return null;
  const ms = Date.parse(`${String(utcText).replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : ms;
}

// epoch ms -> Date ที่ชี้เวลาไทย (อ่านค่าด้วย getUTCxxx)
function bangkokDate(ms) {
  return new Date(ms + BANGKOK_OFFSET_MS);
}

function clockText(ms, withSeconds) {
  const t = bangkokDate(ms);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  const ss = String(t.getUTCSeconds()).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

// "เวลาปัจจุบัน" (Now Date) ในรูปแบบเวลาไทย — ใช้กับ state ที่อัปเดตทุกวินาที
export function formatNowHM(nowMs = Date.now()) {
  return clockText(nowMs, false);
}

export function formatNowHMS(nowMs = Date.now()) {
  return clockText(nowMs, true);
}

// เวลาไทยของค่าที่เก็บใน DB (ordered_at / started_at / served_at / cancelled_at)
export function formatBangkokHM(utcText) {
  const ms = parseSqliteTime(utcText);
  return ms === null ? '-' : clockText(ms, false);
}

export function formatBangkokHMS(utcText) {
  const ms = parseSqliteTime(utcText);
  return ms === null ? '-' : clockText(ms, true);
}

// นาฬิกาปัจจุบัน + วันที่ไทย ใช้ในหน้าเลือกโต๊ะ/หน้าครัว
export function formatBangkokDate(ms = Date.now()) {
  const t = bangkokDate(ms);
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  return `${days[t.getUTCDay()]} ${t.getUTCDate()} ${months[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
}

// ผ่านไปกี่นาทีแล้วนับจากเวลาที่บันทึกไว้ (ใช้นับคิวค้างในจอครัว)
// รับ nowMs เข้ามาเพื่อให้หน้าจอที่มีนาฬิกาเรียกรอบเดียวกันทั้งหมดใช้ "ตอนนี้" เดียวกัน
export function getWaitMinutes(utcText, nowMs = Date.now()) {
  const ms = parseSqliteTime(utcText);
  if (ms === null) return 0;
  return Math.max(0, Math.round((nowMs - ms) / 60000));
}
