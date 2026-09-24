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
import colors, {alpha} from '../customer/style/colors';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

// สมมติชื่อไฟล์นี้ว่า RoundStatusScreen.js — ถ้าจริงๆ อยากใช้ชื่ออื่น เปลี่ยนได้เลย ไม่กระทบ logic ข้างใน
// TODO: แก้ path ให้ตรงกับ query module จริงถ้าต่างจากที่สมมติไว้
import {
  getKitchenQueue,
  markRoundAsServed,
  updateItemStatus,
} from '../../db/queries_kitchen/queue';

const STATUS_STEPS = [
  { key: 'waiting', label: 'รอทำ' },
  { key: 'cooking', label: 'กำลังทำ' },
  { key: 'served', label: 'เสิร์ฟแล้ว' },
];

function getStatusColor(status) {
  if (status === 'cooking') return colors.orange.textDark;
  if (status === 'served') return colors.core.brandGreen;
  return colors.text.label;
}

function getStatusBg(status) {
  if (status === 'cooking') return colors.orange.bgLight;
  if (status === 'served') return colors.surface.statusGreenBg;
  return colors.surface.searchChip;
}

function getStatusBadgeText(item) {
  if (item.status === 'cooking') return `กำลังทำ${item.status_time ? ` · เริ่ม ${item.status_time}` : ''}`;
  if (item.status === 'served') return `เสิร์ฟแล้ว${item.status_time ? ` · ${item.status_time}` : ''}`;
  return 'รอทำ';
}

function getWaitMinutes(orderTime) {
  const orderedAt = new Date(orderTime).getTime();
  return Math.max(0, Math.round((Date.now() - orderedAt) / 60000));
}

function getRoundStatusSummary(round) {
  const waiting = round.items.filter((i) => i.status === 'waiting').length;
  const cooking = round.items.filter((i) => i.status === 'cooking').length;
  const parts = [];
  if (cooking > 0) parts.push(`กำลังทำ ${cooking}`);
  if (waiting > 0) parts.push(`รอทำ ${waiting}`);
  return parts.length > 0 ? parts.join(' / ') : 'เสิร์ฟครบแล้ว';
}

