import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import colors, { alpha } from './style/colors';
import { getMenuItemDetail } from '../../db/queries_customer/menu';
import { MENU_IMAGES } from './menuImages';
import { useCart } from '../../context/CartContext';

const QUICK_NOTE_TAGS = ['ไม่เผ็ด', 'ไม่ใส่ผัก', 'แยกข้าว'];

export default function ItemDetailScreen({ route, navigation }) {
  const { itemId } = route.params;
  const db = useSQLiteContext();
  const { addToCart } = useCart();

  const [item, setItem] = useState(null);
  const [options, setOptions] = useState([]);
  const [selectedSizeOptionId, setSelectedSizeOptionId] = useState(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    getMenuItemDetail(db, itemId).then(({ item, options }) => {
      setItem(item);
      setOptions(options);
      const defaultSize = options.find(
        (o) => o.selection_type === 'single' && o.is_available === 1
      );
      if (defaultSize) setSelectedSizeOptionId(defaultSize.option_id);
    });
  }, [db, itemId]);

  if (!item) return null;

  const sizeOptions = options.filter((o) => o.selection_type === 'single');
  const addonOptions = options.filter((o) => o.selection_type === 'multiple');

  function toggleAddon(optionId) {
    setSelectedAddonIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  }

  function appendQuickTag(tag) {
    setNote((prev) => (prev ? `${prev} ${tag}` : tag));
  }

  const sizeDelta =
    sizeOptions.find((o) => o.option_id === selectedSizeOptionId)?.price_delta_satang ?? 0;
  const addonsDelta = options
    .filter((o) => selectedAddonIds.includes(o.option_id))
    .reduce((sum, o) => sum + o.price_delta_satang, 0);
  const unitTotal = item.price_satang + sizeDelta + addonsDelta;
  const grandTotal = unitTotal * quantity;

  function handleAddToCart() {
    const selectedOptions = options.filter(
      (o) => o.option_id === selectedSizeOptionId || selectedAddonIds.includes(o.option_id)
    );

    addToCart({
      item_id: item.item_id,
      name: item.name,
      unit_price_satang: unitTotal,
      quantity,
      note,
      options: selectedOptions.map((o) => ({
        option_id: o.option_id,
        name: o.name,
        price_delta_satang: o.price_delta_satang,
      })),
    });

    navigation.goBack();
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Pressable style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>


        <View style={styles.imagePanel}>
          {MENU_IMAGES[item.name] ? (
            <Image source={MENU_IMAGES[item.name]} style={styles.imagePanelPhoto} />
          ) : (
            <View style={styles.imagePanelCaption}>
              <Text style={styles.imagePanelCaptionText}>ภาพเมนู 4:5 — {item.name}</Text>
            </View>
          )}
        </View>

        
        
        <View style={styles.contentPanel}>
        <Text style={styles.itemName}>{item.name}</Text>

        <ScrollView style={styles.scrollArea}>
          {sizeOptions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                ขนาด <Text style={styles.requiredTag}>เลือก 1 · จำเป็น</Text>
              </Text>
              {sizeOptions.map((o) => {
                const selected = o.option_id === selectedSizeOptionId;
                return (
                  <Pressable
                    key={o.option_id}
                    onPress={() => setSelectedSizeOptionId(o.option_id)}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                  >
                    <Text style={styles.optionName}>{o.name}</Text>
                    <Text style={styles.optionPrice}>
                      +฿{(o.price_delta_satang / 100).toLocaleString()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {addonOptions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                เพิ่มเติม <Text style={styles.optionalTag}>เลือกได้หลายอย่าง</Text>
              </Text>
              {addonOptions.map((o) => {
                const selected = selectedAddonIds.includes(o.option_id);
                const disabled = o.is_available === 0;
                return (
                  <Pressable
                    key={o.option_id}
                    disabled={disabled}
                    onPress={() => toggleAddon(o.option_id)}
                    style={[
                      styles.optionRow,
                      selected && styles.optionRowSelected,
                      disabled && styles.optionRowDisabled,
                    ]}
                  >
                    <Text style={styles.optionName}>{o.name}</Text>
                    <Text style={styles.optionPrice}>
                      {disabled ? 'ของหมด' : `+฿${(o.price_delta_satang / 100).toLocaleString()}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>หมายเหตุถึงครัว</Text>
            <TextInput
              testID="input-note"
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="เช่น ไม่ใส่ผักชี เผ็ดน้อย"
              placeholderTextColor={colors.text.placeholder}
              multiline
            />
            <View style={styles.quickTagRow}>
              {QUICK_NOTE_TAGS.map((tag) => (
                <Pressable key={tag} style={styles.quickTag} onPress={() => appendQuickTag(tag)}>
                  <Text style={styles.quickTagText}>{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footerRow}>
          <View style={styles.quantityStepper}>
            <Pressable
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Text style={styles.stepperButtonText}>−</Text>
            </Pressable>
            <Text style={styles.stepperValue}>{quantity}</Text>
            <Pressable testID="btn-qty-plus" style={styles.stepperButton} onPress={() => setQuantity((q) => q + 1)}>
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          </View>

          <Pressable testID="btn-add-to-cart" style={styles.addToCartButton} onPress={handleAddToCart}>
            <Text style={styles.addToCartButtonText}>
              เพิ่มลงตะกร้า · ฿{(grandTotal / 100).toLocaleString()}
            </Text>
          </Pressable>
        </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: alpha.borderMax,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 900,
    maxHeight: '85%',
    backgroundColor: colors.core.screenBg,
    borderRadius: 24,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.core.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text.description,
  },

  // ฝั่งซ้าย — รูปเมนู (เต็มขอบ ไม่มี padding กันรูปจริงถูกเว้นขอบ) / placeholder ตอนยังไม่มีรูป
  imagePanel: {
    flex: 4,
    backgroundColor: colors.placeholder[0],
    justifyContent: 'flex-end',
  },
  imagePanelCaption: {
    alignSelf: 'flex-start',
    backgroundColor: colors.core.screenBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    margin: 16,
  },
  imagePanelCaptionText: {
    fontSize: 11,
    color: colors.text.placeholder,
  },
  imagePanelPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  // ฝั่งขวา — เนื้อหา
  contentPanel: {
    flex: 6,
    padding: 24,
  },
  itemName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    paddingRight: 36,
  },
  scrollArea: {
    marginTop: 16,
  },
  section: {
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginBottom: 10,
  },
  requiredTag: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.orange.textDark,
  },
  optionalTag: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.placeholder,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: alpha.borderMin,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optionRowSelected: {
    borderColor: colors.core.brandGreen,
    borderWidth: 2,
    backgroundColor: colors.surface.statusGreenBg,
  },
  optionRowDisabled: {
    opacity: 0.5,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  optionPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.placeholder,
  },
  noteInput: {
    backgroundColor: colors.surface.searchChip,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text.secondary,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  quickTagRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickTag: {
    backgroundColor: colors.surface.searchChip,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  quickTagText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.searchChip,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.core.darkGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    minWidth: 20,
    textAlign: 'center',
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: colors.core.brandGreen,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addToCartButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
});
