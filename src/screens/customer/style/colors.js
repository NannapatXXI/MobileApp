// src/styles/colors.js
// ชุดสี Krua Pa Noi — import แบบ: import colors, { withAlpha, alpha } from '../styles/colors';

export const colors = {
  core: {
    brandGreen: '#2F6B4F',   // ปุ่มยืนยัน, ไอคอน +, สถานะเสิร์ฟแล้ว
    darkGreen: '#16281F',    // ตัวหนังสือหลัก, ปุ่มหลัก, กรอบ iPad
    screenBg: '#FAFDF7',     // พื้นหน้าจอ
    canvasBg: '#E3EDE4',     // พื้นหลังแคนวาส
  },

  surface: {
    sidebarCard: '#EFF6ED',    // แถบข้าง/การ์ด KPI
    searchChip: '#E9F2E7',     // ช่องค้นหา, ชิปไม่ถูกเลือก, รางกราฟ
    statusGreenBg: '#E4F0E7',  // พื้นสถานะเขียวอ่อน
    cartPanel: '#F6FBF4',      // แผงตะกร้า/แผงแก้ไข
    modalBg: '#D9E7D9',        // พื้นโมดัลหน้า 03
    switchOff: '#C4D5C6',      // สวิตช์ปิด
  },

  text: {
    secondary: '#42544A',    // ข้อความรอง
    description: '#57685C',  // คำอธิบาย
    label: '#6B7C71',        // label / meta
    placeholder: '#7F9088',  // placeholder
    numberFaint: '#879891',  // ตัวเลขจาง
    muted1: '#8CA28F',
    muted2: '#5A8470',
    muted3: '#526859',
    muted4: '#5C7166',
    muted5: '#A4B6AA',
  },

  orange: {
    textDark: '#B0632F',     // บิลค้าง, หมายเหตุ, ปิดขาย
    bgLight: '#FDF3EC',      // พื้นส้มอ่อน
    brand: '#C8703A',        // a:hover, จุดสถานะ
    numberOnDark: '#E5A06A', // ตัวเลขบิลค้างบนพื้นเข้ม
  },

  mustard: {
    bg: '#8F6B21',   // ปุ่มเริ่มทำ
    text: '#FFFFFF',
  },

  red: {
    action: '#C0492F',  // ปุ่ม/ข้อความยกเลิก (จอครัว)
    bgLight: '#FBEEEA', // พื้นอ่อน
  },

  chart: ['#2F6B4F', '#3C8560', '#4E9A73', '#8F6B21', '#B0632F'],

  placeholder: ['#DCE8DA', '#CBDCC9', '#D8E5D6', '#C7D9C5'],
};

// hex (#RRGGBB) + alpha 0–1 → 'rgba(r, g, b, a)'
export function withAlpha(hex, alphaValue) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alphaValue})`;
}

export const alpha = {
  borderMin: withAlpha(colors.core.darkGreen, 0.04),   // เส้นขอบ/เงาบางสุด
  borderMid: withAlpha(colors.core.darkGreen, 0.14),   // เส้นคั่นระหว่างส่วน (การ์ด/รายการ)
  borderMax: withAlpha(colors.core.darkGreen, 0.5),    // เส้นขอบ/เงาเข้มสุด
  onDarkMin: withAlpha(colors.core.screenBg, 0.15),    // ตัวหนังสือบนพื้นเข้ม จางสุด
  onDarkMax: withAlpha(colors.core.screenBg, 0.85),    // ตัวหนังสือบนพื้นเข้ม เข้มสุด
  greenHighlight10: withAlpha(colors.core.brandGreen, 0.1),
  greenHighlight25: withAlpha(colors.core.brandGreen, 0.25),
  greenHighlight35: withAlpha(colors.core.brandGreen, 0.35),
  greenHighlight70: withAlpha(colors.core.brandGreen, 0.7),
  orangeHighlight35: withAlpha(colors.orange.brand, 0.35),
  redHighlight40: withAlpha(colors.red.action, 0.4),
};

export default colors;
