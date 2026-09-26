import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import colors, { withAlpha } from './style/colors';

// แหล่งข้อมูล — รวม Salesqueries.js มาไว้ในไฟล์นี้ (เหมือน MenuSettingsScreen)
// ตอนต่อ SQL จริง เปลี่ยนแค่ import นี้ ไฟล์ใหม่ต้องส่งออก (รับ db ตัวแรก คืน Promise):
// getDailySummary · getCategoryBreakdown · getBillsForDate (รับ db, date) ·
// getLatestBillDate(db) · getBillCountsByDate(db) → { 'YYYY-MM-DD': จำนวนบิล}  (เงินเป็นสตางค์ วันที่เวลาไทย)
import * as source from '../../db/Mocksbill/Mockdb';

// จัดกลุ่มวันที่ที่มีบิลตามเดือน → [{ month, days, bills, dates }] เดือนใหม่→เก่า วันใหม่→เก่า
async function getMonthList(db) {
  const counts = await source.getBillCountsByDate(db);
  const byMonth = new Map();
  for (const d of Object.keys(counts).sort().reverse()) {
    const month = d.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { month, days: 0, bills: 0, dates: [] });
    const m = byMonth.get(month);
    m.days += 1;
    m.bills += counts[d] || 0;
    m.dates.push(d);
  }
  return [...byMonth.values()];
}

// ---------------------------------------------------------------------------
// ค่าคงที่ + ตัวช่วยจัดรูปแบบ
// ---------------------------------------------------------------------------
const fonts = {
  serif: { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontWeight: 'bold' },
  bold: { fontWeight: '600' },
};
const border = withAlpha(colors.core.darkGreen, 0.12);

const CLOSING_TIME = '22:00'; // เวลาปิดรอบของร้าน
const DAYS_BACK = 14; // วันย้อนหลัง (ใช้ตอนยังไม่มีข้อมูลบิลเลย)
const WIDE_BREAKPOINT = 900; // เนื้อหากว้างกว่านี้ = การ์ดสถิติ 4 ใบในแถวเดียว
const SIDEBAR_WIDTH = 220;
const SIDEBAR_ITEMS = ['เมนูและราคา', 'บิลทั้งร้าน'];
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const CHART_COLORS = ['#3F6B54', '#4E8266', '#619A78', '#8A6C32', '#A8683E'];
const STATUS_LABEL = { pending: 'รอทำ', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' };
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const pad2 = (n) => String(n).padStart(2, '0');
const formatNumber = (n) => Math.round(n).toLocaleString('en-US');
const baht = (satang) => `฿${formatNumber(Math.round(satang / 100))}`;

function getBangkokDateStr(offsetDays = 0) {
  return new Date(Date.now() + BANGKOK_OFFSET_MS - offsetDays * 86400000).toISOString().slice(0, 10);
}

function formatThaiDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${THAI_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function formatThaiDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { weekday: THAI_DAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], day: `${d} ${THAI_MONTHS_SHORT[m - 1]}` };
}

function formatThaiMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return { name: THAI_MONTHS[m - 1], year: String(y + 543) };
}

// ---------------------------------------------------------------------------
// ชิ้นส่วนย่อยที่ใช้ซ้ำ
// ---------------------------------------------------------------------------

