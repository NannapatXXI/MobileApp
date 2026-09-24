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
import colors,{alpha} from '../customer/style/colors';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

// TODO: แก้ path/ชื่อฟังก์ชันให้ตรงกับ query module จริงของฝั่งครัว ถ้าต่างจากที่สมมติไว้
import {
  getKitchenQueue,
  getNextQueueRounds,
  markRoundAsServed,
  startRoundCooking,
  getServedHistory,
  getCancelledItems,
} from '../../db/queries_kitchen/queue';

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'waiting', label: 'รอทำ' },
  { key: 'cooking', label: 'กำลังทำ' },
  { key: 'served', label: 'เสิร์ฟแล้ว' },
];

const OVERDUE_MINUTES = 15;
const REFRESH_INTERVAL_MS = 20000; // ดึงข้อมูลคิวครัวใหม่ทุก 20 วิ (จอครัวเปิดค้างตลอด ไม่ได้พึ่ง focus event อย่างเดียว)

// สถานะ item หนึ่งชิ้น: 'waiting' | 'cooking' | 'served'
function getStatusColor(status) {
  if (status === 'cooking') return colors.orange.textDark;
  if (status === 'served') return colors.core.brandGreen;
  return colors.text.label; // waiting
}

function getStatusLabel(status, statusTime) {
  if (status === 'cooking') return `กำลังทำ${statusTime ? ` · ${statusTime}` : ''}`;
  if (status === 'served') return `เสิร์ฟแล้ว${statusTime ? ` · ${statusTime}` : ''}`;
  return 'รอทำ';
}

// สรุปสถานะรวมของทั้งใบ เพื่อตัดสินว่าปุ่ม action ล่างการ์ดควรเป็นแบบไหน
// TODO: ปรับ logic ตรงนี้ถ้าเงื่อนไขจริงต่างจากที่อนุมานไว้จากดีไซน์
function getRoundAction(round) {
  const waitingCount = round.items.filter((i) => i.status === 'waiting').length;
  const servedCount = round.items.filter((i) => i.status === 'served').length;
  const unservedCount = round.items.length - servedCount;
  const isFullyServed = servedCount === round.items.length;

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

  if (waitingCount > 0) {
    return {
      type: 'startCooking',
      buttonLabel: 'เริ่มทำทั้งใบ',
      buttonColor: colors.mustard.bg,
      textColor: colors.mustard.text,
      helperText:
        waitingCount === round.items.length
          ? 'ทั้งใบยังรอทำ'
          : `ยกเลิกได้ ${waitingCount} รายการ`,
      disabled: false,
    };
  }

  return {
    type: 'markServed',
    buttonLabel: 'เสิร์ฟแล้วทั้งใบ',
    buttonColor: colors.core.brandGreen,
    textColor: colors.core.screenBg,
    helperText: `เหลือ ${unservedCount} รายการที่ยังไม่เสิร์ฟ`,
    disabled: false,
  };
}

function getWaitMinutes(orderTime) {
  // orderTime คาดว่าเป็น timestamp (ms) หรือ ISO string — ปรับตาม schema จริง
  const orderedAt = new Date(orderTime).getTime();
  return Math.max(0, Math.round((Date.now() - orderedAt) / 60000));
}

