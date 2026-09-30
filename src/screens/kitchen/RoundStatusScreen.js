import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import colors, { alpha } from '../customer/style/colors';
import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { getWaitMinutes } from '../../utils/time';

// อ่านจากฐานข้อมูลชุดเดียวกับฝั่งลูกค้า — สถานะที่เปลี่ยนที่นี่ถูกเขียนกลับลง order_items ตัวเดียวกัน
import {
  getKitchenQueue,
  markRoundAsServed,
  updateItemStatus,
} from '../../db/queries_kitchen/queue';

// ขั้นสถานะของรายการหนึ่งชิ้น เรียงตามลำดับที่เดินไปได้
const STATUS_STEPS = [
  { key: 'waiting', label: 'รอทำ' },
  { key: 'cooking', label: 'กำลังทำ' },
  { key: 'served', label: 'เสิร์ฟแล้ว' },
];

// ---------------------------------------------------------------------------
// ฟังก์ชันช่วยเลือกสี/ข้อความ/สรุป (อยู่นอก component เพราะไม่ต้องใช้ state)
// ---------------------------------------------------------------------------

// เดินหน้าทางเดียว: กดได้เฉพาะขั้นถัดไปเท่านั้น ย้อนกลับไม่ได้
// คืน null เมื่อเสิร์ฟแล้ว = จบ ไม่มีขั้นถัดไป
function getNextStatus(status) {
  if (status === 'waiting') {
    return 'cooking';
  }
  if (status === 'cooking') {
    return 'served';
  }
  return null;
}

function getStatusColor(status) {
  if (status === 'cooking') {
    return colors.orange.textDark;
  }
  if (status === 'served') {
    return colors.core.brandGreen;
  }
  return colors.text.label;
}

function getStatusBg(status) {
  if (status === 'cooking') {
    return colors.orange.bgLight;
  }
  if (status === 'served') {
    return colors.surface.statusGreenBg;
  }
  return colors.surface.searchChip;
}

function getStatusBadgeText(item) {
  if (item.status === 'cooking') {
    if (item.status_time) {
      return `กำลังทำ · เริ่ม ${item.status_time}`;
    }
    return 'กำลังทำ';
  }
  if (item.status === 'served') {
    if (item.status_time) {
      return `เสิร์ฟแล้ว · ${item.status_time}`;
    }
    return 'เสิร์ฟแล้ว';
  }
  return 'รอทำ';
}

// ตำแหน่งของสถานะนี้ใน STATUS_STEPS (ไม่เจอคืน -1)
function getStatusIndex(status) {
  for (let index = 0; index < STATUS_STEPS.length; index += 1) {
    if (STATUS_STEPS[index].key === status) {
      return index;
    }
  }
  return -1;
}

// สรุปสถานะรวมของทั้งใบไว้แสดงในรายการด้านซ้าย
function getRoundStatusSummary(round) {
  let waitingCount = 0;
  let cookingCount = 0;
  for (const item of round.items) {
    if (item.status === 'waiting') {
      waitingCount += 1;
    }
    if (item.status === 'cooking') {
      cookingCount += 1;
    }
  }

  const statusParts = [];
  if (cookingCount > 0) {
    statusParts.push(`กำลังทำ ${cookingCount}`);
  }
  if (waitingCount > 0) {
    statusParts.push(`รอทำ ${waitingCount}`);
  }
  if (statusParts.length > 0) {
    return statusParts.join(' / ');
  }
  return 'เสิร์ฟครบแล้ว';
}

// หาใบออร์เดอร์ตาม id (ไม่เจอคืน null)
function findRoundById(roundList, roundId) {
  for (const round of roundList) {
    if (round.round_id === roundId) {
      return round;
    }
  }
  return null;
}

// เช็คว่ายังมีใบนี้อยู่ในคิวไหม
function isRoundInQueue(roundList, roundId) {
  for (const round of roundList) {
    if (round.round_id === roundId) {
      return true;
    }
  }
  return false;
}

// id ของใบแรกในคิว (ไม่มีใบเลยคืน null)
function getFirstRoundId(roundList) {
  if (roundList.length > 0) {
    return roundList[0].round_id;
  }
  return null;
}