// sidebar เหมือนหน้า MenuSettings — "×" และ "เมนูและราคา" กลับไปหน้าตั้งค่าเมนู
function Sidebar({ onBack }) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View>
          <Text style={styles.sidebarTitle}>ตั้งค่าร้าน</Text>
          <Text style={styles.sidebarSubtitle}>ผู้จัดการ · ป้าน้อย</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onBack} hitSlop={12}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>
      {SIDEBAR_ITEMS.map((label, idx) => {
        const active = idx === 1;
        return (
          <TouchableOpacity
            key={label}
            style={[styles.sidebarItem, active && styles.sidebarItemActive]}
            onPress={active ? undefined : onBack}
          >
            <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// แถบชิปเลื่อนซ้าย/ขวา (ใช้ทั้งแท็บเดือนและแถบวันที่) chips: [{ key, title, sub, active, onPress }]
function ChipStrip({ chips }) {
  const ref = useRef(null);
  const x = useRef(0);
  const scroll = (dir) => ref.current?.scrollTo({ x: Math.max(0, x.current + dir * 420), animated: true });
  const arrow = (dir, sign) => (
    <TouchableOpacity style={styles.arrowBtn} onPress={() => scroll(dir)}><Text style={styles.arrowText}>{sign}</Text></TouchableOpacity>
  );
  return (
    <View style={styles.stripWrap}>
      {arrow(-1, '‹')}
      <ScrollView
        ref={ref}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { x.current = e.nativeEvent.contentOffset.x; }}
        style={{ flex: 1 }}
        contentContainerStyle={styles.stripContent}
      >
        {chips.map((c) => (
          <TouchableOpacity key={c.key} style={[styles.chip, c.active && styles.chipActive]} onPress={c.onPress}>
            <Text style={[styles.chipTitle, fonts.bold, c.active && styles.chipTextActive]}>{c.title}</Text>
            <Text style={[styles.chipSub, c.active && styles.chipTextActive]}>{c.sub}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {arrow(1, '›')}
    </View>
  );
}

function StatCard({ label, value, note, noteColor, bg = colors.surface.sidebarCard, valueColor, labelColor, wide }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg, flexBasis: wide ? '23%' : '47%' }]}>
      <Text style={[styles.statLabel, labelColor && { color: labelColor }]}>{label}</Text>
      <Text style={[styles.statValue, fonts.serif, { color: valueColor || colors.core.darkGreen }]}>{value}</Text>
      <Text style={[styles.statNote, noteColor && { color: noteColor }]}>{note}</Text>
    </View>
  );
}

function CategoryRow({ item, color, maxPercent }) {
  const fill = maxPercent > 0 ? (item.percent / maxPercent) * 100 : 0; // หมวดแรก = เต็มหลอด
  return (
    <View style={styles.categoryRow}>
      <Text style={[styles.categoryName, fonts.bold]} numberOfLines={1}>{item.name}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${fill}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.categoryQty}>{item.qty} จาน</Text>
      <Text style={[styles.categoryAmount, fonts.bold]}>{baht(item.amount)}</Text>
      <Text style={styles.categoryPercent}>{Number(item.percent).toFixed(1)}%</Text>
    </View>
  );
}

function BottomCard({ label, value }) {
  return (
    <View style={styles.bottomCard}>
      <Text style={styles.bottomLabel}>{label}</Text>
      <Text style={[styles.bottomValue, fonts.bold]}>{value}</Text>
    </View>
  );
}

function BillItemRow({ it }) {
  const cancelled = it.status === 'cancelled';
  return (
    <View style={styles.itemRow}>
      <Text style={[styles.itemName, cancelled && styles.itemCancelled]} numberOfLines={1}>
        {it.qty} × {it.name}
      </Text>
      <Text style={[styles.itemStatus, cancelled && { color: colors.orange.textDark }]}>
        {STATUS_LABEL[it.status] ?? it.status}
      </Text>
      <Text style={[styles.itemAmount, cancelled && styles.itemCancelled]}>{baht(it.amount)}</Text>
    </View>
  );
}

function BillCard({ bill, expanded, onPress }) {
  const isOpen = bill.status === 'open';
  return (
    <View style={styles.billCard}>
      <TouchableOpacity style={styles.billHeader} onPress={onPress} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.billTitle, fonts.bold]}>โต๊ะ {bill.tableNumber}</Text>
          <Text style={styles.billMeta}>
            เปิด {bill.openedTime}{bill.closedTime ? ` · ปิด ${bill.closedTime}` : ''} · {bill.rounds.length} รอบ
          </Text>
        </View>
        <View style={[styles.badge, isOpen ? styles.badgeOpen : styles.badgeClosed]}>
          <Text style={[styles.badgeText, fonts.bold, { color: isOpen ? colors.orange.textDark : colors.core.brandGreen }]}>
            {isOpen ? 'ยังเปิด' : 'ปิดแล้ว'}
          </Text>
        </View>
        <Text style={[styles.billTotal, fonts.bold]}>{baht(bill.total)}</Text>
        <Text style={styles.chevron}>{expanded ? '˄' : '˅'}</Text>
      </TouchableOpacity>
      {expanded && bill.rounds.map((round) => (
        <View key={round.roundId} style={styles.roundBlock}>
          <Text style={[styles.roundTitle, fonts.bold]}>รอบที่ {round.roundNumber} · {round.time}</Text>
          {round.items.map((it) => <BillItemRow key={it.id} it={it} />)}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// หน้าจอหลัก
// ---------------------------------------------------------------------------

export default function SummaryScreen({ navigation }) {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const wide = width - SIDEBAR_WIDTH >= WIDE_BREAKPOINT;

  const [selectedDate, setSelectedDate] = useState(getBangkokDateStr(0));
  const [browseMonth, setBrowseMonth] = useState(null); // 'YYYY-MM' ที่เปิดดู (null = ตามวันที่เลือก)
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [bills, setBills] = useState([]);
  const [dayCounts, setDayCounts] = useState({});
  const [months, setMonths] = useState([]); // จาก getMonthList
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [expandedBillId, setExpandedBillId] = useState(null);
  const [updatedAtLabel, setUpdatedAtLabel] = useState('');

  useEffect(() => {
    source.getLatestBillDate(db).then((latest) => setSelectedDate(latest || getBangkokDateStr(0)));
  }, [db]);

  const loadData = useCallback(async () => {
    const [s, c, b, counts, monthList] = await Promise.all([
      source.getDailySummary(db, selectedDate),
      source.getCategoryBreakdown(db, selectedDate),
      source.getBillsForDate(db, selectedDate),
      source.getBillCountsByDate(db),
      getMonthList(db),
    ]);
    setSummary(s);
    setCategories(c);
    setBills(b);
    setDayCounts(counts);
    setMonths(monthList);
    const now = new Date(Date.now() + BANGKOK_OFFSET_MS);
    setUpdatedAtLabel(`${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`);
  }, [db, selectedDate]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  function selectDate(d) {
    setSelectedDate(d);
    setExpandedBillId(null);
  }

  // กดแท็บเดือน → แสดงวันที่ของเดือนนั้น และเลือกวันล่าสุดของเดือนให้เลย
  function selectMonth(m) {
    setBrowseMonth(m);
    const latestInMonth = months.find((x) => x.month === m)?.dates[0];
    if (latestInMonth) selectDate(latestInMonth);
  }

  const handleExportCsv = () => {}; // TODO: สร้างไฟล์ CSV ด้วย expo-file-system + expo-sharing
  const goBack = () => navigation.goBack();

  if (!summary) {
    return (
      <View style={styles.root}>
        <Sidebar onBack={goBack} />
        <View style={styles.loading}><Text style={{ color: colors.text.label }}>กำลังโหลดข้อมูล...</Text></View>
      </View>
    );
  }

  // รายการวันที่จากวันที่ที่มีบิลจริง ถ้ายังไม่มีเลยใช้ย้อนหลังตามปฏิทิน
  const availableDates = Object.keys(dayCounts).sort().reverse();
  const dateList = availableDates.length > 0 ? availableDates : Array.from({ length: DAYS_BACK }, (_, i) => getBangkokDateStr(i));
  const activeMonth = browseMonth || selectedDate.slice(0, 7);
  const datesInMonth = dateList.filter((d) => d.startsWith(activeMonth));
  const selectedShort = formatThaiDateShort(selectedDate);

  const monthChips = months.map((m) => {
    const label = formatThaiMonth(m.month);
    return {
      key: m.month, title: `${label.name} ${label.year}`, sub: `${m.days} วัน · ${m.bills} บิล`,
      active: m.month === activeMonth, onPress: () => selectMonth(m.month),
    };
  });
  const dateChips = datesInMonth.map((d) => {
    const label = formatThaiDateShort(d);
    return {
      key: d, title: `${label.weekday} ${label.day}`, sub: dayCounts[d] ? `${dayCounts[d]} บิล` : 'ไม่มีบิล',
      active: d === selectedDate, onPress: () => selectDate(d),
    };
  });

  const bestHourLabel = summary.bestHour != null
    ? `${pad2(summary.bestHour)}:00 – ${pad2((summary.bestHour + 1) % 24)}:00 · ${baht(summary.bestHourAmount)}`
    : '-';
  const maxPercent = categories.reduce((m, c) => Math.max(m, Number(c.percent) || 0), 0);

  const change = summary.salesChangePercent;
  const hasChange = change !== null && change !== undefined;
  const salesNote = hasChange ? `${change >= 0 ? '+' : ''}${change}% จากเมื่อวาน` : 'ไม่มีข้อมูลเมื่อวาน';
  const salesNoteColor = !hasChange ? colors.text.label : change >= 0 ? colors.core.brandGreen : colors.orange.textDark;

  return (
    <View style={styles.root}>
      <Sidebar onBack={goBack} />
      <ScrollView style={styles.main} contentContainerStyle={{ flexGrow: 1 }}>
        {/* ---- Header ---- */}
        <View style={styles.headerRow}>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.title, fonts.serif]}>สรุปยอดขายรายวัน</Text>
            <Text style={styles.subtitle}>
              {formatThaiDateLabel(selectedDate)} · ปิดรอบ {CLOSING_TIME} · อัปเดต {updatedAtLabel}
            </Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity style={[styles.buttonOutline, datePickerOpen && styles.buttonOutlineActive]} onPress={() => setDatePickerOpen((v) => !v)}>
              <Text style={styles.buttonOutlineText}>เลือกเดือน</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonDark} onPress={handleExportCsv}>
              <Text style={[styles.buttonDarkText, fonts.bold]}>ส่งออก CSV</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ---- กด "เลือกเดือน" → แท็บเดือน แล้วขึ้นวันที่ของเดือนนั้น (key ทำให้เลื่อนกลับต้นแถวเมื่อเปลี่ยนเดือน) ---- */}
        {datePickerOpen && (
          <>
            <ChipStrip chips={monthChips} />
            <ChipStrip key={activeMonth} chips={dateChips} />
          </>
        )}

        <View style={styles.body}>
          {/* ---- การ์ดสถิติ ---- */}
          <View style={styles.statsRow}>
            <StatCard wide={wide} label="ยอดขายรวม" value={baht(summary.totalSales)} note={salesNote} noteColor={salesNoteColor} />
            <StatCard wide={wide} label="จำนวนบิล" value={String(summary.billCount)} note={`ปิดแล้ว ${summary.billClosed} · ยังเปิด ${summary.billOpen}`} />
            <StatCard wide={wide} label="เฉลี่ยต่อบิล" value={baht(summary.avgPerBill)} note={`${Number(summary.avgRoundsPerBill).toFixed(1)} รอบ / บิล`} />
            <StatCard
              wide={wide} label="ยกเลิก / ของหมด" value={String(summary.cancelledCount)}
              note={`คิดเป็น ${baht(summary.cancelledAmount)}`}
              labelColor={withAlpha(colors.orange.textDark, 0.6)} noteColor={colors.orange.textDark}
              valueColor={colors.orange.textDark} bg={colors.orange.bgLight}
            />
          </View>

          {/* ---- หมวดหมู่อาหาร ---- */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, fonts.bold]}>แยกตามหมวดหมู่อาหาร</Text>
            <Text style={styles.sectionHint}>จำนวนจาน · ยอดขาย · สัดส่วน</Text>
          </View>
          {categories.length === 0 ? (
            <Text style={styles.emptyText}>ยังไม่มีรายการขายในวันนี้</Text>
          ) : (
            categories.map((item, idx) => (
              <CategoryRow key={item.name} item={item} maxPercent={maxPercent} color={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))
          )}

          <View style={styles.spacer} />
          <View style={styles.bottomRow}>
            <BottomCard label="ช่วงเวลาที่ขายดีที่สุด" value={bestHourLabel} />
            <BottomCard label="เมนูขายดีที่สุดวันนี้" value={summary.bestMenuName ? `${summary.bestMenuName} · ${summary.bestMenuQty} จาน` : '-'} />
          </View>

          {/* ---- บิลทั้งหมดของวันที่เลือก ---- */}
          <View style={{ marginTop: 12 }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, fonts.bold]}>บิลทั้งหมดของ {selectedShort.weekday} {selectedShort.day}</Text>
              <Text style={styles.sectionHint}>{bills.length} บิล · แตะเพื่อดูรอบสั่ง</Text>
            </View>
            {bills.length === 0 ? (
              <Text style={styles.emptyText}>ไม่มีบิลในวันที่เลือก</Text>
            ) : (
              bills.map((b) => (
                <BillCard key={b.billId} bill={b} expanded={expandedBillId === b.billId} onPress={() => setExpandedBillId(expandedBillId === b.billId ? null : b.billId)} />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------
const text = (size, color, extra) => ({ fontSize: size, color, ...extra });
const muted = colors.text.label;
const dark = colors.core.darkGreen;
const rightCell = (w, size, color) => ({ width: w, fontSize: size, color, textAlign: 'right' });
const card = { borderWidth: 1, borderColor: border, backgroundColor: colors.core.screenBg };

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.core.screenBg },
  main: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // ---- Sidebar (เหมือน MenuSettingsScreen) ----
  sidebar: { width: SIDEBAR_WIDTH, padding: 20, borderRightWidth: 1, borderRightColor: border },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  sidebarTitle: text(20, dark, { fontWeight: 'bold' }),
  sidebarSubtitle: { fontSize: 12, color: muted, marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface.sidebarCard, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 20, color: colors.text.description },
  sidebarItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sidebarItemActive: { backgroundColor: dark },
  sidebarItemText: { fontSize: 14, color: dark },
  sidebarItemTextActive: { color: colors.core.screenBg, fontWeight: 'bold' },
  // ---- Header ----
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 28, paddingTop: 28, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: border },
  title: text(24, dark),
  subtitle: { fontSize: 12, color: muted, marginTop: 6 },
  buttonOutline: { borderWidth: 1, borderColor: border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, marginRight: 10 },
  buttonOutlineActive: { backgroundColor: colors.surface.sidebarCard, borderColor: dark },
  buttonOutlineText: text(12, dark),
  buttonDark: { backgroundColor: dark, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, justifyContent: 'center' },
  buttonDarkText: text(12, colors.core.screenBg),
  // ---- แท็บเดือน / แถบวันที่ ----
  stripWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14 },
  stripContent: { paddingHorizontal: 8, paddingBottom: 4 },
  arrowBtn: { width: 40, height: 40, borderRadius: 20, ...card, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 24, lineHeight: 28, color: dark },
  chip: { ...card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, marginRight: 10, alignItems: 'center', minWidth: 96 },
  chipActive: { backgroundColor: dark, borderColor: dark },
  chipTitle: { fontSize: 13, color: dark },
  chipSub: { fontSize: 11, color: muted, marginTop: 2 },
  chipTextActive: { color: colors.core.screenBg },
  // ---- Body + การ์ดสถิติ ----
  body: { flex: 1, padding: 28 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  statCard: { flexGrow: 1, margin: 8, borderRadius: 22, paddingVertical: 20, paddingHorizontal: 24 },
  statLabel: { fontSize: 12, color: muted },
  statValue: { fontSize: 28, marginVertical: 10 },
  statNote: { fontSize: 11, color: muted },
  // ---- หมวดหมู่ ----
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 14 },
  sectionTitle: text(15, dark),
  sectionHint: { fontSize: 11, color: muted },
  emptyText: { fontSize: 12, color: muted, marginBottom: 12 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  categoryName: { width: 110, fontSize: 13, color: dark },
  barTrack: { flex: 1, height: 38, borderRadius: 10, backgroundColor: colors.surface.searchChip, marginRight: 20, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 10 },
  categoryQty: rightCell(80, 11, muted),
  categoryAmount: rightCell(100, 14, dark),
  categoryPercent: rightCell(64, 11, muted),
  // ---- การ์ดล่าง ----
  spacer: { flex: 1, minHeight: 24 },
  bottomRow: { flexDirection: 'row', marginHorizontal: -8 },
  bottomCard: { ...card, flex: 1, margin: 8, paddingVertical: 22, paddingHorizontal: 26, borderRadius: 22 },
  bottomLabel: { fontSize: 12, color: muted },
  bottomValue: text(17, dark, { marginTop: 10 }),
  // ---- รายการบิล ----
  billCard: { ...card, borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  billHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18 },
  billTitle: text(15, dark),
  billMeta: { fontSize: 12, color: muted, marginTop: 2 },
  badge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginRight: 16 },
  badgeOpen: { backgroundColor: colors.orange.bgLight },
  badgeClosed: { backgroundColor: colors.surface.sidebarCard },
  badgeText: { fontSize: 11 },
  billTotal: { fontSize: 16, color: dark, minWidth: 80, textAlign: 'right' },
  chevron: { fontSize: 16, color: muted, marginLeft: 12, width: 14, textAlign: 'center' },
  roundBlock: { borderTopWidth: 1, borderTopColor: border, paddingVertical: 10, paddingHorizontal: 18 },
  roundTitle: text(12, colors.core.brandGreen, { marginBottom: 6 }),
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  itemName: { flex: 1, fontSize: 13, color: dark },
  itemStatus: rightCell(80, 12, muted),
  itemAmount: rightCell(80, 13, dark),
  itemCancelled: { textDecorationLine: 'line-through', color: muted },
});