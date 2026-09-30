import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import colors, { alpha } from '../customer/style/colors';
import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { formatNowHM, getWaitMinutes } from '../../utils/time';

// ทุก query อ่านจากฐานข้อมูลชุดเดียวกับฝั่งลูกค้า (bills -> order_rounds -> order_items)
// รายการในคิวคือสิ่งที่ลูกค้ากด "ส่งเข้าครัว" ใส่ DB ไว้ ไม่มีข้อมูลชุดแยกของครัว
import {
  getKitchenQueue,
  getNextQueueRounds,
  markRoundAsServed,
  startRoundCooking,
  getServedHistory,
  getCancelledItems,
} from '../../db/queries_kitchen/queue';

// แท็บกรองสถานะในหัวจอ
const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'waiting', label: 'รอทำ' },
  { key: 'cooking', label: 'กำลังทำ' },
  { key: 'served', label: 'เสิร์ฟแล้ว' },
];

// เกินเวลานี้ (นาที) ให้ขึ้นป้าย "เกินเวลา" และกรอบการ์ดเป็นสีแดง
const OVERDUE_MINUTES = 15;

// ดึงข้อมูลคิวครัวใหม่ทุก 20 วิ (จอครัวเปิดค้างตลอด ไม่ได้พึ่ง focus event อย่างเดียว)
const REFRESH_INTERVAL_MS = 20000;

// การ์ดหลักโชว์สูงสุด 3 ใบในพื้นที่ตรงกลาง ที่เหลือไปต่อท้ายในแผง "คิวถัดไป" ทางขวา
const MAIN_CARD_LIMIT = 3;

// ระยะห่างระหว่างการ์ดในแถว (ต้องตรงกับ roundCardRow.gap)
const CARD_GAP = 16;

// จอแคบกว่านี้ (มือถือ/แท็บเล็ตแนวตั้ง) ยัด 3 คอลัมน์ไม่ได้ — ลดจำนวนคอลัมน์ลง
const NARROW_BREAKPOINT = 700;
const TINY_BREAKPOINT = 480;

// ---------------------------------------------------------------------------
// ฟังก์ชันช่วยเลือกข้อมูล (อยู่นอก component เพราะไม่ต้องใช้ state)
// ---------------------------------------------------------------------------

// สีตัวอักษรของสถานะรายการ
function getStatusColor(status) {
  if (status === 'cooking') {
    return colors.orange.textDark;
  }
  if (status === 'served') {
    return colors.core.brandGreen;
  }
  return colors.text.label; // waiting
}

// ข้อความสถานะใต้ชื่อเมนู
function getStatusLabel(status, statusTime) {
  if (status === 'cooking') {
    if (statusTime) {
      return 'กำลังทำ · ' + statusTime;
    }
    return 'กำลังทำ';
  }
  if (status === 'served') {
    if (statusTime) {
      return 'เสิร์ฟแล้ว · ' + statusTime;
    }
    return 'เสิร์ฟแล้ว';
  }
  return 'รอทำ';
}

// สรุปสถานะรวมของทั้งใบ เพื่อตัดสินว่าปุ่ม action ล่างการ์ดควรเป็นแบบไหน
// TODO: ปรับ logic ตรงนี้ถ้าเงื่อนไขจริงต่างจากที่อนุมานไว้จากดีไซน์
function getRoundAction(round) {
  let waitingCount = 0;
  let servedCount = 0;
  for (const item of round.items) {
    if (item.status === 'waiting') {
      waitingCount += 1;
    }
    if (item.status === 'served') {
      servedCount += 1;
    }
  }

  const unservedCount = round.items.length - servedCount;
  const isFullyServed = servedCount === round.items.length;

  // เสิร์ฟครบทุกรายการแล้ว
  if (isFullyServed) {
    return {
      type: 'done',
      buttonLabel: 'เสิร์ฟครบแล้ว',
      buttonColor: colors.surface.switchOff,
      textColor: colors.text.secondary,
      helperText: 'ใบนี้เสร็จสมบูรณ์',
      disabled: false,
    };
  }

  // ยังมีรายการรอทำอยู่ → เริ่มทำทั้งใบ
  if (waitingCount > 0) {
    let helperText = '';
    if (waitingCount === round.items.length) {
      helperText = 'ทั้งใบยังรอทำ';
    } else {
      helperText = 'ยกเลิกได้ ' + waitingCount + ' รายการ';
    }
    return {
      type: 'startCooking',
      buttonLabel: 'เริ่มทำทั้งใบ',
      buttonColor: colors.mustard.bg,
      textColor: colors.mustard.text,
      helperText: helperText,
      disabled: false,
    };
  }

  // เหลือแต่รายการที่กำลังทำ → เสิร์ฟทั้งใบ
  return {
    type: 'markServed',
    buttonLabel: 'เสิร์ฟแล้วทั้งใบ',
    buttonColor: colors.core.brandGreen,
    textColor: colors.core.screenBg,
    helperText: 'เหลือ ' + unservedCount + ' รายการที่ยังไม่เสิร์ฟ',
    disabled: false,
  };
}

