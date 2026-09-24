import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

import colors, { withAlpha } from '../customer/style/colors';
import {
  getDailySummary,
  getCategoryBreakdown,
  getLatestBillDate,
  getBillsForDate,
  getBillCountsByDate,
  getMonthList,
} from '../customer/Salesqueries';

// ใช้ฟอนต์ระบบทั้งหมด (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
// ตัวเลข/หัวข้อเป็น serif ตามดีไซน์ ส่วนตัวอักษรไทยระบบจะเลือกฟอนต์ให้เอง
const fonts = {
  serif: { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontWeight: 'bold' },
  regular: {},
  bold: { fontWeight: '600' },
};

const border = withAlpha(colors.core.darkGreen, 0.12);

const CLOSING_TIME = '22:00'; // เวลาปิดรอบของร้าน
const DAYS_BACK = 14; // จำนวนวันย้อนหลัง (ใช้เฉพาะตอนยังไม่มีข้อมูลบิลเลย)
const WIDE_BREAKPOINT = 900; // กว้างกว่านี้ = การ์ดสถิติ 4 ใบในแถวเดียว

// สีแท่งกราฟตามดีไซน์: เขียวเข้ม → เขียวอ่อน → น้ำตาล → ส้มอิฐ
const CHART_COLORS = ['#3F6B54', '#4E8266', '#619A78', '#8A6C32', '#A8683E'];

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function getBangkokDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + BANGKOK_OFFSET_MS - offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function formatThaiDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  return `${THAI_DAYS[utcDate.getUTCDay()]} ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function formatThaiDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = THAI_DAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { weekday: wd, day: `${d} ${THAI_MONTHS_SHORT[m - 1]}` };
}

// 'YYYY-MM' → { name: 'กันยายน', year: '2569' }
function formatThaiMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return { name: THAI_MONTHS[m - 1], year: String(y + 543) };
}

function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

function satangToBaht(satang) {
  return Math.round(satang / 100);
}

function StatCard({ label, value, note, noteColor, bg, valueColor, labelColor, wide }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg, flexBasis: wide ? '23%' : '47%' }]}>
      <Text style={[styles.statLabel, fonts.regular, labelColor && { color: labelColor }]}>{label}</Text>
      <Text style={[styles.statValue, fonts.serif, { color: valueColor || colors.core.darkGreen }]}>
        {value}
      </Text>
      {note != null && (
        <Text style={[styles.statNote, fonts.regular, noteColor && { color: noteColor }]}>{note}</Text>
      )}
    </View>
  );
}

function CategoryRow({ item, color, maxPercent }) {
  // แท่งยาวตามสัดส่วนของหมวดที่ขายสูงสุด (หมวดแรก = เต็มหลอด)
  const fill = maxPercent > 0 ? (item.percent / maxPercent) * 100 : 0;
  return (
    <View style={styles.categoryRow}>
      <Text style={[styles.categoryName, fonts.bold]} numberOfLines={1}>{item.name}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${fill}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.categoryQty, fonts.regular]}>{item.qty} จาน</Text>
      <Text style={[styles.categoryAmount, fonts.bold]}>฿{formatNumber(satangToBaht(item.amount))}</Text>
      <Text style={[styles.categoryPercent, fonts.regular]}>{Number(item.percent).toFixed(1)}%</Text>
    </View>
  );
}

function BottomCard({ label, value }) {
  return (
    <View style={styles.bottomCard}>
      <Text style={[styles.bottomLabel, fonts.regular]}>{label}</Text>
      <Text style={[styles.bottomValue, fonts.bold]}>{value}</Text>
    </View>
  );
}

const STATUS_LABEL = { pending: 'รอทำ', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' };

function BillCard({ bill, expanded, onPress }) {
  const isOpen = bill.status === 'open';
  return (
    <View style={styles.billCard}>
      <TouchableOpacity style={styles.billHeader} onPress={onPress} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.billTitle, fonts.bold]}>โต๊ะ {bill.tableNumber}</Text>
          <Text style={[styles.billMeta, fonts.regular]}>
            เปิด {bill.openedTime}
            {bill.closedTime ? ` · ปิด ${bill.closedTime}` : ''} · {bill.rounds.length} รอบ
          </Text>
        </View>
        <View style={[styles.badge, isOpen ? styles.badgeOpen : styles.badgeClosed]}>
          <Text style={[styles.badgeText, fonts.bold, { color: isOpen ? colors.orange.textDark : colors.core.brandGreen }]}>
            {isOpen ? 'ยังเปิด' : 'ปิดแล้ว'}
          </Text>
        </View>
        <Text style={[styles.billTotal, fonts.bold]}>฿{formatNumber(satangToBaht(bill.total))}</Text>
        <Text style={styles.chevron}>{expanded ? '˄' : '˅'}</Text>
      </TouchableOpacity>

      {expanded &&
        bill.rounds.map((round) => (
          <View key={round.roundId} style={styles.roundBlock}>
            <Text style={[styles.roundTitle, fonts.bold]}>
              รอบที่ {round.roundNumber} · {round.time}
            </Text>
            {round.items.map((it) => {
              const cancelled = it.status === 'cancelled';
              return (
                <View key={it.id} style={styles.itemRow}>
                  <Text
                    style={[styles.itemName, fonts.regular, cancelled && styles.itemCancelled]}
                    numberOfLines={1}
                  >
                    {it.qty} × {it.name}
                  </Text>
                  <Text
                    style={[
                      styles.itemStatus,
                      fonts.regular,
                      cancelled && { color: colors.orange.textDark },
                    ]}
                  >
                    {STATUS_LABEL[it.status] ?? it.status}
                  </Text>
                  <Text style={[styles.itemAmount, fonts.regular, cancelled && styles.itemCancelled]}>
                    ฿{formatNumber(satangToBaht(it.amount))}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
    </View>
  );
}

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const [selectedDate, setSelectedDate] = useState(getBangkokDateStr(0));
  const [browseMonth, setBrowseMonth] = useState(null); // 'YYYY-MM' ที่กำลังเปิดดู (null = ตามวันที่เลือก)
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [updatedAtLabel, setUpdatedAtLabel] = useState('');
  const [bills, setBills] = useState([]);
  const [expandedBillId, setExpandedBillId] = useState(null);
  const [dayCounts, setDayCounts] = useState({});
  const [months, setMonths] = useState([]); // จาก getMonthList: [{ month, days, bills, dates }]
  const stripRef = useRef(null);
  const stripX = useRef(0);
  const monthStripRef = useRef(null);
  const monthStripX = useRef(0);

  useEffect(() => {
    getLatestBillDate(db).then((latest) => {
      setSelectedDate(latest || getBangkokDateStr(0));
    });
  }, [db]);

  const loadData = useCallback(async () => {
    const [s, c, b, counts, monthList] = await Promise.all([
      getDailySummary(db, selectedDate),
      getCategoryBreakdown(db, selectedDate),
      getBillsForDate(db, selectedDate),
      getBillCountsByDate(db),
      getMonthList(db),
    ]);
    setSummary(s);
    setCategories(c);
    setBills(b);
    setDayCounts(counts);
    setMonths(monthList);
    const now = new Date(Date.now() + BANGKOK_OFFSET_MS);
    setUpdatedAtLabel(
      `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
    );
  }, [db, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // เลื่อนแถบวันที่ไปซ้าย/ขวาด้วยปุ่มลูกศร (กันกรณีลากนิ้ว/เมาส์ไม่ติดบน emulator)
  function scrollStrip(direction) {
    stripRef.current?.scrollTo({ x: Math.max(0, stripX.current + direction * 420), animated: true });
  }

  // เลื่อนแท็บเดือนไปซ้าย/ขวาด้วยปุ่มลูกศร
  function scrollMonthStrip(direction) {
    monthStripRef.current?.scrollTo({ x: Math.max(0, monthStripX.current + direction * 420), animated: true });
  }

  function selectDate(d) {
    setSelectedDate(d);
    setExpandedBillId(null);
  }

  // กดแท็บเดือน → แสดงวันที่ของเดือนนั้น และเลือกวันล่าสุดของเดือนให้เลย
  function selectMonth(m) {
    setBrowseMonth(m);
    const latestInMonth = months.find((x) => x.month === m)?.dates[0];
    if (latestInMonth) selectDate(latestInMonth);
    stripX.current = 0;
    stripRef.current?.scrollTo({ x: 0, animated: false });
  }

  function handleExportCsv() {
    // TODO: สร้างไฟล์ CSV ด้วย expo-file-system + expo-sharing
  }

  const recentDays = Array.from({ length: DAYS_BACK }, (_, i) => getBangkokDateStr(i));
  // รายการวันที่มาจากแหล่งข้อมูล (วันที่ที่มีบิลจริง/mock) เรียงใหม่→เก่า ถ้ายังไม่มีเลยใช้ย้อนหลังตามปฏิทิน
  const availableDates = Object.keys(dayCounts).sort().reverse();
  const dateList = availableDates.length > 0 ? availableDates : recentDays;

  // เดือนที่มีข้อมูลมาจาก getMonthList (Salesqueries.js)
  const activeMonth = browseMonth || selectedDate.slice(0, 7);
  const datesInMonth = dateList.filter((d) => d.startsWith(activeMonth));

  if (!summary) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[{ color: colors.text.label }, fonts.regular]}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  const bestHourLabel =
    summary.bestHour != null
      ? `${String(summary.bestHour).padStart(2, '0')}:00 – ${String((summary.bestHour + 1) % 24).padStart(2, '0')}:00`
      : '-';

  const maxPercent = categories.reduce((m, c) => Math.max(m, Number(c.percent) || 0), 0);

  const change = summary.salesChangePercent;
  const salesNote =
    change === null || change === undefined
      ? 'ไม่มีข้อมูลเมื่อวาน'
      : `${change >= 0 ? '+' : ''}${change}% จากเมื่อวาน`;
  const salesNoteColor =
    change === null || change === undefined
      ? colors.text.label
      : change >= 0
      ? colors.core.brandGreen
      : colors.orange.textDark;

  return (
    <View style={styles.root}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      {/* ---- Header + เส้นคั่น ---- */}
      <View style={styles.headerRow}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.title, fonts.serif]}>สรุปยอดขายรายวัน</Text>
          <Text style={[styles.subtitle, fonts.regular]}>
            {formatThaiDateLabel(selectedDate)} · ปิดรอบ {CLOSING_TIME} · อัปเดต {updatedAtLabel}
          </Text>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.buttonOutline, datePickerOpen && styles.buttonOutlineActive]}
            onPress={() => setDatePickerOpen((v) => !v)}
          >
            <Text style={[styles.buttonOutlineText, fonts.regular]}>เลือกเดือน</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonDark} onPress={handleExportCsv}>
            <Text style={[styles.buttonDarkText, fonts.bold]}>ส่งออก CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ---- กด "เลือกเดือน" → แท็บเดือน แล้วขึ้นวันที่ของเดือนนั้นด้านล่าง ---- */}
      {datePickerOpen && (
        <>
          {/* แท็บเดือน (มีลูกศรเลื่อนซ้าย/ขวา) */}
          <View style={styles.monthStripWrap}>
            <TouchableOpacity style={styles.arrowBtn} onPress={() => scrollMonthStrip(-1)}>
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>

            <ScrollView
              ref={monthStripRef}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                monthStripX.current = e.nativeEvent.contentOffset.x;
              }}
              style={styles.dateStrip}
              contentContainerStyle={styles.dateStripContent}
            >
              {months.map((m) => {
                const active = m.month === activeMonth;
                const label = formatThaiMonth(m.month);
                return (
                  <TouchableOpacity
                    key={m.month}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => selectMonth(m.month)}
                  >
                    <Text style={[styles.dateChipDay, fonts.bold, active && styles.dateChipTextActive]}>
                      {label.name} {label.year}
                    </Text>
                    <Text style={[styles.dateChipCount, fonts.regular, active && styles.dateChipTextActive]}>
                      {m.days} วัน · {m.bills} บิล
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.arrowBtn} onPress={() => scrollMonthStrip(1)}>
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* วันที่ของเดือนที่เลือก */}
          <View style={styles.dateStripWrap}>
            <TouchableOpacity style={styles.arrowBtn} onPress={() => scrollStrip(-1)}>
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>

            <ScrollView
              ref={stripRef}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                stripX.current = e.nativeEvent.contentOffset.x;
              }}
              style={styles.dateStrip}
              contentContainerStyle={styles.dateStripContent}
            >
              {datesInMonth.map((d) => {
                const active = d === selectedDate;
                const label = formatThaiDateShort(d);
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => selectDate(d)}
                  >
                    <Text style={[styles.dateChipDay, fonts.bold, active && styles.dateChipTextActive]}>
                      {label.weekday} {label.day}
                    </Text>
                    <Text style={[styles.dateChipCount, fonts.regular, active && styles.dateChipTextActive]}>
                      {dayCounts[d] ? `${dayCounts[d]} บิล` : 'ไม่มีบิล'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.arrowBtn} onPress={() => scrollStrip(1)}>
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.body}>
        {/* ---- การ์ดสถิติ ---- */}
        <View style={styles.statsRow}>
          <StatCard
            wide={wide}
            label="ยอดขายรวม"
            value={`฿${formatNumber(satangToBaht(summary.totalSales))}`}
            note={salesNote}
            noteColor={salesNoteColor}
            bg={colors.surface.sidebarCard}
          />
          <StatCard
            wide={wide}
            label="จำนวนบิล"
            value={String(summary.billCount)}
            note={`ปิดแล้ว ${summary.billClosed} · ยังเปิด ${summary.billOpen}`}
            bg={colors.surface.sidebarCard}
          />
          <StatCard
            wide={wide}
            label="เฉลี่ยต่อบิล"
            value={`฿${formatNumber(satangToBaht(summary.avgPerBill))}`}
            note={`${Number(summary.avgRoundsPerBill).toFixed(1)} รอบ / บิล`}
            bg={colors.surface.sidebarCard}
          />
          <StatCard
            wide={wide}
            label="ยกเลิก / ของหมด"
            labelColor={withAlpha(colors.orange.textDark, 0.6)}
            value={String(summary.cancelledCount)}
            note={`คิดเป็น ฿${formatNumber(satangToBaht(summary.cancelledAmount))}`}
            noteColor={colors.orange.textDark}
            bg={colors.orange.bgLight}
            valueColor={colors.orange.textDark}
          />
        </View>

        {/* ---- หมวดหมู่อาหาร ---- */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, fonts.bold]}>แยกตามหมวดหมู่อาหาร</Text>
          <Text style={[styles.sectionHint, fonts.regular]}>จำนวนจาน · ยอดขาย · สัดส่วน</Text>
        </View>

        {categories.length === 0 ? (
          <Text style={[styles.emptyText, fonts.regular]}>ยังไม่มีรายการขายในวันนี้</Text>
        ) : (
          categories.map((item, idx) => (
            <CategoryRow
              key={item.name}
              item={item}
              maxPercent={maxPercent}
              color={CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))
        )}

        {/* ดันการ์ดล่างไปติดขอบล่างของหน้าจอ */}
        <View style={styles.spacer} />

        <View style={styles.bottomRow}>
          <BottomCard
            label="ช่วงเวลาที่ขายดีที่สุด"
            value={
              summary.bestHour != null
                ? `${bestHourLabel} · ฿${formatNumber(satangToBaht(summary.bestHourAmount))}`
                : '-'
            }
          />
          <BottomCard
            label="เมนูขายดีที่สุดวันนี้"
            value={summary.bestMenuName ? `${summary.bestMenuName} · ${summary.bestMenuQty} จาน` : '-'}
          />
        </View>

        {/* ---- บิลทั้งหมดของวันที่เลือก ---- */}
        <View style={styles.billsSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, fonts.bold]}>
              บิลทั้งหมดของ {formatThaiDateShort(selectedDate).weekday} {formatThaiDateShort(selectedDate).day}
            </Text>
            <Text style={[styles.sectionHint, fonts.regular]}>{bills.length} บิล · แตะเพื่อดูรอบสั่ง</Text>
          </View>
          {bills.length === 0 ? (
            <Text style={[styles.emptyText, fonts.regular]}>ไม่มีบิลในวันที่เลือก</Text>
          ) : (
            bills.map((b) => (
              <BillCard
                key={b.billId}
                bill={b}
                expanded={expandedBillId === b.billId}
                onPress={() => setExpandedBillId(expandedBillId === b.billId ? null : b.billId)}
              />
            ))
          )}
        </View>
      </View>

    </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.core.screenBg,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.core.screenBg,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: border,
  },
  title: {
    fontSize: 24,
    color: colors.core.darkGreen,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.label,
    marginTop: 6,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginRight: 10,
  },
  buttonOutlineActive: {
    backgroundColor: colors.surface.sidebarCard,
    borderColor: colors.core.darkGreen,
  },
  buttonOutlineText: {
    fontSize: 12,
    color: colors.core.darkGreen,
  },
  buttonDark: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  buttonDarkText: {
    fontSize: 12,
    color: colors.core.screenBg,
  },

  // month tabs
  monthStripWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  // date strip
  dateStripWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dateStrip: {
    flex: 1,
  },
  dateStripContent: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: colors.core.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 24,
    lineHeight: 28,
    color: colors.core.darkGreen,
  },
  dateChip: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: 14,
    backgroundColor: colors.core.screenBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 96,
  },
  dateChipActive: {
    backgroundColor: colors.core.darkGreen,
    borderColor: colors.core.darkGreen,
  },
  dateChipDay: {
    fontSize: 13,
    color: colors.core.darkGreen,
  },
  dateChipCount: {
    fontSize: 11,
    color: colors.text.label,
    marginTop: 2,
  },
  dateChipTextActive: {
    color: colors.core.screenBg,
  },

  // body
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 28,
  },

  // stat cards
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statCard: {
    flexGrow: 1,
    margin: 8,
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.label,
  },
  statValue: {
    fontSize: 28,
    marginTop: 10,
    marginBottom: 10,
  },
  statNote: {
    fontSize: 11,
    color: colors.text.label,
  },

  // category section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    color: colors.core.darkGreen,
  },
  sectionHint: {
    fontSize: 11,
    color: colors.text.label,
  },
  emptyText: {
    fontSize: 12,
    color: colors.text.label,
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryName: {
    width: 110,
    fontSize: 13,
    color: colors.core.darkGreen,
  },
  barTrack: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface.searchChip,
    marginRight: 20,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 10,
  },
  categoryQty: {
    width: 80,
    fontSize: 11,
    color: colors.text.label,
    textAlign: 'right',
  },
  categoryAmount: {
    width: 100,
    fontSize: 14,
    color: colors.core.darkGreen,
    textAlign: 'right',
  },
  categoryPercent: {
    width: 64,
    fontSize: 11,
    color: colors.text.label,
    textAlign: 'right',
  },

  // bottom
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  bottomRow: {
    flexDirection: 'row',
    marginHorizontal: -8,
  },
  bottomCard: {
    flex: 1,
    margin: 8,
    paddingVertical: 22,
    paddingHorizontal: 26,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: colors.core.screenBg,
  },
  bottomLabel: {
    fontSize: 12,
    color: colors.text.label,
  },
  bottomValue: {
    fontSize: 17,
    color: colors.core.darkGreen,
    marginTop: 10,
  },

  // bills list
  billsSection: {
    marginTop: 12,
  },
  billCard: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: 16,
    backgroundColor: colors.core.screenBg,
    marginBottom: 10,
    overflow: 'hidden',
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  billTitle: {
    fontSize: 15,
    color: colors.core.darkGreen,
  },
  billMeta: {
    fontSize: 12,
    color: colors.text.label,
    marginTop: 2,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 16,
  },
  badgeOpen: { backgroundColor: colors.orange.bgLight },
  badgeClosed: { backgroundColor: colors.surface.sidebarCard },
  badgeText: {
    fontSize: 11,
  },
  billTotal: {
    fontSize: 16,
    color: colors.core.darkGreen,
    minWidth: 80,
    textAlign: 'right',
  },
  chevron: {
    fontSize: 16,
    color: colors.text.label,
    marginLeft: 12,
    width: 14,
    textAlign: 'center',
  },
  roundBlock: {
    borderTopWidth: 1,
    borderTopColor: border,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  roundTitle: {
    fontSize: 12,
    color: colors.core.brandGreen,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: colors.core.darkGreen,
  },
  itemStatus: {
    width: 80,
    fontSize: 12,
    color: colors.text.label,
    textAlign: 'right',
  },
  itemAmount: {
    width: 80,
    fontSize: 13,
    color: colors.core.darkGreen,
    textAlign: 'right',
  },
  itemCancelled: {
    textDecorationLine: 'line-through',
    color: colors.text.label,
  },
});