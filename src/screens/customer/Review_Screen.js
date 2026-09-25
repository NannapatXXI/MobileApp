import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import colors, { alpha } from './style/colors';
import { useCart } from '../../context/CartContext';
import { getPreviousRoundsSummary, submitOrderRound } from '../../db/queries_customer/orders';
import { MENU_IMAGES } from './menuImages';

export default function ReviewScreen({ route, navigation }) {
  const { billId, tableId, roundNumber } = route.params ?? {};
  const { cart, updateQuantity, clearCart } = useCart();
  const db = useSQLiteContext();

  const [previousRounds, setPreviousRounds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getPreviousRoundsSummary(db, billId).then(setPreviousRounds);
  }, [db, billId]);

  const roundTotal = cart.reduce((sum, c) => sum + c.unit_price_satang * c.quantity, 0);
  const totalPieces = cart.reduce((sum, c) => sum + c.quantity, 0);
  const previousTotal = previousRounds.reduce((sum, r) => sum + r.total_satang, 0);
  const grandTotal = previousTotal + roundTotal;

  async function handleSubmit() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await submitOrderRound(db, { billId, cart });
      clearCart();
      navigation.navigate('SendToKitchen', { billId, tableId });
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <View style={styles.screen}>
      <View style={styles.leftPanel}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>
            <View>
              <Text style={styles.reviewTitle}>ตรวจรายการก่อนส่งครัว</Text>
              <Text style={styles.reviewSubtitle}>
                โต๊ะ {tableId} · บิล #{billId} · จะส่งเป็นรอบที่ {roundNumber}
              </Text>
            </View>
          </View>
          <View style={styles.warningBadge}>
            <Text style={styles.warningBadgeText}>ส่งแล้วแก้ไม่ได้ ตรวจให้ครบนะเด้ออ</Text>
          </View>
        </View>

        <View style={styles.headerDivider} />

        <ScrollView>
          <View style={styles.reviewList}>
            {cart.map((c, index) => {
              const optionsLine = c.options?.map((o) => `${o.name} +฿${(o.price_delta_satang / 100)}`).join(' · ');
              return (
                <View key={`${c.item_id}-${index}`} style={styles.reviewCard}>
                  <View style={styles.reviewCardImage}>
                    {MENU_IMAGES[c.name] && (
                      <Image source={MENU_IMAGES[c.name]} style={styles.reviewCardImagePhoto} />
                    )}
                  </View>

                  <View style={styles.reviewCardBody}>
                    <Text style={styles.reviewCardName}>{c.name}</Text>
                    <Text style={styles.reviewCardMeta}>
                      {optionsLine} · ฿{(c.unit_price_satang / 100).toLocaleString()} / จาน
                    </Text>
                    {c.note ? <Text style={styles.reviewCardNote}>หมายเหตุ: {c.note}</Text> : null}
                  </View>

                  <View style={styles.reviewCardStepper}>
                    <Pressable style={styles.stepperButton} onPress={() => updateQuantity(index, -1)}>
                      <Text style={styles.stepperButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValue}>{c.quantity}</Text>
                    <Pressable style={styles.stepperButton} onPress={() => updateQuantity(index, 1)}>
                      <Text style={styles.stepperButtonText}>+</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.reviewCardPrice}>
                    ฿{((c.unit_price_satang * c.quantity) / 100).toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>

          <Pressable style={styles.addMoreButton} onPress={() => navigation.goBack()}>
            <Text style={styles.addMoreButtonText}>+ เพิ่มเมนูอื่นในรอบนี้</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.rightPanel}>
        <Text style={styles.summaryTitle}>สรุปรอบที่ {roundNumber}</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{cart.length} รายการ · {totalPieces} ชิ้น</Text>
          <Text style={styles.summaryValue}>฿{(roundTotal / 100).toLocaleString()}</Text>
        </View>

        <View style={styles.summaryDivider} />

        {previousRounds.map((r) => (
          <View key={r.round_number} style={styles.summaryRow}>
            <Text style={styles.previousRoundLabel}>รอบที่ {r.round_number} (ส่งครัวแล้ว)</Text>
            <Text style={styles.summaryValue}>฿{(r.total_satang / 100).toLocaleString()}</Text>
          </View>
        ))}

        <View style={styles.summaryRow}>
          <Text style={styles.grandTotalLabel}>ยอดบิลรวมหลังส่ง</Text>
          <Text style={styles.grandTotalValue}>฿{(grandTotal / 100).toLocaleString()}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoBoxTitle}>ครัวจะได้รับเป็นออร์เดอร์เดียว</Text>
          <Text style={styles.infoBoxText}>
            รายการทั้งหมดในรอบนี้จะเข้าคิวครัวพร้อมกัน เรียงตามเวลาที่กดส่ง
          </Text>
        </View>

        <Pressable style={styles.submitButton} disabled={submitting} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>ส่งเข้าครัว · รอบที่ {roundNumber}</Text>
        </Pressable>

        <Pressable style={styles.backToMenuButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backToMenuButtonText}>กลับไปหน้าเมนู</Text>
        </Pressable>
      </View>
    </View>
  );

}