// นับจำนวนใบของแต่ละสถานะ เอาไปแสดงในตัวเลขบนแท็บกรอง
function countRoundsByStatus(roundList) {
  const counts = {
    all: roundList.length,
    waiting: 0,
    cooking: 0,
    served: 0,
  };

  for (const round of roundList) {
    let hasWaiting = false;
    let hasCooking = false;
    let allServed = true;

    for (const item of round.items) {
      if (item.status === 'waiting') {
        hasWaiting = true;
      }
      if (item.status === 'cooking') {
        hasCooking = true;
      }
      if (item.status !== 'served') {
        allServed = false;
      }
    }

    if (hasWaiting) {
      counts.waiting += 1;
    }
    if (hasCooking) {
      counts.cooking += 1;
    }
    if (allServed) {
      counts.served += 1;
    }
  }

  return counts;
}

// กรองใบออร์เดอร์ตามแท็บที่เลือก
function filterRoundsByStatus(roundList, activeFilter) {
  if (activeFilter === 'waiting') {
    return roundList.filter(function (round) {
      for (const item of round.items) {
        if (item.status === 'waiting') {
          return true;
        }
      }
      return false;
    });
  }

  if (activeFilter === 'cooking') {
    return roundList.filter(function (round) {
      for (const item of round.items) {
        if (item.status === 'cooking') {
          return true;
        }
      }
      return false;
    });
  }

  if (activeFilter === 'served') {
    return roundList.filter(function (round) {
      for (const item of round.items) {
        if (item.status !== 'served') {
          return false;
        }
      }
      return true;
    });
  }

  return roundList;
}

// จำนวนคอลัมน์ของกริดการ์ดหลักตามความกว้างจอ
// จอกว้าง = 3 คอลัมน์ / จอกลาง = 2 / จอแคบ = 1
function getColumnCount(windowWidth) {
  if (windowWidth < NARROW_BREAKPOINT) {
    if (windowWidth < TINY_BREAKPOINT) {
      return 1;
    }
    return 2;
  }
  return MAIN_CARD_LIMIT;
}

// แบ่งการ์ดหลักออกเป็นแถว แถวละ columnCount ใบ
function splitIntoRows(roundList, columnCount) {
  const rows = [];
  for (let index = 0; index < roundList.length; index += columnCount) {
    rows.push(roundList.slice(index, index + columnCount));
  }
  return rows;
}

// นับรายการที่ยังไม่ถูกยกเลิกของใบหนึ่ง
function countActiveItems(itemList) {
  let count = 0;
  for (const item of itemList) {
    if (item.status !== 'cancelled') {
      count += 1;
    }
  }
  return count;
}

// แผง "คิวถัดไป" = ใบที่เกิน MAIN_CARD_LIMIT + ใบที่ครัวยังไม่เริ่มทำ
// ตัดใบที่ซ้ำกับการ์ดหลักออก เพราะบางใบอาจโผล่ทั้งสองที่
function buildSideRounds(filteredRounds, mainRounds, nextQueue) {
  const seenRoundIds = {};
  for (const mainRound of mainRounds) {
    seenRoundIds[mainRound.round_id] = true;
  }

  const sideRounds = [];

  function addSideRound(queuedRound) {
    if (seenRoundIds[queuedRound.round_id]) {
      return;
    }
    seenRoundIds[queuedRound.round_id] = true;
    sideRounds.push(queuedRound);
  }

  const extraRounds = filteredRounds.slice(MAIN_CARD_LIMIT);
  for (const extraRound of extraRounds) {
    addSideRound({
      round_id: extraRound.round_id,
      table_number: extraRound.table_number,
      round_number: extraRound.round_number,
      order_time_label: extraRound.order_time_label,
      item_count: countActiveItems(extraRound.items),
    });
  }

  for (const nextRound of nextQueue) {
    addSideRound(nextRound);
  }

  return sideRounds;
}

