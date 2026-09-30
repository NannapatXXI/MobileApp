import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import colors, { alpha } from '../customer/style/colors';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { formatBangkokHMS, formatNowHMS } from '../../utils/time';

// ยกเลิกแล้วสถานะจะถูกเขียนกลับ order_items ตัวเดียวกับฝั่งลูกค้า → รายการนั้นถูกตัดออกจากยอดบิลทันที
import { getKitchenQueue, getCancelledItems, cancelItem } from '../../db/queries_kitchen/queue';

// สมมติชื่อ/รหัสพนักงานผู้กดยกเลิก — ในของจริงควรดึงจาก auth session ของเครื่องนั้นๆ
const CURRENT_STAFF_ID = 'KITCHEN-01';

// ตัวเลือกเหตุผลที่ให้เลือกได้ตอนยืนยันยกเลิก
const REASON_OPTIONS = [
  { key: 'out_of_stock', label: 'วัตถุดิบหมด' },
  { key: 'customer_cancel', label: 'ลูกค้าขอยกเลิก' },
  { key: 'wrong_order', label: 'กดสั่งผิด' },
];

// ---------------------------------------------------------------------------
// ฟังก์ชันช่วยเลือกข้อมูล (อยู่นอก component เพราะไม่ต้องใช้ state)
// ---------------------------------------------------------------------------

// ข้อความสถานะใต้ชื่อเมนู — ถ้าไม่รู้จักสถานะให้คืน null (ไม่แสดงข้อความ)
function getItemStatusText(item, orderTimeLabel) {
  if (item.status === 'waiting') {
    return `รอทำ · ส่งเข้าครัว ${orderTimeLabel}`;
  }
  if (item.status === 'cooking') {
    return `กำลังทำ · เริ่ม ${item.status_time}`;
  }
  if (item.status === 'served') {
    return `เสิร์ฟแล้ว · ${item.status_time}`;
  }
  return null;
}

// แปลง key ของเหตุผลให้เป็นข้อความที่จะบันทึกลง DB
function getReasonLabel(reasonKey) {
  for (const reasonOption of REASON_OPTIONS) {
    if (reasonOption.key === reasonKey) {
      return reasonOption.label;
    }
  }
  return '';
}

// หาใบออร์เดอร์ตาม roundId ถ้าไม่เจอให้ใช้ใบแรกในคิวแทน
function findRoundById(roundList, roundId) {
  for (const round of roundList) {
    if (round.round_id === roundId) {
      return round;
    }
  }
  if (roundList.length > 0) {
    return roundList[0];
  }
  return null;
}

// หารายการอาหารที่เลือกไว้ในใบนี้ (ไม่เจอคืน null)
function findItemById(round, orderItemId) {
  if (!round) {
    return null;
  }
  for (const item of round.items) {
    if (item.order_item_id === orderItemId) {
      return item;
    }
  }
  return null;
}

// id ของรายการ "รอทำ" ตัวแรกในใบ (รายการที่ยกเลิกได้)
function findFirstWaitingItemId(round) {
  if (!round) {
    return null;
  }
  for (const item of round.items) {
    if (item.status === 'waiting') {
      return item.order_item_id;
    }
  }
  return null;
}

// เช็คว่ารายการนี้ยังอยู่ในใบและยังเป็น "รอทำ" อยู่ไหม
function isWaitingItemInRound(round, orderItemId) {
  for (const item of round.items) {
    if (item.order_item_id === orderItemId && item.status === 'waiting') {
      return true;
    }
  }
  return false;
}