const styles = StyleSheet.create({
  // ---------------------------------------------------------------------
  // Layout หลัก — 2 zone (ซ้าย = รายการ, ขวา = สรุป+ปุ่ม)
  // ---------------------------------------------------------------------
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.core.screenBg,
  },
  leftPanel: {
    flex: 7,
    padding: 24,
  },
  rightPanel: {
    flex: 3,
    backgroundColor: colors.surface.cartPanel,
    padding: 24,
  },

  // ---------------------------------------------------------------------
  // ซ้าย — header (ปุ่มย้อนกลับ + หัวข้อ + badge เตือน)
  // ---------------------------------------------------------------------
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface.sidebarCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 18,
    color: colors.core.darkGreen,
  },
  reviewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  reviewSubtitle: {
    fontSize: 13,
    color: colors.text.description,
    marginTop: 4,
  },
  warningBadge: {
    backgroundColor: colors.orange.bgLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  warningBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.orange.textDark,
  },
  headerDivider: {
    height: 1,
    backgroundColor: alpha.borderMin,
    marginTop: 20,
    marginBottom: 20,
  },

  // ---------------------------------------------------------------------
  // ซ้าย — การ์ดรายการในตะกร้า
  // ---------------------------------------------------------------------
  reviewList: {
    gap: 16,
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: alpha.borderMin,
    borderRadius: 16,
    padding: 16,
  },
  reviewCardImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.placeholder[0],
  },
  reviewCardImagePhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    resizeMode: 'cover',
  },
  reviewCardBody: {
    flex: 1,
  },
  reviewCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  reviewCardMeta: {
    fontSize: 13,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  reviewCardNote: {
    fontSize: 13,
    color: colors.orange.textDark,
    marginTop: 4,
  },
  reviewCardStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.searchChip,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.core.darkGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    minWidth: 16,
    textAlign: 'center',
  },
  reviewCardPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    minWidth: 60,
    textAlign: 'right',
  },

  // ---------------------------------------------------------------------
  // ซ้าย — ปุ่มเพิ่มเมนูอื่น
  // ---------------------------------------------------------------------
  addMoreButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: alpha.borderMax,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  addMoreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  // ---------------------------------------------------------------------
  // ขวา — สรุปยอด
  // ---------------------------------------------------------------------
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text.description,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: alpha.borderMin,
    marginVertical: 16,
  },
  previousRoundLabel: {
    fontSize: 13,
    color: colors.text.placeholder,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },

  // ---------------------------------------------------------------------
  // ขวา — กล่องข้อความอธิบาย
  // ---------------------------------------------------------------------
  infoBox: {
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  infoBoxText: {
    fontSize: 13,
    color: colors.text.placeholder,
    marginTop: 6,
    lineHeight: 19,
  },

  // ---------------------------------------------------------------------
  // ขวา — ปุ่มล่าง
  // ---------------------------------------------------------------------
  submitButton: {
    backgroundColor: colors.core.brandGreen,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 'auto',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  backToMenuButton: {
    borderWidth: 1,
    borderColor: alpha.borderMin,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  backToMenuButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
});
