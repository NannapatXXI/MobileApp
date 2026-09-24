import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import colors,{alpha} from '../customer/style/colors';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

// สมมติชื่อไฟล์นี้ว่า CancelItemScreen.js — เปลี่ยนได้ถ้าอยากใช้ชื่ออื่น
// TODO: แก้ path ให้ตรงกับ query module จริงถ้าต่างจากที่สมมติไว้
import { getKitchenQueue, getCancelledItems, cancelItem } from '../../db/queries_kitchen/queue';

// สมมติชื่อ/รหัสพนักงานผู้กดยกเลิก — ในของจริงควรดึงจาก auth session ของเครื่องนั้นๆ
const CURRENT_STAFF_ID = 'KITCHEN-01';

const REASON_OPTIONS = [
  { key: 'out_of_stock', label: 'วัตถุดิบหมด' },
  { key: 'customer_cancel', label: 'ลูกค้าขอยกเลิก' },
  { key: 'wrong_order', label: 'กดสั่งผิด' },
];

function formatTimeWithSeconds(date) {
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function CancelItemScreen({ route, navigation }) {
  const db = useSQLiteContext();
  const { roundId } = route?.params ?? {};

  const [rounds, setRounds] = useState([]);
  const [cancelledLog, setCancelledLog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [reasonKey, setReasonKey] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(
    (opts = {}) => {
      if (!opts.silent) setIsLoading(true);
      return Promise.all([getKitchenQueue(db), getCancelledItems(db)])
        .then(([r, log]) => {
          setRounds(r);
          setCancelledLog(log);
        })
        .finally(() => {
          if (!opts.silent) setIsLoading(false);
        });
    },
    [db]
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const round = useMemo(() => rounds.find((r) => r.round_id === roundId) ?? rounds[0] ?? null, [rounds, roundId]);

  // เลือกรายการแรกที่ยัง "รอทำ" (ยกเลิกได้) ให้อัตโนมัติตอนโหลดใบ/เปลี่ยนใบ
  useEffect(() => {
    if (!round) {
      setSelectedItemId(null);
      return;
    }
    setSelectedItemId((prev) => {
      if (prev && round.items.some((i) => i.item_id === prev && i.status === 'waiting')) return prev;
      return round.items.find((i) => i.status === 'waiting')?.item_id ?? null;
    });
  }, [round]);

  const selectedItem = useMemo(
    () => round?.items.find((i) => i.item_id === selectedItemId) ?? null,
    [round, selectedItemId]
  );

  const handlePickItem = (item) => {
    if (item.status !== 'waiting') return; // ยกเลิกได้เฉพาะรายการที่ยังรอทำ
    setSelectedItemId(item.item_id);
    setReasonKey(null);
  };

  const handleConfirmCancel = () => {
    if (!selectedItem || !reasonKey) return;
    const reasonLabel = REASON_OPTIONS.find((r) => r.key === reasonKey)?.label ?? '';
    setIsSubmitting(true);
    cancelItem(db, selectedItem.item_id, reasonLabel)
      .then(() => loadData({ silent: true }))
      .then(() => setReasonKey(null))
      .finally(() => setIsSubmitting(false));
  };

  const handleDismiss = () => {
    setReasonKey(null);
  };

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

  return (
    <View style={styles.screen}>
      {/* ซ้าย — รายการอาหารในใบ + กฎการยกเลิก + log วันนี้ */}
      <View style={styles.leftPanel}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← กลับ</Text>
        </TouchableOpacity>

        <Text style={styles.roundTitle}>
          โต๊ะ {round.table_number} · รอบที่ {round.round_number}
        </Text>

        <ScrollView style={styles.itemScroll} contentContainerStyle={styles.itemScrollContent}>
          {round.items.map((item) => {
            const canCancel = item.status === 'waiting';
            const isSelected = item.item_id === selectedItemId;
            return (
              <View
                key={item.item_id}
                style={[styles.itemRow, isSelected && canCancel && styles.itemRowSelected]}
              >
                <View style={styles.itemRowLeft}>
                  <Text style={styles.itemName}>
                    <Text style={styles.itemQty}>{item.quantity}× </Text>
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.itemMeta,
                      item.status === 'cooking' && styles.itemMetaCooking,
                    ]}
                  >
                    {item.status === 'waiting' && `รอทำ · ส่งเข้าครัว ${round.order_time_label}`}
                    {item.status === 'cooking' && `กำลังทำ · เริ่ม ${item.status_time}`}
                    {item.status === 'served' && `เสิร์ฟแล้ว · ${item.status_time}`}
                  </Text>
                </View>

                {canCancel ? (
                  <Pressable style={styles.cancelChip} onPress={() => handlePickItem(item)}>
                    <Text style={styles.cancelChipText}>ยกเลิก</Text>
                  </Pressable>
                ) : (
                  <View style={styles.cancelChipDisabled}>
                    <Text style={styles.cancelChipDisabledText}>ยกเลิกไม่ได้</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.ruleBox}>
          <Text style={styles.ruleBoxTitle}>กฎการยกเลิก</Text>
          <Text style={styles.ruleBoxText}>
            ยกเลิกได้เฉพาะรายการที่ยังเป็น "รอทำ" เมื่อครัวเริ่มทำแล้วต้องให้พนักงานหน้าร้านอนุมัติ
            ทุกการยกเลิกจะบันทึกเวลาและผู้กดไว้ในบิล
          </Text>
        </View>

        <Text style={styles.logTitle}>บันทึกการยกเลิกวันนี้</Text>
        <ScrollView style={styles.logList}>
          {cancelledLog.length === 0 ? (
            <Text style={styles.logEmptyText}>ยังไม่มีรายการที่ถูกยกเลิกวันนี้</Text>
          ) : (
            cancelledLog.map((c) => (
              <View key={c.id} style={styles.logRow}>
                <Text style={styles.logRowLeft} numberOfLines={1}>
                  {c.cancelled_time_label} · โต๊ะ {c.table_number} รอบ {c.round_number} · {c.name} ×
                  {c.quantity}
                </Text>
                <Text style={styles.logRowRight}>{c.reason}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* ขวา — ยืนยันยกเลิกรายการที่เลือก */}
      <View style={styles.rightPanel}>
        {!selectedItem ? (
          <View style={styles.centerScreen}>
            <Text style={styles.centerScreenText}>เลือกรายการที่ต้องการยกเลิกจากซ้ายมือ</Text>
          </View>
        ) : (
          <>
            <Text style={styles.confirmTitle}>ยืนยันยกเลิกรายการ</Text>
            <Text style={styles.confirmSummary}>
              {selectedItem.name} ×{selectedItem.quantity} · โต๊ะ {round.table_number} รอบที่{' '}
              {round.round_number} · รายการนี้จะถูกตัดออกจากบิลลูกค้า
            </Text>

            <Text style={styles.reasonLabel}>เหตุผล</Text>
            <View style={styles.reasonList}>
              {REASON_OPTIONS.map((opt) => {
                const isActive = opt.key === reasonKey;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setReasonKey(opt.key)}
                    style={[styles.reasonRow, isActive && styles.reasonRowActive]}
                  >
                    <View style={[styles.radioOuter, isActive && styles.radioOuterActive]}>
                      {isActive && <View style={styles.radioInner} />}
                    </View>
                    <Text style={[styles.reasonText, isActive && styles.reasonTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.metaBox}>
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>CANCELLED AT</Text>
                <Text style={styles.metaValue}>{formatTimeWithSeconds(new Date(now))}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>BY</Text>
                <Text style={styles.metaValue}>{CURRENT_STAFF_ID}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>ORDER TIME</Text>
                <Text style={styles.metaValue}>{formatTimeWithSeconds(new Date(round.order_time))}</Text>
              </View>
            </View>

            <Pressable
              style={[styles.confirmButton, !reasonKey && styles.confirmButtonDisabled]}
              disabled={!reasonKey || isSubmitting}
              onPress={handleConfirmCancel}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.core.screenBg} />
              ) : (
                <Text style={styles.confirmButtonText}>ยืนยันยกเลิก</Text>
              )}
            </Pressable>

            <Pressable style={styles.dismissButton} onPress={handleDismiss}>
              <Text style={styles.dismissButtonText}>ไม่ยกเลิก</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.core.canvasBg,
    padding: 20,
    gap: 20,
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

  // Left panel
  leftPanel: {
    flex: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.searchChip,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 14,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.core.brandGreen,
  },
  roundTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginBottom: 16,
  },

  itemScroll: {
    maxHeight: 220,
  },
  itemScrollContent: {
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: alpha.borderMin,
    marginBottom: 12,
  },
  itemRowSelected: {
    borderColor: colors.red.action,
    borderWidth: 1.5,
  },
  itemRowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  itemQty: {
    color: colors.core.brandGreen,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  itemMetaCooking: {
    color: colors.orange.textDark,
  },
  cancelChip: {
    borderWidth: 1,
    borderColor: colors.red.action,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.red.action,
  },
  cancelChipDisabled: {
    borderWidth: 1,
    borderColor: alpha.borderMin,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelChipDisabledText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.placeholder,
  },

  ruleBox: {
    backgroundColor: colors.red.bgLight,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  ruleBoxTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.red.action,
    marginBottom: 6,
  },
  ruleBoxText: {
    fontSize: 12,
    color: colors.text.description,
    lineHeight: 18,
  },

  logTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginTop: 20,
    marginBottom: 10,
  },
  logList: {
    flex: 1,
  },
  logEmptyText: {
    fontSize: 12,
    color: colors.text.placeholder,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
  },
  logRowLeft: {
    flex: 1,
    fontSize: 12,
    color: colors.text.description,
  },
  logRowRight: {
    fontSize: 12,
    color: colors.text.placeholder,
  },

  // Right panel
  rightPanel: {
    width: 340,
    backgroundColor: colors.core.screenBg,
    borderRadius: 20,
    padding: 24,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  confirmSummary: {
    fontSize: 13,
    color: colors.text.description,
    marginTop: 10,
    lineHeight: 19,
  },

  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.label,
    marginTop: 20,
    marginBottom: 10,
  },
  reasonList: {
    gap: 10,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: alpha.borderMin,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  reasonRowActive: {
    borderColor: colors.red.action,
    backgroundColor: colors.red.bgLight,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.surface.switchOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.red.action,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.red.action,
  },
  reasonText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  reasonTextActive: {
    color: colors.red.action,
    fontWeight: '600',
  },

  metaBox: {
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: {
    fontSize: 11,
    color: colors.text.placeholder,
    fontFamily: 'monospace',
  },
  metaValue: {
    fontSize: 11,
    color: colors.text.secondary,
    fontFamily: 'monospace',
  },

  confirmButton: {
    backgroundColor: colors.red.action,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  dismissButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: alpha.borderMin,
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});