export default function RoundStatusScreen({ route, navigation }) {
  const db = useSQLiteContext();
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(route?.params?.roundId ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState(null); // itemId ที่กำลังเปลี่ยนสถานะอยู่, หรือ 'ROUND' ตอนกดทั้งใบ
  const [now, setNow] = useState(Date.now());
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const loadRounds = useCallback(
    (opts = {}) => {
      if (!opts.silent) setIsLoading(true);
      return getKitchenQueue(db)
        .then((data) => {
          setRounds(data);
          // ถ้ายังไม่เคยเลือก หรือใบที่เลือกไว้หายไปจากคิวแล้ว ให้เลือกใบแรกอัตโนมัติ
          setSelectedRoundId((prev) => {
            if (prev && data.some((r) => r.round_id === prev)) return prev;
            return data[0]?.round_id ?? null;
          });
        })
        .finally(() => {
          if (!opts.silent) setIsLoading(false);
        });
    },
    [db]
  );

  useFocusEffect(
    useCallback(() => {
      loadRounds();
    }, [loadRounds])
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedRound = useMemo(
    () => rounds.find((r) => r.round_id === selectedRoundId) ?? null,
    [rounds, selectedRoundId]
  );

  const handleSetItemStatus = (itemId, status) => {
    setUpdatingKey(itemId);
    updateItemStatus(db, itemId, status)
      .then(() => loadRounds({ silent: true }))
      .finally(() => setUpdatingKey(null));
  };

  const handleMarkRoundServed = () => {
    if (!selectedRound) return;
    setUpdatingKey('ROUND');
    markRoundAsServed(db, selectedRound.round_id)
      .then(() => loadRounds({ silent: true }))
      .finally(() => setUpdatingKey(null));
  };

  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.core.brandGreen} />
        <Text style={styles.centerScreenText}>กำลังโหลดออร์เดอร์...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ซ้าย — รายการใบออร์เดอร์ที่กำลังทำงานอยู่ */}
      <View style={styles.sidebar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← กลับคิวครัว</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.sidebarList}>
          {rounds.map((round) => {
            const isSelected = round.round_id === selectedRoundId;
            return (
              <TouchableOpacity
                key={round.round_id}
                activeOpacity={0.8}
                onPress={() => setSelectedRoundId(round.round_id)}
                style={[styles.sidebarCard, isSelected && styles.sidebarCardActive]}
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
          })}
        </ScrollView>
      </View>

      {/* ขวา — รายละเอียดใบที่เลือก */}
      {!selectedRound ? (
        <View style={styles.centerScreen}>
          <Text style={styles.centerScreenText}>ยังไม่มีใบออร์เดอร์ในคิว</Text>
        </View>
      ) : (
        <View style={styles.mainPanel}>
          <View style={styles.mainHeader}>
            <View>
              <Text style={styles.mainTitle}>
                โต๊ะ {selectedRound.table_number} · รอบที่ {selectedRound.round_number}
              </Text>
              <Text style={styles.mainSubtitle}>
                บิล #{selectedRound.bill_code} · สั่งเข้าครัว {selectedRound.order_time_label} · ผ่านมา{' '}
                {getWaitMinutes(selectedRound.order_time)} นาที
              </Text>
            </View>

            <View style={styles.mainHeaderButtons}>
              <TouchableOpacity
                style={styles.printButton}
                activeOpacity={0.75}
                onPress={() => setShowPrintPreview(true)}
              >
                <Text style={styles.printButtonText}>พิมพ์ใบครัว</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelNavButton}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('CancelItemScreen', { roundId: selectedRound.round_id })}
              >
                <Text style={styles.cancelNavButtonText}>ยกเลิกรายการ</Text>
              </TouchableOpacity>

              <Pressable
                disabled={updatingKey === 'ROUND'}
                onPress={handleMarkRoundServed}
                style={({ pressed }) => [
                  styles.markServedButton,
                  pressed && styles.markServedButtonPressed,
                ]}
              >
                {updatingKey === 'ROUND' ? (
                  <ActivityIndicator size="small" color={colors.core.screenBg} />
                ) : (
                  <Text style={styles.markServedButtonText}>ทั้งใบ → เสิร์ฟแล้ว</Text>
                )}
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.itemScroll} contentContainerStyle={styles.itemScrollContent}>
            {selectedRound.items.map((item) => (
              <View key={item.item_id} style={styles.itemCard}>
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

                {item.modifiers?.length ? (
                  <Text style={styles.itemModifier}>{item.modifiers.join(' · ')}</Text>
                ) : (
                  <Text style={styles.itemModifier}>ธรรมดา</Text>
                )}
                {item.note ? <Text style={styles.itemNote}>หมายเหตุ: {item.note}</Text> : null}

                <View style={styles.statusStepRow}>
                  {STATUS_STEPS.map((step) => {
                    const isActive = step.key === item.status;
                    const isUpdatingThis = updatingKey === item.item_id;
                    return (
                      <Pressable
                        key={step.key}
                        disabled={isUpdatingThis}
                        onPress={() => handleSetItemStatus(item.item_id, step.key)}
                        style={({ pressed }) => [
                          styles.statusStepButton,
                          isActive && {
                            borderColor: getStatusColor(step.key),
                            backgroundColor: getStatusBg(step.key),
                          },
                          pressed && styles.statusStepButtonPressed,
                        ]}
                      >
                        {isUpdatingThis && isActive ? (
                          <ActivityIndicator size="small" color={getStatusColor(step.key)} />
                        ) : (
                          <Text
                            style={[
                              styles.statusStepButtonText,
                              isActive && { color: getStatusColor(step.key), fontWeight: 'bold' },
                            ]}
                          >
                            {step.label}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.footerNote}>
            การเปลี่ยนสถานะจะถูกบันทึกเวลาไว้ในบิลอัตโนมัติ ลูกค้าไม่สามารถแก้ไขรายการเองได้หลังจากนี้
          </Text>
        </View>
      )}

      {/* Modal: ตัวอย่างใบครัวที่จะพิมพ์ */}
      <Modal
        visible={showPrintPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrintPreview(false)}
      >
        <View style={styles.printOverlay}>
          <View style={styles.printCard}>
            <View style={styles.printHeaderRow}>
              <Text style={styles.printTitle}>ใบครัว</Text>
              <Pressable onPress={() => setShowPrintPreview(false)} style={styles.printCloseButton}>
                <Text style={styles.printCloseButtonText}>×</Text>
              </Pressable>
            </View>

            {selectedRound && (
              <>
                <Text style={styles.printMeta}>
                  โต๊ะ {selectedRound.table_number} · รอบที่ {selectedRound.round_number} · บิล #
                  {selectedRound.bill_code}
                </Text>
                <Text style={styles.printMeta}>สั่งเข้าครัว {selectedRound.order_time_label}</Text>

                <View style={styles.printDivider} />

                <ScrollView style={styles.printItemList}>
                  {selectedRound.items.map((item) => (
                    <View key={item.item_id} style={styles.printItemRow}>
                      <Text style={styles.printItemLine}>
                        {item.quantity}× {item.name}
                      </Text>
                      {item.modifiers?.length ? (
                        <Text style={styles.printItemSub}>{item.modifiers.join(' · ')}</Text>
                      ) : null}
                      {item.note ? <Text style={styles.printItemSub}>หมายเหตุ: {item.note}</Text> : null}
                    </View>
                  ))}
                </ScrollView>

                <Pressable
                  style={styles.printConfirmButton}
                  onPress={() => setShowPrintPreview(false)}
                >
                  <Text style={styles.printConfirmButtonText}>ปิดหน้าต่าง</Text>
                </Pressable>
              </>
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

  // Sidebar
  sidebar: {
    width: 220,
    padding: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.searchChip,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.core.brandGreen,
  },
  sidebarList: {
    gap: 12,
  },
  sidebarCard: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 12,
  },
  sidebarCardActive: {
    borderColor: colors.orange.brand,
    backgroundColor: colors.orange.bgLight,
  },
  sidebarCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  sidebarCardMeta: {
    fontSize: 11,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  sidebarCardStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.orange.textDark,
    marginTop: 6,
  },

  // Main panel
  mainPanel: {
    flex: 1,
    padding: 20,
  },
  mainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  mainSubtitle: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  mainHeaderButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  printButton: {
    borderWidth: 1,
    borderColor: alpha.borderMax,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  printButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  cancelNavButton: {
    borderWidth: 1,
    borderColor: colors.red.action,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  cancelNavButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.red.action,
  },
  markServedButton: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 140,
  },
  markServedButtonPressed: {
    opacity: 0.85,
  },
  markServedButtonDisabled: {
    backgroundColor: colors.surface.switchOff,
  },
  markServedButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },

  // Item list
  itemScroll: {
    flex: 1,
  },
  itemScrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
  itemCard: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: alpha.borderMin,
  },
  itemCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    flex: 1,
    paddingRight: 12,
  },
  itemQty: {
    color: colors.core.brandGreen,
  },
  itemStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  itemStatusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemModifier: {
    fontSize: 12,
    color: colors.text.label,
    marginTop: 6,
  },
  itemNote: {
    fontSize: 12,
    color: colors.orange.textDark,
    marginTop: 2,
  },

  // Status step buttons
  statusStepRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  statusStepButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: alpha.borderMin,
    backgroundColor: colors.core.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusStepButtonPressed: {
    opacity: 0.8,
  },
  statusStepButtonText: {
    fontSize: 13,
    color: colors.text.secondary,
  },

  footerNote: {
    fontSize: 11,
    color: colors.text.placeholder,
    textAlign: 'center',
    marginTop: 8,
  },

  // Print preview modal
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
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  printCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.searchChip,
  },
  printCloseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  printMeta: {
    fontSize: 12,
    color: colors.text.description,
    marginTop: 8,
  },
  printDivider: {
    height: 1,
    backgroundColor: alpha.borderMin,
    marginVertical: 14,
  },
  printItemList: {
    maxHeight: 260,
  },
  printItemRow: {
    marginBottom: 12,
  },
  printItemLine: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  printItemSub: {
    fontSize: 12,
    color: colors.text.label,
    marginTop: 2,
  },
  printConfirmButton: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  printConfirmButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
});