export default function OrderKitScreen({ navigation }) {
  const db = useSQLiteContext();

  // ---- state ----
  const [rounds, setRounds] = useState([]);
  const [nextQueue, setNextQueue] = useState([]);
  const [activeFilter, setActiveFilter] = useState('waiting');
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [updatingRoundId, setUpdatingRoundId] = useState(null);
  const [gridWidth, setGridWidth] = useState(0);

  // null = ปิดหน้าต่าง / 'history' = ประวัติที่เสิร์ฟแล้ว / 'cancelled' = รายการที่ถูกยกเลิก
  const [modal, setModal] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [cancelledData, setCancelledData] = useState([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  // ---- โหลดข้อมูลจาก DB ----
  // ใช้ useCallback เพราะอยู่ใน dependency ของ useFocusEffect และ useEffect
  // (ถ้าเปลี่ยนทุกครั้งจะโหลดซ้ำวนไป)
  const loadQueue = useCallback(async function (options) {
    const isSilent = options ? options.silent : false;
    if (!isSilent) {
      setIsLoading(true);
    }
    try {
      const queueResult = await getKitchenQueue(db);
      const nextQueueResult = await getNextQueueRounds(db);
      setRounds(queueResult);
      setNextQueue(nextQueueResult);
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, [db]);

  // รีเฟรชทุกครั้งที่กลับมาหน้านี้
  useFocusEffect(
    useCallback(function () {
      loadQueue();
    }, [loadQueue])
  );

  // จอครัวเปิดค้างอยู่ตลอด ต้องดึงข้อมูลใหม่เป็นระยะแม้ไม่ได้สลับหน้าจอ
  // (silent = ไม่โชว์ full-screen loading ซ้ำ)
  useEffect(function () {
    const poller = setInterval(function () {
      loadQueue({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return function () {
      clearInterval(poller);
    };
  }, [loadQueue]);

  // นาฬิกา + นับเวลารอ — อัปเดตทุกวินาทีเพื่อให้เป็น real-time จริง
  useEffect(function () {
    const timer = setInterval(function () {
      setNow(Date.now());
    }, 1000);
    return function () {
      clearInterval(timer);
    };
  }, []);

  // ---- คำนวณข้อมูลที่ใช้แสดงผล (ทำใหม่ทุกครั้งที่ render) ----
  const counts = countRoundsByStatus(rounds);
  const filteredRounds = filterRoundsByStatus(rounds, activeFilter);

  // จอกว้าง / จอแคบ → จำนวนคอลัมน์ (แผงคิวถัดไปยังเป็นแนวตั้งเหมือนเดิมทุกโหมด)
  const windowSize = useWindowDimensions();
  const windowWidth = windowSize.width;
  const isNarrow = windowWidth < NARROW_BREAKPOINT;
  const columnCount = getColumnCount(windowWidth);

  // การ์ดหลัก: สูงสุด MAIN_CARD_LIMIT ใบ
  const mainRounds = filteredRounds.slice(0, MAIN_CARD_LIMIT);
  const mainCardRows = splitIntoRows(mainRounds, columnCount);

  // ความกว้างการ์ดคงที่ = 1 ใน 3 ของพื้นที่การ์ดหลักเสมอ ไม่ว่าจะมีกี่โต๊ะ
  // (การ์ดชิดซ้าย ที่ว่างทางขวาเป็นพื้นที่ว่างตามธรรมชาติ ไม่ขยายการ์ด)
  let cardWidth = 0;
  if (gridWidth > 0) {
    const totalGap = CARD_GAP * (MAIN_CARD_LIMIT - 1);
    cardWidth = Math.floor((gridWidth - totalGap) / MAIN_CARD_LIMIT);
  }

  const sideRounds = buildSideRounds(filteredRounds, mainRounds, nextQueue);

  // ---- ฟังก์ชันกดปุ่ม ----
  // ปุ่มล่างการ์ด: เริ่มทำทั้งใบ / เสิร์ฟแล้วทั้งใบ
  async function handleRoundAction(round) {
    const action = getRoundAction(round);
    if (action.disabled) {
      return;
    }

    setUpdatingRoundId(round.round_id);
    try {
      if (action.type === 'markServed') {
        await markRoundAsServed(db, round.round_id);
      } else {
        await startRoundCooking(db, round.round_id);
      }
      await loadQueue({ silent: true });
    } finally {
      setUpdatingRoundId(null);
    }
  }

  async function openHistoryModal() {
    setModal('history');
    setIsModalLoading(true);
    try {
      const historyList = await getServedHistory(db);
      setHistoryData(historyList);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function openCancelledModal() {
    setModal('cancelled');
    setIsModalLoading(true);
    try {
      const cancelledList = await getCancelledItems(db);
      setCancelledData(cancelledList);
    } finally {
      setIsModalLoading(false);
    }
  }

  function closeModal() {
    setModal(null);
  }

  // กลับไปหน้าเลือกโต๊ะฝั่งลูกค้า (ถ้าหน้านี้อยู่ใน stack อยู่แล้ว navigate จะ pop กลับไปใบเดิม)
  function goSelectTable() {
    navigation.navigate('SelectTable');
  }

  // ---- ส่วนย่อยที่ใช้ซ้ำใน JSX ----
  function renderFilterChip(filter) {
    const isActive = filter.key === activeFilter;

    let chipStyle = styles.filterChip;
    let chipTextStyle = styles.filterChipText;
    if (isActive) {
      chipStyle = [styles.filterChip, styles.filterChipActive];
      chipTextStyle = [styles.filterChipText, styles.filterChipTextActive];
    }

    return (
      <TouchableOpacity
        key={filter.key}
        activeOpacity={0.75}
        onPress={function () { setActiveFilter(filter.key); }}
        style={chipStyle}
      >
        <Text style={chipTextStyle}>
          {filter.label} {counts[filter.key]}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderRoundCard(round) {
    // เวลารอคิวคำนวณจาก ordered_at (UTC ใน DB) เทียบกับ Now Date ตัวเดียวกับนาฬิกาบนหัวจอ
    const waitMinutes = getWaitMinutes(round.order_time, now);
    const isOverdue = waitMinutes > OVERDUE_MINUTES;
    const action = getRoundAction(round);
    const isUpdating = updatingRoundId === round.round_id;

    // เกินเวลา = กรอบแดง + ป้ายแดง
    let cardStyle = [styles.roundCard, { width: cardWidth }];
    if (isOverdue) {
      cardStyle = [styles.roundCard, { width: cardWidth }, styles.roundCardOverdue];
    }

    let overdueBadge = null;
    if (isOverdue) {
      overdueBadge = (
        <View style={styles.overdueBadge}>
          <Text style={styles.overdueBadgeText}>เกินเวลา</Text>
        </View>
      );
    }

    // ตัวอักษรเวลารอ: ปกติ / แดงเมื่อเกินเวลา
    let waitMinutesStyle = styles.waitMinutes;
    if (isOverdue) {
      waitMinutesStyle = [styles.waitMinutes, styles.waitMinutesOverdue];
    }

    // ตอนกำลังบันทึก ให้ปุ่มโชว์ loading แทนข้อความ
    let actionButtonContent = (
      <Text style={[styles.actionButtonText, { color: action.textColor }]}>
        {action.buttonLabel}
      </Text>
    );
    if (isUpdating) {
      actionButtonContent = (
        <ActivityIndicator size="small" color={action.textColor} />
      );
    }

    return (
      <View key={round.round_id} style={cardStyle}>
        {/* แตะหัวการ์ด = เปิดหน้ารายละเอียดใบนี้ */}
        <Pressable
          onPress={function () {
            navigation.navigate('RoundStatusScreen', { roundId: round.round_id });
          }}
          style={function (pressState) {
            if (pressState.pressed) {
              return [styles.roundCardHeader, { opacity: 0.7 }];
            }
            return styles.roundCardHeader;
          }}
        >
          <View style={styles.roundCardHeadLeft}>
            <Text style={styles.tableName}>โต๊ะ {round.table_number}</Text>
            <Text style={styles.roundMeta}>
              รอบที่ {round.round_number} · {round.items.length} รายการ
            </Text>
          </View>
          <View style={styles.roundTimeCol}>
            {overdueBadge}
            <Text style={styles.orderTime}>{round.order_time_label}</Text>
            <Text style={waitMinutesStyle}>{waitMinutes} นาที</Text>
          </View>
        </Pressable>

        {/* เส้นคั่นระหว่างหัวโต๊ะ (ชื่อโต๊ะ/เวลา) กับรายการอาหารด้านล่าง */}
        <View style={styles.cardHeaderDivider} />

        {/* รายการอาหาร — เลื่อนภายในการ์ดได้ เพื่อให้ปุ่มด้านล่างชิดขอบล่างเสมอ */}
        <ScrollView style={styles.itemList} showsVerticalScrollIndicator>
          {round.items.map(function (item, itemIndex) {
            // เส้นคั่นระหว่างจาน เอาไว้หัวจานที่ 2 เป็นต้นไป (จานแรกไม่ต้องมีเส้นด้านบน)
            let itemDivider = null;
            if (itemIndex > 0) {
              itemDivider = <View style={styles.itemDivider} />;
            }

            // ตัวเลือกเพิ่มเติม (ถ้าไม่มีจะไม่แสดงบรรทัดนี้)
            let modifierText = null;
            if (item.modifiers && item.modifiers.length > 0) {
              modifierText = (
                <Text style={styles.itemModifier}>{item.modifiers.join(' · ')}</Text>
              );
            }

            // หมายเหตุของเมนู (ถ้าไม่มีจะไม่แสดงบรรทัดนี้)
            let noteText = null;
            if (item.note) {
              noteText = <Text style={styles.itemNote}>{item.note}</Text>;
            }

            return (
              <View key={item.order_item_id} style={styles.itemRow}>
                {itemDivider}
                <Text style={styles.itemNameLine}>
                  <Text style={styles.itemQty}>{item.quantity}× </Text>
                  {item.name}
                </Text>
                {modifierText}
                {noteText}
                <Text style={[styles.itemStatus, { color: getStatusColor(item.status) }]}>
                  {getStatusLabel(item.status, item.status_time)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <Pressable
          disabled={action.disabled || isUpdating}
          onPress={function () { handleRoundAction(round); }}
          style={function (pressState) {
            const buttonStyles = [styles.actionButton, { backgroundColor: action.buttonColor }];
            if (pressState.pressed && !action.disabled) {
              buttonStyles.push(styles.actionButtonPressed);
            }
            if (action.disabled) {
              buttonStyles.push(styles.actionButtonDisabled);
            }
            return buttonStyles;
          }}
        >
          {actionButtonContent}
        </Pressable>
        <Text style={styles.actionHelperText}>{action.helperText}</Text>
      </View>
    );
  }

  function renderNextQueueItem(queuedRound) {
    return (
      <View key={queuedRound.round_id} style={styles.nextQueueItem}>
        <Text style={styles.nextQueueTable}>
          โต๊ะ {queuedRound.table_number} · รอบ {queuedRound.round_number}
        </Text>
        <Text style={styles.nextQueueMeta}>
          {queuedRound.order_time_label} · {queuedRound.item_count} รายการ
        </Text>
      </View>
    );
  }

  function renderLegendItem(legend) {
    return (
      <View key={legend.label} style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: legend.color }]} />
        <Text style={styles.legendText}>{legend.label}</Text>
      </View>
    );
  }

  function renderHistoryRow(historyRow) {
    return (
      <View key={historyRow.round_id} style={styles.modalListItem}>
        <Text style={styles.modalListItemTitle}>
          โต๊ะ {historyRow.table_number} · รอบ {historyRow.round_number}
        </Text>
        <Text style={styles.modalListItemMeta}>
          {historyRow.item_count} รายการ · เสิร์ฟเสร็จ {historyRow.served_time_label}
        </Text>
      </View>
    );
  }

  function renderCancelledRow(cancelledRow) {
    return (
      <View key={cancelledRow.id} style={styles.modalListItem}>
        <Text style={styles.modalListItemTitle}>
          โต๊ะ {cancelledRow.table_number} · {cancelledRow.quantity}× {cancelledRow.name}
        </Text>
        <Text style={styles.modalListItemMeta}>
          ยกเลิกเมื่อ {cancelledRow.cancelled_time_label} · {cancelledRow.reason}
        </Text>
      </View>
    );
  }

  // คำอธิบายสีของจุดในสัญลักษณ์ด้านล่างจอ
  const LEGEND_ITEMS = [
    { label: 'รอทำ', color: colors.text.label },
    { label: 'กำลังทำ', color: colors.orange.textDark },
    { label: 'เสิร์ฟแล้ว', color: colors.core.brandGreen },
    { label: 'เกิน 15 นาที', color: colors.red.action },
  ];

  // ---- หน้าจอ ----
  // พื้นที่การ์ดหลัก: กำลังโหลด / ไม่มีออร์เดอร์ / กริดการ์ด
  let gridContent = null;
  if (isLoading) {
    gridContent = (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.core.brandGreen} />
        <Text style={styles.centerStateText}>กำลังโหลดคิวครัว...</Text>
      </View>
    );
  } else if (filteredRounds.length === 0) {
    gridContent = (
      <View style={styles.centerState}>
        <Text style={styles.centerStateEmoji}>🍽️</Text>
        <Text style={styles.centerStateText}>ไม่มีออร์เดอร์ในหมวดนี้</Text>
      </View>
    );
  } else {
    // ไม่มี ScrollView ซ้อน: แต่ละแถวได้ความสูงเท่ากัน การ์ดจึงยืดเต็มแนวตั้ง
    // และรายการอาหารข้างในการ์ดเลื่อนเอง ปุ่มจึงชิดล่างสุดเสมอ
    gridContent = (
      <View
        style={styles.roundsGrid}
        onLayout={function (layoutEvent) {
          setGridWidth(layoutEvent.nativeEvent.layout.width);
        }}
      >
        {mainCardRows.map(function (cardRow, rowIndex) {
          return (
            <View key={'round-row-' + rowIndex} style={styles.roundCardRow}>
              {cardRow.map(renderRoundCard)}
            </View>
          );
        })}
      </View>
    );
  }

  // แผงคิวถัดไป: แสดงตลอด แม้ไม่มีคิวรอ (เนื้อหาอยู่ใน JSX ด้านล่าง)
  // เนื้อหาในหน้าต่างเล็ก (ประวัติที่เสิร์ฟแล้ว / รายการที่ถูกยกเลิก)
  let modalListContent = null;
  if (modal === 'history') {
    if (historyData.length === 0) {
      modalListContent = <Text style={styles.modalEmptyText}>ยังไม่มีรายการ</Text>;
    } else {
      modalListContent = historyData.map(renderHistoryRow);
    }
  } else if (modal === 'cancelled') {
    if (cancelledData.length === 0) {
      modalListContent = <Text style={styles.modalEmptyText}>ยังไม่มีรายการที่ถูกยกเลิก</Text>;
    } else {
      modalListContent = cancelledData.map(renderCancelledRow);
    }
  }

  // ชื่อหน้าต่างเล็ก (เปลี่ยนตามปุ่มที่กด)
  let modalTitle = '';
  if (modal === 'history') {
    modalTitle = 'ประวัติที่เสิร์ฟแล้ว';
  } else {
    modalTitle = 'รายการที่ถูกยกเลิก';
  }
  return (
    <View style={styles.screen}>
      {/* Header — ชื่อหน้า + แท็บกรอง (ซ้าย) / ข้อความเรียง + นาฬิกา (ขวา) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>คิวครัว</Text>
          <View style={styles.filterRow}>{FILTERS.map(renderFilterChip)}</View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.sortLabel}>เรียง: เวลาที่สั่ง ใหม่ → เก่า</Text>
          <Text style={styles.clockText}>{formatNowHM(now)}</Text>
        </View>
      </View>

      {/* เนื้อหาหลัก: กริดการ์ดออร์เดอร์ (สูงสุด MAIN_CARD_LIMIT ใบ) + แผงคิวถัดไป */}
      <View style={[styles.body, isNarrow && styles.bodyNarrow]}>
        {gridContent}

        {/* แผงคิวถัดไป (แนวตั้งทุกโหมด) — แสดงตลอด แม้ไม่มีคิวรอ */}
        <View style={[styles.nextQueuePanel, isNarrow && styles.nextQueuePanelNarrow]}>
          <Text style={styles.nextQueueTitle}>คิวถัดไป · {sideRounds.length} ใบ</Text>
          {sideRounds.length === 0 ? (
            <Text style={styles.nextQueueEmpty}>ยังไม่มีโต๊ะรอคิว</Text>
          ) : (
            <ScrollView style={styles.nextQueueList} showsVerticalScrollIndicator>
              {sideRounds.map(renderNextQueueItem)}
            </ScrollView>
          )}
          <Text style={styles.nextQueueHint}>
            ออร์เดอร์ที่เกิน {MAIN_CARD_LIMIT} ใบหลัก และใบที่ครัวยังไม่เริ่มทำ จะต่อคิวอยู่ในแผงนี้
          </Text>
        </View>
      </View>

      {/* Footer — สัญลักษณ์สถานะ (ซ้าย) + ปุ่ม (ขวา) */}
      <View style={styles.footer}>
        <View style={styles.legendRow}>{LEGEND_ITEMS.map(renderLegendItem)}</View>

        <View style={styles.footerButtonsRow}>
          <TouchableOpacity activeOpacity={0.75} style={styles.footerButtonGhost} onPress={goSelectTable}>
            <Text style={styles.footerButtonText}>ไปหน้าเลือกโต๊ะ</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.75} style={styles.footerButton} onPress={openHistoryModal}>
            <Text style={styles.footerButtonText}>ประวัติที่เสิร์ฟแล้ว</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.75} style={styles.footerButton} onPress={openCancelledModal}>
            <Text style={styles.footerButtonText}>รายการที่ถูกยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal: ประวัติที่เสิร์ฟแล้ว / รายการที่ถูกยกเลิก */}
      <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseButtonText}>×</Text>
              </Pressable>
            </View>

            {isModalLoading ? (
              <ActivityIndicator size="small" color={colors.core.brandGreen} style={styles.modalLoading} />
            ) : (
              <ScrollView style={styles.modalList}>{modalListContent}</ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- ทั้งหน้าจอ ----
  screen: {
    flex: 1,
    backgroundColor: colors.core.canvasBg,
    padding: 20,
  },

  // ---- หัวจอ ----
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  filterChip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.surface.searchChip,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  filterChipActive: {
    backgroundColor: colors.core.darkGreen,
    borderColor: colors.core.darkGreen,
  },
  filterChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  filterChipTextActive: {
    color: colors.core.screenBg,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  sortLabel: {
    fontSize: 13,
    color: colors.text.placeholder,
  },
  clockText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginTop: 6,
  },

  // ---- พื้นที่เนื้อหา ----
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  // จอแคบ: การ์ดหลักอยู่บน แผงคิวถัดไปลงล่าง (ยังเป็นแนวตั้ง)
  bodyNarrow: {
    flexDirection: 'column',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerStateEmoji: {
    fontSize: 36,
  },
  centerStateText: {
    fontSize: 14,
    color: colors.text.placeholder,
  },

  // ---- กริดการ์ดหลัก ----
  // แถวละ columnCount ใบ — การ์ดกว้างคงที่ 1/3 ของพื้นที่นี้ (คำนวณใน component)
  // แถวใช้ alignItems: 'stretch' (ค่า default) → ทุกการ์ดสูงเต็มพื้นที่แนวตั้งและสูงเท่ากัน
  roundsGrid: {
    flex: 1,
    gap: CARD_GAP,
  },
  roundCardRow: {
    flex: 1,
    flexDirection: 'row',
    gap: CARD_GAP,
  },

  // ---- การ์ดออร์เดอร์ ----
  roundCard: {
    flexGrow: 0,
    // ให้รายการอาหาร (flex: 1) ดันปุ่มไปชิดล่างสุด
    flexDirection: 'column',
    backgroundColor: colors.core.screenBg,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
    shadowColor: colors.core.darkGreen,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 3,
  },
  roundCardOverdue: {
    borderColor: colors.red.action,
    borderWidth: 1.5,
  },
  overdueBadge: {
    backgroundColor: colors.red.action,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 8,
    alignSelf: 'flex-end',
  },
  overdueBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  roundCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  // การ์ดแคบลง (3 คอลัมน์) ต้องกันข้อความซ้ายไม่ให้ถูกเวลาด้านขวาบีบ
  roundCardHeadLeft: {
    flex: 1,
    paddingRight: 8,
  },
  tableName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  roundMeta: {
    fontSize: 14,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  roundTimeCol: {
    alignItems: 'flex-end',
  },
  orderTime: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  waitMinutes: {
    fontSize: 14,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  waitMinutesOverdue: {
    color: colors.red.action,
    fontWeight: 'bold',
  },

  // ---- รายการอาหารในการ์ด ----
  // เลื่อนภายในการ์ดได้ เพื่อให้ปุ่มด้านล่างชิดขอบล่างเสมอ
  itemList: {
    flex: 1,
    marginTop: 4,
  },
  // เส้นคั่นระหว่างหัวโต๊ะกับรายการอาหาร
  cardHeaderDivider: {
    height: 1.5,
    backgroundColor: alpha.borderMid,
    marginTop: 16,
  },
  // เส้นคั่นระหว่างจานอาหารแต่ละจาน
  itemDivider: {
    height: 1.5,
    backgroundColor: alpha.borderMid,
    marginBottom: 14,
  },
  itemRow: {
    paddingBottom: 14,
    gap: 4,
  },
  itemNameLine: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    lineHeight: 26,
  },
  itemQty: {
    color: colors.core.brandGreen,
  },
  itemModifier: {
    fontSize: 14,
    color: colors.text.label,
  },
  itemNote: {
    fontSize: 14,
    color: colors.orange.textDark,
  },
  itemStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },

  // ---- ปุ่ม action ล่างการ์ด ----
  // ปุ่มหลักของการ์ด — ขยายให้ใหญ่หนักแน่น กดง่ายจากระยะไกล
  actionButton: {
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 60,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionHelperText: {
    fontSize: 13,
    color: colors.text.placeholder,
    textAlign: 'center',
    marginTop: 8,
  },

  // ---- แผงคิวถัดไป ----
  nextQueuePanel: {
    width: 220,
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 18,
    padding: 16,
  },
  nextQueuePanelNarrow: {
    width: '100%',
    maxHeight: 200,
  },
  nextQueueTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  nextQueueEmpty: {
    fontSize: 14,
    color: colors.text.placeholder,
    marginTop: 14,
  },
  nextQueueList: {
    flex: 1,
    marginTop: 14,
  },
  nextQueueItem: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  nextQueueTable: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  nextQueueMeta: {
    fontSize: 13,
    color: colors.text.placeholder,
    marginTop: 5,
  },
  nextQueueHint: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 10,
  },

  // ---- ท้ายจอ ----
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: colors.text.description,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerButton: {
    backgroundColor: colors.surface.sidebarCard,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  // ปุ่มย้อนกลับไปหน้าเลือกโต๊ะ — เส้นขอบ ไม่มีพื้นหลัง ให้แยกจากปุ่ม modal
  footerButtonGhost: {
    borderWidth: 1.5,
    borderColor: colors.core.darkGreen,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },

  // ---- หน้าต่างเล็ก ----
  modalOverlay: {
    flex: 1,
    backgroundColor: alpha.borderMax,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: 380,
    maxHeight: '70%',
    backgroundColor: colors.core.screenBg,
    borderRadius: 20,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  modalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.searchChip,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  modalLoading: {
    marginVertical: 24,
  },
  modalList: {
    maxHeight: 320,
  },
  modalEmptyText: {
    fontSize: 15,
    color: colors.text.placeholder,
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalListItem: {
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  modalListItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  modalListItemMeta: {
    fontSize: 13,
    color: colors.text.placeholder,
    marginTop: 5,
  },
});