export default function OrderKitScreen({ navigation }) {
  const db = useSQLiteContext();
  const [rounds, setRounds] = useState([]);
  const [nextQueue, setNextQueue] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [updatingRoundId, setUpdatingRoundId] = useState(null);

  const [modal, setModal] = useState(null); // null | 'history' | 'cancelled'
  const [historyData, setHistoryData] = useState([]);
  const [cancelledData, setCancelledData] = useState([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const loadQueue = useCallback(
    (opts = {}) => {
      if (!opts.silent) setIsLoading(true);
      return Promise.all([getKitchenQueue(db), getNextQueueRounds(db)])
        .then(([r, q]) => {
          setRounds(r);
          setNextQueue(q);
        })
        .finally(() => {
          if (!opts.silent) setIsLoading(false);
        });
    },
    [db]
  );

  // รีเฟรชทุกครั้งที่กลับมาหน้านี้
  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [loadQueue])
  );

  // จอครัวเปิดค้างอยู่ตลอด ต้องดึงข้อมูลใหม่เป็นระยะแม้ไม่ได้สลับหน้าจอ (silent = ไม่โชว์ full-screen loading ซ้ำ)
  useEffect(() => {
    const poller = setInterval(() => loadQueue({ silent: true }), REFRESH_INTERVAL_MS);
    return () => clearInterval(poller);
  }, [loadQueue]);

  // นาฬิกา + นับเวลารอ — อัปเดตทุกวินาทีเพื่อให้เป็น real-time จริง
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const c = { all: rounds.length, waiting: 0, cooking: 0, served: 0 };
    rounds.forEach((r) => {
      const hasWaiting = r.items.some((i) => i.status === 'waiting');
      const hasCooking = r.items.some((i) => i.status === 'cooking');
      const allServed = r.items.every((i) => i.status === 'served');
      if (hasWaiting) c.waiting += 1;
      if (hasCooking) c.cooking += 1;
      if (allServed) c.served += 1;
    });
    return c;
  }, [rounds]);

  const filteredRounds = useMemo(() => {
    if (activeFilter === 'waiting') return rounds.filter((r) => r.items.some((i) => i.status === 'waiting'));
    if (activeFilter === 'cooking') return rounds.filter((r) => r.items.some((i) => i.status === 'cooking'));
    if (activeFilter === 'served') return rounds.filter((r) => r.items.every((i) => i.status === 'served'));
    return rounds;
  }, [rounds, activeFilter]);

  const handleRoundAction = (round) => {
    const action = getRoundAction(round);
    if (action.disabled) return;

    setUpdatingRoundId(round.round_id);
    const task =
      action.type === 'markServed'
        ? markRoundAsServed(db, round.round_id)
        : startRoundCooking(db, round.round_id);

    task
      .then(() => loadQueue({ silent: true }))
      .finally(() => setUpdatingRoundId(null));
  };

  const openHistoryModal = () => {
    setModal('history');
    setIsModalLoading(true);
    getServedHistory(db)
      .then(setHistoryData)
      .finally(() => setIsModalLoading(false));
  };

  const openCancelledModal = () => {
    setModal('cancelled');
    setIsModalLoading(true);
    getCancelledItems(db)
      .then(setCancelledData)
      .finally(() => setIsModalLoading(false));
  };

  const closeModal = () => setModal(null);

  const clockText = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>คิวครัว</Text>
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const isActive = f.key === activeFilter;
              return (
                <TouchableOpacity
                  key={f.key}
                  activeOpacity={0.75}
                  onPress={() => setActiveFilter(f.key)}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {f.label} {counts[f.key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.sortLabel}>เรียง: เวลาที่สั่ง เก่า → ใหม่</Text>
          <Text style={styles.clockText}>{clockText}</Text>
        </View>
      </View>

      {/* เนื้อหาหลัก: การ์ดออร์เดอร์ + แผงคิวถัดไป */}
      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.core.brandGreen} />
            <Text style={styles.centerStateText}>กำลังโหลดคิวครัว...</Text>
          </View>
        ) : filteredRounds.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.centerStateEmoji}>🍽️</Text>
            <Text style={styles.centerStateText}>ไม่มีออร์เดอร์ในหมวดนี้</Text>
          </View>
        ) : (
          <ScrollView horizontal style={styles.roundsScroll} contentContainerStyle={styles.roundsRow}>
            {filteredRounds.map((round) => {
              const waitMinutes = getWaitMinutes(round.order_time);
              const isOverdue = waitMinutes > OVERDUE_MINUTES;
              const action = getRoundAction(round);
              const isUpdating = updatingRoundId === round.round_id;

              return (
                <View
                  key={round.round_id}
                  style={[styles.roundCard, isOverdue && styles.roundCardOverdue]}
                >
                  <Pressable
                    onPress={() =>
                      navigation.navigate('RoundStatusScreen', { roundId: round.round_id })
                    }
                    style={({ pressed }) => [styles.roundCardHeader, pressed && { opacity: 0.7 }]}
                  >
                    <View>
                      <Text style={styles.tableName}>โต๊ะ {round.table_number}</Text>
                      <Text style={styles.roundMeta}>
                        รอบที่ {round.round_number} · {round.items.length} รายการ
                      </Text>
                    </View>
                    <View style={styles.roundTimeCol}>
                      {isOverdue && (
                        <View style={styles.overdueBadge}>
                          <Text style={styles.overdueBadgeText}>เกินเวลา</Text>
                        </View>
                      )}
                      <Text style={styles.orderTime}>{round.order_time_label}</Text>
                      <Text style={[styles.waitMinutes, isOverdue && styles.waitMinutesOverdue]}>
                        {waitMinutes} นาที
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.itemList}>
                    {round.items.map((item) => (
                      <View key={item.item_id} style={styles.itemRow}>
                        <Text style={styles.itemNameLine}>
                          <Text style={styles.itemQty}>{item.quantity}× </Text>
                          {item.name}
                        </Text>
                        {item.modifiers?.length ? (
                          <Text style={styles.itemModifier}>{item.modifiers.join(' · ')}</Text>
                        ) : null}
                        {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
                        <Text style={[styles.itemStatus, { color: getStatusColor(item.status) }]}>
                          {getStatusLabel(item.status, item.status_time)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    disabled={action.disabled || isUpdating}
                    onPress={() => handleRoundAction(round)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      { backgroundColor: action.buttonColor },
                      pressed && !action.disabled && styles.actionButtonPressed,
                      action.disabled && styles.actionButtonDisabled,
                    ]}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color={action.textColor} />
                    ) : (
                      <Text style={[styles.actionButtonText, { color: action.textColor }]}>
                        {action.buttonLabel}
                      </Text>
                    )}
                  </Pressable>
                  <Text style={styles.actionHelperText}>{action.helperText}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* แผงคิวถัดไป */}
        <View style={styles.nextQueuePanel}>
          <Text style={styles.nextQueueTitle}>คิวถัดไป · {nextQueue.length} ใบ</Text>
          {nextQueue.length === 0 ? (
            <Text style={styles.nextQueueEmpty}>ยังไม่มีใบรอคิว</Text>
          ) : (
            <ScrollView style={styles.nextQueueList}>
              {nextQueue.map((q) => (
                <View key={q.round_id} style={styles.nextQueueItem}>
                  <Text style={styles.nextQueueTable}>
                    โต๊ะ {q.table_number} · รอบ {q.round_number}
                  </Text>
                  <Text style={styles.nextQueueMeta}>
                    {q.order_time_label} · {q.item_count} รายการ
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
          <Text style={styles.nextQueueHint}>
            เลื่อนขวาเพื่อดูใบถัดไป ออร์เดอร์ใหม่จะมาทางขวาเสมอ
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.text.label }]} />
            <Text style={styles.legendText}>รอทำ</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.orange.textDark }]} />
            <Text style={styles.legendText}>กำลังทำ</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.core.brandGreen }]} />
            <Text style={styles.legendText}>เสิร์ฟแล้ว</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.red.action }]} />
            <Text style={styles.legendText}>เกิน 15 นาที</Text>
          </View>
        </View>

        <View style={styles.footerButtonsRow}>
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
              <Text style={styles.modalTitle}>
                {modal === 'history' ? 'ประวัติที่เสิร์ฟแล้ว' : 'รายการที่ถูกยกเลิก'}
              </Text>
              <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseButtonText}>×</Text>
              </Pressable>
            </View>

            {isModalLoading ? (
              <ActivityIndicator size="small" color={colors.core.brandGreen} style={styles.modalLoading} />
            ) : (
              <ScrollView style={styles.modalList}>
                {modal === 'history' &&
                  (historyData.length === 0 ? (
                    <Text style={styles.modalEmptyText}>ยังไม่มีรายการ</Text>
                  ) : (
                    historyData.map((h) => (
                      <View key={h.round_id} style={styles.modalListItem}>
                        <Text style={styles.modalListItemTitle}>
                          โต๊ะ {h.table_number} · รอบ {h.round_number}
                        </Text>
                        <Text style={styles.modalListItemMeta}>
                          {h.item_count} รายการ · เสิร์ฟเสร็จ {h.served_time_label}
                        </Text>
                      </View>
                    ))
                  ))}

                {modal === 'cancelled' &&
                  (cancelledData.length === 0 ? (
                    <Text style={styles.modalEmptyText}>ยังไม่มีรายการที่ถูกยกเลิก</Text>
                  ) : (
                    cancelledData.map((c) => (
                      <View key={c.id} style={styles.modalListItem}>
                        <Text style={styles.modalListItemTitle}>
                          โต๊ะ {c.table_number} · {c.quantity}× {c.name}
                        </Text>
                        <Text style={styles.modalListItemMeta}>
                          ยกเลิกเมื่อ {c.cancelled_time_label} · {c.reason}
                        </Text>
                      </View>
                    ))
                  ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.core.canvasBg,
    padding: 20,
  },

  // Header
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
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface.searchChip,
  },
  filterChipActive: {
    backgroundColor: colors.core.darkGreen,
  },
  filterChipText: {
    fontSize: 13,
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
    fontSize: 12,
    color: colors.text.placeholder,
  },
  clockText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginTop: 4,
  },

  // Body
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
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
  roundsScroll: {
    flex: 1,
  },
  roundsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 4,
  },

  // Round card
  roundCard: {
    width: 280,
    backgroundColor: colors.core.screenBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: alpha.borderMin,
    shadowColor: colors.core.darkGreen,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  roundCardOverdue: {
    borderColor: colors.red.action,
    borderWidth: 1.5,
  },
  overdueBadge: {
    backgroundColor: colors.red.action,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
    alignSelf: 'flex-end',
  },
  overdueBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  roundCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tableName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  roundMeta: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 2,
  },
  roundTimeCol: {
    alignItems: 'flex-end',
  },
  orderTime: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  waitMinutes: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 2,
  },
  waitMinutesOverdue: {
    color: colors.red.action,
    fontWeight: 'bold',
  },

  // Items
  itemList: {
    marginTop: 16,
    gap: 14,
  },
  itemRow: {
    gap: 2,
  },
  itemNameLine: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  itemQty: {
    color: colors.core.brandGreen,
  },
  itemModifier: {
    fontSize: 12,
    color: colors.text.label,
  },
  itemNote: {
    fontSize: 12,
    color: colors.orange.textDark,
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Action button
  actionButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 46,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionHelperText: {
    fontSize: 11,
    color: colors.text.placeholder,
    textAlign: 'center',
    marginTop: 6,
  },

  // Next queue panel
  nextQueuePanel: {
    width: 220,
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 18,
    padding: 16,
  },
  nextQueueTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  nextQueueEmpty: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 12,
  },
  nextQueueList: {
    marginTop: 12,
  },
  nextQueueItem: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  nextQueueTable: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  nextQueueMeta: {
    fontSize: 11,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  nextQueueHint: {
    fontSize: 10,
    color: colors.text.placeholder,
    marginTop: 8,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 18,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: colors.text.description,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    backgroundColor: colors.surface.sidebarCard,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  footerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },

  // Modal
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
    fontSize: 16,
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
    fontSize: 13,
    color: colors.text.placeholder,
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalListItem: {
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  modalListItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  modalListItemMeta: {
    fontSize: 11,
    color: colors.text.placeholder,
    marginTop: 4,
  },
});