export default function RoundStatusScreen({ route, navigation }) {
  const db = useSQLiteContext();

  // รับ roundId ที่หน้าคิวครัวส่งมา (ถ้าไม่ส่งมาจะเป็น null)
  const routeParams = route && route.params ? route.params : {};
  const roundIdFromParams = routeParams.roundId ? routeParams.roundId : null;

  // ---- state ----
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(roundIdFromParams);
  const [isLoading, setIsLoading] = useState(true);
  // order_item_id ที่กำลังเปลี่ยนสถานะอยู่ หรือ 'ROUND' ตอนกดทั้งใบ
  const [updatingKey, setUpdatingKey] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // ---- โหลดข้อมูลจาก DB ----
  // ใช้ useCallback เพราะอยู่ใน dependency ของ useFocusEffect (ถ้าเปลี่ยนทุกครั้งจะโหลดซ้ำวนไป)
  const loadRounds = useCallback(async function (options) {
    const isSilent = options ? options.silent : false;
    if (!isSilent) {
      setIsLoading(true);
    }
    try {
      const roundList = await getKitchenQueue(db);
      setRounds(roundList);

      // ถ้ายังไม่เคยเลือก หรือใบที่เลือกไว้หายไปจากคิวแล้ว ให้เลือกใบแรกอัตโนมัติ
      setSelectedRoundId(function (previousRoundId) {
        if (previousRoundId && isRoundInQueue(roundList, previousRoundId)) {
          return previousRoundId;
        }
        return getFirstRoundId(roundList);
      });
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, [db]);

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้
  useFocusEffect(
    useCallback(function () {
      loadRounds();
    }, [loadRounds])
  );

  // นาฬิกาเดินทุกวินาที เพื่อนับเวลาที่ผ่านมาของใบออร์เดอร์
  useEffect(function () {
    const timer = setInterval(function () {
      setNow(Date.now());
    }, 1000);
    return function () {
      clearInterval(timer);
    };
  }, []);

  // ใบที่กำลังดูอยู่ (คำนวณจาก state ทุกครั้งที่ render)
  const selectedRound = findRoundById(rounds, selectedRoundId);

  // ---- ฟังก์ชันกดปุ่ม ----
  // เปลี่ยนสถานะรายรายการ (เดินหน้าทางเดียว — DB จะบล็อกการย้อนเองอยู่แล้ว)
  async function handleSetItemStatus(orderItemId, nextStatus) {
    setUpdatingKey(orderItemId);
    try {
      try {
        await updateItemStatus(db, orderItemId, nextStatus);
      } catch (error) {
        // ชนกฎ "ย้อนกลับไม่ได้" หรือรายการถูกยกเลิกแล้ว — ไม่ต้องทำอะไร
        // แค่โหลดคิวกลับมาให้ตรงกับ DB ข้างล่าง
      }
      await loadRounds({ silent: true });
    } finally {
      setUpdatingKey(null);
    }
  }

  // ปุ่ม "ทั้งใบ → เสิร์ฟแล้ว"
  async function handleMarkRoundServed() {
    if (!selectedRound) {
      return;
    }
    setUpdatingKey('ROUND');
    try {
      await markRoundAsServed(db, selectedRound.round_id);
      await loadRounds({ silent: true });
    } finally {
      setUpdatingKey(null);
    }
  }

  // ---- ส่วนย่อยที่ใช้ซ้ำใน JSX ----
  function renderSidebarCard(round) {
    const isSelected = round.round_id === selectedRoundId;

    let sidebarCardStyle = styles.sidebarCard;
    if (isSelected) {
      sidebarCardStyle = [styles.sidebarCard, styles.sidebarCardActive];
    }

    return (
      <TouchableOpacity
        key={round.round_id}
        activeOpacity={0.8}
        onPress={function () { setSelectedRoundId(round.round_id); }}
        style={sidebarCardStyle}
      >
        <Text style={styles.sidebarCardTitle}>
          โต๊ะ {round.table_number} · รอบ {round.round_number}
        </Text>
        <Text style={styles.sidebarCardMeta}>
          {round.order_time_label} · {round.items.length} รายการ
        </Text>
        <Text style={styles.sidebarCardStatus}>{getRoundStatusSummary(round)}</Text>
      </TouchableOpacity>
    );
  }

  function renderStatusStepButton(step, item) {
    const currentIndex = getStatusIndex(item.status);
    const stepIndex = getStatusIndex(step.key);
    const isActive = step.key === item.status;

    // ขั้นที่ผ่านมาแล้ว → ขึ้นเครื่องหมายถูก
    let isDone = false;
    if (currentIndex > -1 && stepIndex < currentIndex) {
      isDone = true;
    }

    // กดได้เฉพาะขั้นถัดไปเท่านั้น — ขั้นที่ผ่านแล้ว/ขั้นปัจจุบัน/เสิร์ฟครบแล้ว กดไม่ได้
    const isNext = step.key === getNextStatus(item.status);
    const isUpdatingThis = updatingKey === item.order_item_id;

    // กรอบสีตามสถานะเฉพาะตอนที่เป็นสถานะปัจจุบัน
    let stepButtonStyles = [styles.statusStepButton];
    if (isActive) {
      stepButtonStyles.push({
        borderColor: getStatusColor(step.key),
        backgroundColor: getStatusBg(step.key),
      });
    } else if (!isNext) {
      stepButtonStyles.push(styles.statusStepButtonDisabled);
    }

    // ระหว่างอัปเดตสถานะ ให้โชว์ loading แทนข้อความ
    let stepButtonContent = null;
    if (isUpdatingThis && isActive) {
      stepButtonContent = (
        <ActivityIndicator size="small" color={getStatusColor(step.key)} />
      );
    } else {
      let stepTextStyle = styles.statusStepButtonText;
      if (isActive) {
        stepTextStyle = [styles.statusStepButtonText, { color: getStatusColor(step.key), fontWeight: 'bold' }];
      } else if (!isNext) {
        stepTextStyle = [styles.statusStepButtonText, styles.statusStepButtonTextDisabled];
      }

      // ขั้นที่ผ่านแล้วมีเครื่องหมายถูกนำหน้าชื่อ
      let stepLabel = step.label;
      if (isDone) {
        stepLabel = '✓ ' + step.label;
      }

      stepButtonContent = (
        <Text style={stepTextStyle}>{stepLabel}</Text>
      );
    }

    function handleStepPress() {
      if (isNext) {
        handleSetItemStatus(item.order_item_id, step.key);
      }
    }

    return (
      <Pressable
        key={step.key}
        disabled={isUpdatingThis || !isNext}
        onPress={handleStepPress}
        style={function (pressState) {
          const pressedStyles = stepButtonStyles.slice();
          if (pressState.pressed && isNext) {
            pressedStyles.push(styles.statusStepButtonPressed);
          }
          return pressedStyles;
        }}
      >
        {stepButtonContent}
      </Pressable>
    );
  }

  function renderItemCard(item) {
    // ตัวเลือก/หมายเหตุของเมนู
    let modifierText = 'ธรรมดา';
    if (item.modifiers && item.modifiers.length > 0) {
      modifierText = item.modifiers.join(' · ');
    }

    let noteText = null;
    if (item.note) {
      noteText = <Text style={styles.itemNote}>หมายเหตุ: {item.note}</Text>;
    }

    return (
      <View key={item.order_item_id} style={styles.itemCard}>
        <View style={styles.itemCardTopRow}>
          <Text style={styles.itemName}>
            <Text style={styles.itemQty}>{item.quantity}× </Text>
            {item.name}
          </Text>
          <View style={[styles.itemStatusBadge, { backgroundColor: getStatusBg(item.status) }]}>
            <Text style={[styles.itemStatusBadgeText, { color: getStatusColor(item.status) }]}>
              {getStatusBadgeText(item)}
            </Text>
          </View>
        </View>

        <Text style={styles.itemModifier}>{modifierText}</Text>
        {noteText}

        <View style={styles.statusStepRow}>
          {STATUS_STEPS.map(function (step) {
            return renderStatusStepButton(step, item);
          })}
        </View>
      </View>
    );
  }

  function renderPrintItemRow(item) {
    let printNote = null;
    if (item.note) {
      printNote = <Text style={styles.printItemSub}>หมายเหตุ: {item.note}</Text>;
    }

    let printModifier = null;
    if (item.modifiers && item.modifiers.length > 0) {
      printModifier = (
        <Text style={styles.printItemSub}>{item.modifiers.join(' · ')}</Text>
      );
    }

    return (
      <View key={item.order_item_id} style={styles.printItemRow}>
        <Text style={styles.printItemLine}>
          {item.quantity}× {item.name}
        </Text>
        {printModifier}
        {printNote}
      </View>
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

  // ปุ่ม "ทั้งใบ → เสิร์ฟแล้ว": ตอนกำลังบันทึกให้โชว์ loading
  let markServedButtonContent = <Text style={styles.markServedButtonText}>เปลี่ยนทั้งใบเป็นเสิร์ฟแล้ว</Text>;
  if (updatingKey === 'ROUND') {
    markServedButtonContent = (
      <ActivityIndicator size="small" color={colors.core.screenBg} />
    );
  }

  // เนื้อหาในหน้าต่างพิมพ์ใบครัว (ถ้าไม่มีใบที่เลือกก็ไม่ต้องพิมพ์)
  let printPreviewContent = null;
  if (selectedRound) {
    printPreviewContent = (
      <>
        <Text style={styles.printMeta}>
          โต๊ะ {selectedRound.table_number} · รอบที่ {selectedRound.round_number} · บิล #
          {selectedRound.bill_code}
        </Text>
        <Text style={styles.printMeta}>สั่งเข้าครัว {selectedRound.order_time_label}</Text>

        <View style={styles.printDivider} />

        <ScrollView style={styles.printItemList}>
          {selectedRound.items.map(renderPrintItemRow)}
        </ScrollView>

        <Pressable
          style={styles.printConfirmButton}
          onPress={function () { setShowPrintPreview(false); }}
        >
          <Text style={styles.printConfirmButtonText}>ปิดหน้าต่าง</Text>
        </Pressable>
      </>
    );
  }

  // ส่วนขวา: ถ้ายังไม่มีใบที่เลือกให้บอกก่อน
  let mainPanelContent = null;
  if (!selectedRound) {
    mainPanelContent = (
      <View style={styles.centerScreen}>
        <Text style={styles.centerScreenText}>ยังไม่มีใบออร์เดอร์ในคิว</Text>
      </View>
    );
  } else {
    mainPanelContent = (
      <View style={styles.mainPanel}>
        <View style={styles.mainHeader}>
          <View>
            <Text style={styles.mainTitle}>
              โต๊ะ {selectedRound.table_number} · รอบที่ {selectedRound.round_number}
            </Text>
            <Text style={styles.mainSubtitle}>
              บิล #{selectedRound.bill_code} · สั่งเข้าครัว {selectedRound.order_time_label} · ผ่านมา{' '}
              {getWaitMinutes(selectedRound.order_time, now)} นาที
            </Text>
          </View>

          <View style={styles.mainHeaderButtons}>
            <TouchableOpacity
              style={styles.printButton}
              activeOpacity={0.75}
              onPress={function () { setShowPrintPreview(true); }}
            >
              <Text style={styles.printButtonText}>พิมพ์ใบครัว</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelNavButton}
              activeOpacity={0.75}
              onPress={function () {
                navigation.navigate('CancelItemScreen', { roundId: selectedRound.round_id });
              }}
            >
              <Text style={styles.cancelNavButtonText}>ยกเลิกรายการ</Text>
            </TouchableOpacity>

            <Pressable
              disabled={updatingKey === 'ROUND'}
              onPress={handleMarkRoundServed}
              style={function (pressState) {
                if (pressState.pressed) {
                  return [styles.markServedButton, styles.markServedButtonPressed];
                }
                return styles.markServedButton;
              }}
            >
              {markServedButtonContent}
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.itemScroll} contentContainerStyle={styles.itemScrollContent}>
          {selectedRound.items.map(renderItemCard)}
        </ScrollView>

        <Text style={styles.footerNote}>
          สถานะเดินหน้าทางเดียว: รอทำ → กำลังทำ → เสิร์ฟแล้ว (ย้อนกลับไม่ได้) เวลาถูกบันทึกอัตโนมัติในบิล
          ลูกค้าไม่สามารถแก้ไขรายการเองได้หลังจากนี้
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ซ้าย — รายการใบออร์เดอร์ที่กำลังทำงานอยู่ */}
      <View style={styles.sidebar}>
        <TouchableOpacity style={styles.backButton} onPress={function () { navigation.goBack(); }}>
          <Text style={styles.backButtonText}> กลับคิวครัว</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.sidebarList}>
          {rounds.map(renderSidebarCard)}
        </ScrollView>
      </View>

      {/* ขวา — รายละเอียดใบที่เลือก */}
      {mainPanelContent}

      {/* Modal: ตัวอย่างใบครัวที่จะพิมพ์ */}
      <Modal
        visible={showPrintPreview}
        transparent
        animationType="fade"
        onRequestClose={function () { setShowPrintPreview(false); }}
      >
        <View style={styles.printOverlay}>
          <View style={styles.printCard}>
            <View style={styles.printHeaderRow}>
              <Text style={styles.printTitle}>ใบครัว</Text>
              <Pressable onPress={function () { setShowPrintPreview(false); }} style={styles.printCloseButton}>
                <Text style={styles.printCloseButtonText}>×</Text>
              </Pressable>
            </View>

            {printPreviewContent}
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
    flexDirection: 'row',
    backgroundColor: colors.core.canvasBg,
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
  },

  // ---- คอลัมน์ซ้าย (รายการใบออร์เดอร์) ----
  sidebar: {
    width: 240,
    padding: 16,
    // เส้นคั่นระหว่างคอลัมน์ซ้าย (รายการใบ) กับคอลัมน์ขวา (รายละเอียด)
    borderRightWidth: 2,
    borderRightColor: alpha.borderMid,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.searchChip,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.core.brandGreen,
  },
  sidebarList: {
    gap: 12,
  },
  sidebarCard: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 12,
  },
  sidebarCardActive: {
    borderColor: colors.orange.brand,
    backgroundColor: colors.orange.bgLight,
  },
  sidebarCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  sidebarCardMeta: {
    fontSize: 13,
    color: colors.text.placeholder,
    marginTop: 5,
  },
  sidebarCardStatus: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.orange.textDark,
    marginTop: 7,
  },

  // ---- ส่วนขวา (รายละเอียดใบที่เลือก) ----
  mainPanel: {
    flex: 1,
    padding: 24,
  },
  mainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  // ชื่อโต๊ะ — หัวเรื่องของหน้า ต้องเด่น
  mainTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  mainSubtitle: {
    fontSize: 14,
    color: colors.text.placeholder,
    marginTop: 6,
  },
  mainHeaderButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  printButton: {
    borderWidth: 1.5,
    borderColor: colors.core.darkGreen,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  printButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  cancelNavButton: {
    borderWidth: 1.5,
    borderColor: colors.red.action,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  cancelNavButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.red.action,
  },
  // ปุ่มหลักของหน้า — ขยายให้เด่นและกดง่าย
  markServedButton: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 200,
    minHeight: 54,
  },
  markServedButtonPressed: {
    opacity: 0.85,
  },
  markServedButtonDisabled: {
    backgroundColor: colors.surface.switchOff,
  },
  markServedButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },

  // ---- รายการเมนูในใบ ----
  itemScroll: {
    flex: 1,
  },
  itemScrollContent: {
    gap: 18,
    paddingBottom: 10,
  },
  // การ์ดเมนูสีขาว — ขอบ + เงาชัดเจน ให้แยกเป็นใบ ๆ ไม่กลืนกับพื้นหลัง
  itemCard: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: alpha.borderMid,
    shadowColor: colors.core.darkGreen,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },
  itemCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    flex: 1,
    paddingRight: 12,
    lineHeight: 28,
  },
  itemQty: {
    color: colors.core.brandGreen,
  },
  itemStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  itemStatusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemModifier: {
    fontSize: 14,
    color: colors.text.label,
    marginTop: 8,
  },
  itemNote: {
    fontSize: 14,
    color: colors.orange.textDark,
    marginTop: 4,
  },

  // ---- ปุ่มสถานะ 3 ขั้น ----
  statusStepRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  // ขยายสูงขึ้นให้กดง่ายจากระยะไกล
  statusStepButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: alpha.borderMid,
    backgroundColor: colors.core.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  statusStepButtonPressed: {
    opacity: 0.8,
  },
  // ขั้นที่ผ่านแล้ว / ขั้นที่ยังไม่ถึง / สถานะปัจจุบัน — กดไม่ได้
  statusStepButtonDisabled: {
    opacity: 0.5,
    backgroundColor: colors.surface.searchChip,
  },
  statusStepButtonText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  statusStepButtonTextDisabled: {
    color: colors.text.placeholder,
  },

  footerNote: {
    fontSize: 12,
    color: colors.text.placeholder,
    textAlign: 'center',
    marginTop: 10,
  },

  // ---- หน้าต่างพิมพ์ใบครัว ----
  printOverlay: {
    flex: 1,
    backgroundColor: alpha.borderMax,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printCard: {
    width: 360,
    maxHeight: '75%',
    backgroundColor: colors.core.screenBg,
    borderRadius: 20,
    padding: 20,
  },
  printHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  printTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  printCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.searchChip,
  },
  printCloseButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  printMeta: {
    fontSize: 14,
    color: colors.text.description,
    marginTop: 8,
  },
  // เส้นคั่นในใบพิมพ์
  printDivider: {
    height: 2,
    backgroundColor: alpha.borderMid,
    marginVertical: 16,
  },
  printItemList: {
    maxHeight: 260,
  },
  printItemRow: {
    marginBottom: 14,
  },
  printItemLine: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  printItemSub: {
    fontSize: 13,
    color: colors.text.label,
    marginTop: 2,
  },
  printConfirmButton: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  printConfirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
});