export default function CancelItemScreen({ route, navigation }) {
  const db = useSQLiteContext();

  // รับ roundId ที่หน้าก่อนหน้าส่งมา (ถ้าไม่ส่งมาจะเป็น undefined)
  const routeParams = route && route.params ? route.params : {};
  const roundId = routeParams.roundId;

  // ---- state ----
  const [rounds, setRounds] = useState([]);
  const [cancelledLog, setCancelledLog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [reasonKey, setReasonKey] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // เก็บตำแหน่งแนวตั้งของแต่ละการ์ด เพื่อเลื่อนรายการที่เลือกให้เข้ามาในจอ
  const itemScrollRef = useRef(null);
  const itemOffsetsRef = useRef({});

  // ---- โหลดข้อมูลจาก DB ----
  // ใช้ useCallback เพราะอยู่ใน dependency ของ useFocusEffect (ถ้าเปลี่ยนทุกครั้งจะโหลดซ้ำวนไป)
  const loadData = useCallback(async function (options) {
    const isSilent = options ? options.silent : false;
    if (!isSilent) {
      setIsLoading(true);
    }
    try {
      const queueResult = await getKitchenQueue(db);
      const logResult = await getCancelledItems(db);
      setRounds(queueResult);
      setCancelledLog(logResult);
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, [db]);

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้
  useFocusEffect(
    useCallback(function () {
      loadData();
    }, [loadData])
  );

  // นาฬิกาเดินทุกวินาที (ใช้แสดงเวลาที่ยกเลิกในกล่อง metadata)
  useEffect(function () {
    const timer = setInterval(function () {
      setNow(Date.now());
    }, 1000);
    return function () {
      clearInterval(timer);
    };
  }, []);

  // คำนวณใบออร์เดอร์ที่กำลังดูอยู่ (ไม่ต้องใช้ useMemo เพราะคำนวณจาก state ทุกครั้งที่ render)
  const round = findRoundById(rounds, roundId);

  // เลือกรายการแรกที่ยัง "รอทำ" (ยกเลิกได้) ให้อัตโนมัติตอนโหลดใบ/เปลี่ยนใบ
  useEffect(function () {
    if (!round) {
      setSelectedItemId(null);
      return;
    }
    setSelectedItemId(function (previousItemId) {
      if (previousItemId && isWaitingItemInRound(round, previousItemId)) {
        return previousItemId;
      }
      return findFirstWaitingItemId(round);
    });
  }, [round]);

  // รายการที่เลือกไว้ตอนนี้
  const selectedItem = findItemById(round, selectedItemId);

  // เลื่อนรายการที่เลือกให้เข้ามาในจอเสมอ (ถ้าอยู่นอกจอ)
  useEffect(function () {
    if (!selectedItemId) {
      return;
    }
    const offsetY = itemOffsetsRef.current[selectedItemId];
    if (offsetY === undefined) {
      return;
    }
    const scrollTimer = setTimeout(function () {
      const scrollView = itemScrollRef.current;
      if (scrollView) {
        scrollView.scrollTo({ y: Math.max(0, offsetY - 8), animated: true });
      }
    }, 60);
    return function () {
      clearTimeout(scrollTimer);
    };
  }, [selectedItemId, round ? round.round_id : undefined]);

  // ---- ฟังก์ชันกดปุ่ม ----
  function handlePickItem(item) {
    // ยกเลิกได้เฉพาะรายการที่ยังรอทำ
    if (item.status !== 'waiting') {
      return;
    }
    setSelectedItemId(item.order_item_id);
    setReasonKey(null);
  }

  async function handleConfirmCancel() {
    if (!selectedItem || !reasonKey) {
      return;
    }
    const reasonLabel = getReasonLabel(reasonKey);
    setIsSubmitting(true);
    try {
      await cancelItem(db, selectedItem.order_item_id, reasonLabel);
      await loadData({ silent: true });
      setReasonKey(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDismiss() {
    setReasonKey(null);
  }

  // ---- ส่วนย่อยที่ใช้ซ้ำใน JSX ----
  function renderMenuItem(item) {
    const canCancel = item.status === 'waiting';
    const isSelected = item.order_item_id === selectedItemId;

    // กรอบแดงเฉพาะตอนเลือกรายการที่ "รอทำ" (ยกเลิกได้)
    let itemRowStyle = styles.itemRow;
    if (isSelected && canCancel) {
      itemRowStyle = [styles.itemRow, styles.itemRowSelected];
    }

    // บันทึกตำแหน่งของการ์ดไว้ เผื่อรายการที่เลือกอยู่นอกจอ
    function handleItemLayout(layoutEvent) {
      itemOffsetsRef.current[item.order_item_id] = layoutEvent.nativeEvent.layout.y;
    }

    // ข้อความสถานะใต้ชื่อเมนู
    const statusText = getItemStatusText(item, round.order_time_label);

    // ตัวอักษรสีส้มตอนกำลังทำ
    let statusStyle = styles.itemMeta;
    if (item.status === 'cooking') {
      statusStyle = [styles.itemMeta, styles.itemMetaCooking];
    }

    // ปุ่มขวา: กดได้ถ้ายังรอทำ / ถ้าไม่รอทำแล้วให้เป็นปุ่มสีเทาที่กดไม่ได้
    let cancelButton = null;
    if (canCancel) {
      cancelButton = (
        <Pressable style={styles.cancelChip} onPress={function () { handlePickItem(item); }}>
          <Text style={styles.cancelChipText}>ยกเลิก</Text>
        </Pressable>
      );
    } else {
      cancelButton = (
        <View style={styles.cancelChipDisabled}>
          <Text style={styles.cancelChipDisabledText}>ยกเลิกไม่ได้</Text>
        </View>
      );
    }

    return (
      <View
        key={item.order_item_id}
        onLayout={handleItemLayout}
        style={itemRowStyle}
      >
        <View style={styles.itemRowLeft}>
          <Text style={styles.itemName}>
            <Text style={styles.itemQty}>{item.quantity}× </Text>
            {item.name}
          </Text>
          <Text style={statusStyle}>{statusText}</Text>
        </View>
        {cancelButton}
      </View>
    );
  }

  function renderCancelLogRow(logEntry) {
    return (
      <View key={logEntry.id} style={styles.logRow}>
        <Text style={styles.logRowLeft} numberOfLines={1}>
          {logEntry.cancelled_time_label} · โต๊ะ {logEntry.table_number} รอบ {logEntry.round_number} ·{' '}
          {logEntry.name} ×{logEntry.quantity}
        </Text>
        <Text style={styles.logRowRight} numberOfLines={1}>
          {logEntry.reason}
        </Text>
      </View>
    );
  }

  function renderReasonOption(reasonOption) {
    const isActive = reasonOption.key === reasonKey;

    let radioStyle = styles.radioOuter;
    if (isActive) {
      radioStyle = [styles.radioOuter, styles.radioOuterActive];
    }

    let reasonRowStyle = styles.reasonRow;
    if (isActive) {
      reasonRowStyle = [styles.reasonRow, styles.reasonRowActive];
    }

    // จุดกลางวงกลม (โผล่ตอนเลือกตัวนี้)
    let radioDot = null;
    if (isActive) {
      radioDot = <View style={styles.radioInner} />;
    }

    let reasonTextStyle = styles.reasonText;
    if (isActive) {
      reasonTextStyle = [styles.reasonText, styles.reasonTextActive];
    }

    return (
      <Pressable
        key={reasonOption.key}
        onPress={function () { setReasonKey(reasonOption.key); }}
        style={reasonRowStyle}
      >
        <View style={radioStyle}>{radioDot}</View>
        <Text style={reasonTextStyle}>{reasonOption.label}</Text>
      </Pressable>
    );
  }

  // ---- หน้าจอ ----
  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.core.brandGreen} />
        <Text style={styles.centerScreenText}>กำลังโหลดออร์เดอร์...</Text>
      </View>
    );
  }

  if (!round) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerScreenText}>ไม่พบใบออร์เดอร์</Text>
      </View>
    );
  }

  // เนื้อหาในกล่อง "บันทึกการยกเลิกวันนี้" (ถ้าว่างให้ขึ้นข้อความแจ้ง)
  let cancelLogContent = null;
  if (cancelledLog.length === 0) {
    cancelLogContent = <Text style={styles.logEmptyText}>ยังไม่มีรายการที่ถูกยกเลิกวันนี้</Text>;
  } else {
    cancelLogContent = cancelledLog.map(renderCancelLogRow);
  }

  // แผงยืนยันด้านขวา: ถ้ายังไม่เลือกรายการให้บอกให้เลือกก่อน
  let confirmContent = null;
  if (!selectedItem) {
    confirmContent = (
      <View style={styles.centerScreen}>
        <Text style={styles.centerScreenText}>เลือกรายการที่ต้องการยกเลิกจากซ้ายมือ</Text>
      </View>
    );
  } else {
    // ปุ่มยืนยัน: ต้องเลือกเหตุผลก่อนถึงจะกดได้
    let confirmButtonStyle = styles.confirmButton;
    if (!reasonKey) {
      confirmButtonStyle = [styles.confirmButton, styles.confirmButtonDisabled];
    }

    // ตอนกำลังบันทึก ให้โชว์ loading แทนข้อความ
    let confirmButtonContent = <Text style={styles.confirmButtonText}>ยืนยันยกเลิก</Text>;
    if (isSubmitting) {
      confirmButtonContent = (
        <ActivityIndicator size="small" color={colors.core.screenBg} />
      );
    }

    confirmContent = (
      <>
        <Text style={styles.confirmTitle}>ยืนยันยกเลิกรายการ</Text>
        <Text style={styles.confirmSummary}>
          {selectedItem.name} ×{selectedItem.quantity} · โต๊ะ {round.table_number} รอบที่{' '}
          {round.round_number} · รายการนี้จะถูกตัดออกจากบิลลูกค้า
        </Text>

        <Text style={styles.reasonLabel}>เหตุผล</Text>
        <View style={styles.reasonList}>{REASON_OPTIONS.map(renderReasonOption)}</View>

        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>CANCELLED AT</Text>
            <Text style={styles.metaValue}>{formatNowHMS(now)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>BY</Text>
            <Text style={styles.metaValue}>{CURRENT_STAFF_ID}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>ORDER TIME</Text>
            <Text style={styles.metaValue}>{formatBangkokHMS(round.order_time)}</Text>
          </View>
        </View>

        <Pressable
          style={confirmButtonStyle}
          disabled={!reasonKey || isSubmitting}
          onPress={handleConfirmCancel}
        >
          {confirmButtonContent}
        </Pressable>

        <Pressable style={styles.dismissButton} onPress={handleDismiss}>
          <Text style={styles.dismissButtonText}>ไม่ยกเลิก</Text>
        </Pressable>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ซ้าย — 3 ส่วนแนวตั้ง: หัวตายตัว / รายการเมนูยืดเต็ม (เลื่อนเอง) / กฎ+log ชิดล่าง */}
      <View style={styles.leftPanel}>
        {/* ส่วนบน (ตายตัว) */}
        <View style={styles.leftTop}>
          <TouchableOpacity style={styles.backButton} onPress={function () { navigation.goBack(); }}>
            <Text style={styles.backButtonText}>กลับ</Text>
          </TouchableOpacity>

          <Text style={styles.roundTitle}>
            โต๊ะ {round.table_number} · รอบที่ {round.round_number}
          </Text>
        </View>

        {/* ส่วนกลาง (ยืดเต็ม) — รายการเมนูทั้งหมด เลื่อนดูได้ในตัวเอง ไม่มีการตัดกลางการ์ด */}
        <ScrollView
          ref={itemScrollRef}
          style={styles.itemScroll}
          contentContainerStyle={styles.itemScrollContent}
          showsVerticalScrollIndicator
        >
          {round.items.map(renderMenuItem)}
        </ScrollView>

        {/* ส่วนล่าง (ตายตัว ชิดล่างสุดของคอลัมน์) — บีบความสูงไว้ไม่ให้แย่งพื้นที่รายการเมนู */}
        <View style={styles.leftBottom}>
          <View style={styles.ruleBox}>
            <Text style={styles.ruleBoxTitle}>กฎการยกเลิก</Text>
            <Text style={styles.ruleBoxText}>
              ยกเลิกได้เฉพาะรายการที่ยังเป็น "รอทำ" เมื่อครัวเริ่มทำแล้วต้องให้พนักงานหน้าร้านอนุมัติ
              ทุกการยกเลิกจะบันทึกเวลาและผู้กดไว้ในบิล
            </Text>
          </View>

          <Text style={styles.logTitle}>บันทึกการยกเลิกวันนี้</Text>
          {/* จำกัดความสูง ≈ 3 รายการล่าสุด แล้วเลื่อนอ่านภายในกล่องเอง */}
          <ScrollView style={styles.logList} showsVerticalScrollIndicator>
            {cancelLogContent}
          </ScrollView>
        </View>
      </View>

      {/* ขวา — ยืนยันยกเลิกรายการที่เลือก */}
      <View style={styles.rightPanel}>{confirmContent}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- ทั้งหน้าจอ ----
  // gap: 0 เพราะเว้นระยะระหว่างสองคอลัมน์ด้วยเส้นคั่นใน leftPanel แทน
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.core.canvasBg,
    padding: 20,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerScreenText: {
    fontSize: 14,
    color: colors.text.placeholder,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // ---- คอลัมน์ซ้าย ----
  // column 3 ส่วน: บน (ตายตัว) / กลาง (flex) / ล่าง (ตายตัว ชิดล่าง)
  leftPanel: {
    flex: 1,
    minHeight: 0,
    // เส้นคั่นระหว่างคอลัมน์ซ้าย (รายการเมนู) กับคอลัมน์ขวา (ยืนยัน)
    paddingRight: 24,
    borderRightWidth: 2,
    borderRightColor: alpha.borderMid,
  },
  leftTop: {
    flexShrink: 0,
  },
  leftBottom: {
    flexShrink: 0,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.searchChip,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.core.brandGreen,
  },
  // ชื่อโต๊ะ — หัวเรื่องของคอลัมน์ซ้าย
  roundTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginBottom: 18,
  },

  // ---- รายการเมนู ----
  // ยืดเต็มพื้นที่ที่เหลือ ไม่มี height/maxHeight ตายตัว (ไม่ตัดกลางการ์ด)
  itemScroll: {
    flex: 1,
    minHeight: 0,
  },
  itemScrollContent: {
    gap: 14,
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  itemRowSelected: {
    borderColor: colors.red.action,
    borderWidth: 2,
  },
  itemRowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  // ชื่อเมนู — ขยายให้อ่านง่ายจากระยะไกล
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    lineHeight: 26,
  },
  itemQty: {
    color: colors.core.brandGreen,
  },
  itemMeta: {
    fontSize: 14,
    color: colors.text.placeholder,
    marginTop: 5,
  },
  itemMetaCooking: {
    color: colors.orange.textDark,
  },
  cancelChip: {
    borderWidth: 1.5,
    borderColor: colors.red.action,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cancelChipText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.red.action,
  },
  cancelChipDisabled: {
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cancelChipDisabledText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.placeholder,
  },

  // ---- กฎการยกเลิก + บันทึกการยกเลิกวันนี้ ----
  // บีบความสูงไว้ ไม่ให้แย่งพื้นที่รายการเมนู
  // เส้นคั่นระหว่างรายการเมนู กับกล่อง "กฎการยกเลิก"
  ruleBox: {
    backgroundColor: colors.red.bgLight,
    borderRadius: 12,
    padding: 12,
    // เส้นคั่นระหว่างรายการเมนู กับกล่อง "กฎการยกเลิก" — ขอบบนเข้มกว่าขอบอื่น
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
    borderTopWidth: 2,
    borderTopColor: colors.red.action,
    marginTop: 14,
  },
  ruleBoxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.red.action,
    marginBottom: 6,
  },
  ruleBoxText: {
    fontSize: 13,
    color: colors.text.description,
    lineHeight: 19,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginTop: 12,
    marginBottom: 6,
  },
  // จำกัด ≈ 3 รายการล่าสุด แล้วเลื่อนอ่านในกล่องเอง
  logList: {
    maxHeight: 84,
  },
  logEmptyText: {
    fontSize: 13,
    color: colors.text.placeholder,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 5,
  },
  logRowLeft: {
    flex: 1,
    fontSize: 13,
    color: colors.text.description,
  },
  logRowRight: {
    fontSize: 13,
    color: colors.text.placeholder,
  },

  // ---- คอลัมน์ขวา (ยืนยัน) ----
  rightPanel: {
    width: 360,
    minHeight: 0,
    backgroundColor: colors.core.screenBg,
    borderRadius: 20,
    padding: 24,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  confirmSummary: {
    fontSize: 15,
    color: colors.text.description,
    marginTop: 12,
    lineHeight: 22,
  },

  // ---- ตัวเลือกเหตุผล ----
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.label,
    marginTop: 22,
    marginBottom: 12,
  },
  reasonList: {
    gap: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  reasonRowActive: {
    borderColor: colors.red.action,
    borderWidth: 2,
    backgroundColor: colors.red.bgLight,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.surface.switchOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.red.action,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: colors.red.action,
  },
  reasonText: {
    fontSize: 15,
    color: colors.text.secondary,
  },
  reasonTextActive: {
    color: colors.red.action,
    fontWeight: '600',
  },

  // ---- กล่อง metadata ----
  metaBox: {
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 12,
    padding: 16,
    marginTop: 22,
    gap: 10,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: {
    fontSize: 13,
    color: colors.text.placeholder,
    fontFamily: 'monospace',
  },
  metaValue: {
    fontSize: 13,
    color: colors.text.secondary,
    fontFamily: 'monospace',
  },

  // ---- ปุ่มยืนยัน / ไม่ยกเลิก ----
  // ปุ่มหลักของหน้า — ขยายให้เด่น กดง่าย
  confirmButton: {
    backgroundColor: colors.red.action,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 62,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  dismissButton: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
