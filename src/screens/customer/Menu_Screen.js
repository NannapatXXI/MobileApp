import { StyleSheet, Text, View, TouchableOpacity, TextInput, Switch, ScrollView, Pressable, Image } from 'react-native';
import colors, { alpha } from './style/colors';
import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { getCategoriesWithCounts, getMenuItems } from '../../db/queries_customer/menu';
import { getBillRoundCount } from '../../db/queries_customer/orders';
import { MENU_IMAGES } from './menuImages';
import { useCart } from '../../context/CartContext';


export default function MenuScreen({ route, navigation }) {
  const { billId, tableId } = route.params ?? {};
  const db = useSQLiteContext();
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  const [searchText, setSearchText] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(true);  // toggle เอาไว้ติดตามการค้นหา 
  const [menuItems, setMenuItems] = useState([]);

  const { cart, removeFromCart } = useCart();

  const [roundCount, setRoundCount] = useState(0);

  const roundTotal = cart.reduce((sum, c) => sum + c.unit_price_satang * c.quantity, 0);

  useEffect(() => {
    getCategoriesWithCounts(db).then(setCategories)

  }, [db])

  // พอ categories โหลดมาครั้งแรก ให้เลือกหมวดแรกอัตโนมัติ (ยังไม่เคยเลือกอะไรเลย)
  useEffect(() => {
    if (selectedCategoryId == null && categories.length > 0) {
      setSelectedCategoryId(categories[0].category_id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    getMenuItems(db, { categoryId: selectedCategoryId, search: searchText, onlyAvailable }).then(setMenuItems)
  }, [db, selectedCategoryId, searchText, onlyAvailable]);




  // ReviewScreen หลังส่งครัวสำเร็จ ต้องรีเฟรชทุกครั้งที่กลับมา ไม่งั้นเลขที่โชว์จะค้าง
  // รีหน้าจอทุกครั้งที่กลับมาหน้าเมนู
  useFocusEffect(
    useCallback(() => {
      getBillRoundCount(db, billId).then(setRoundCount);
    }, [db, billId])
  );

  // cart มาจาก CartContext แล้ว (addToCart/removeFromCart) ไม่ต้องดัก route.params อีกต่อไป


  return (
    <View style={styles.screen}>
      
      
      <View style={styles.leftPanel}>
        <TouchableOpacity style={styles.backButton} onPress={() =>  navigation.navigate('SelectTable')}>
          <Text style={styles.backButtonText}>← กลับไปหน้าเลือกโต๊ะ</Text>
        </TouchableOpacity>
        <Text style={styles.restaurantName}> ครัว 4 สหาย </Text>
        <Text style={styles.billInfoText}>TBL - {tableId}</Text>
        <View style={styles.categoryList}>
          {categories.map((c) => {
            const isActive = c.category_id === selectedCategoryId;
            return (
              <TouchableOpacity
                key={c.category_id}
                onPress={() => setSelectedCategoryId(c.category_id)}
                style={[styles.categoryItem, isActive && styles.categoryItemActive]}
              >
                <Text style={[styles.categoryItemText, isActive && styles.categoryItemTextActive]}>
                  {c.name}
                </Text>
                <Text style={[styles.categoryItemCount, isActive && styles.categoryItemCountActive]}>
                  {c.item_count}
                </Text>
              </TouchableOpacity>
            );
          })}

        </View>
      </View>


      
      
      <View style={styles.middlePanel}>
        <View style={styles.topRow}>
          <TextInput
            style={styles.searchInput}
            placeholder='ค้นหาชื่อเมนู เช่น กะเพรา'
            placeholderTextColor={colors.text.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />

          <View style={styles.filterToggleRow}>
            <Text style={styles.filterToggleText}>เฉพาะที่มีของ</Text>
            <Switch
              value={onlyAvailable}
              onValueChange={setOnlyAvailable}
              trackColor={{ false: colors.surface.switchOff, true: colors.core.brandGreen }}
              thumbColor={colors.core.screenBg}
            />
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {categories.find((c) => c.category_id === selectedCategoryId)?.name ?? ''}
          </Text>
          <Text style={styles.sectionMeta}>{menuItems.length} รายการ</Text>
        </View>

        <ScrollView>
          <View style={styles.menuGrid}>
            {menuItems.map((item) => (
              <View key={item.item_id} style={styles.menuCard}>
                
                <View style={styles.menuCardImage}>
                  {MENU_IMAGES[item.name] ? (
                    <Image source={MENU_IMAGES[item.name]} style={styles.menuCardImagePhoto} />
                  ) : (
                    <Text style={styles.menuCardImageText}>food photo</Text>
                  )}
                </View>
                
                <View style={styles.menuCardBody}>
                  <Text style={styles.menuCardName}>{item.name}</Text>
                  <View style={styles.menuCardFooterRow}>
                    <Text style={styles.menuCardPrice}>
                      ฿{(item.price_satang / 100).toLocaleString()}
                    </Text>

                    <Pressable
                      style={styles.addButton}
                      onPress={() =>
                        navigation.navigate('ItemDetailScreen', { itemId: item.item_id })
                      }
                    >
                      <Text style={styles.addButtonText}>+</Text>
                    </Pressable>

                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View >


      
      
      <View style={styles.rightPanel}>
        <ScrollView style={styles.cartScroll}>
          <Text style={styles.cartHeaderTitle}>ตะกร้ารอบที่ {roundCount + 1}</Text>
          <Text style={styles.cartHeaderSubtitle}>ยังไม่ส่งครัว · แก้ไขได้</Text>

          <View style={styles.cartList}>
            {cart.map((c, index) => {
              const noteLine = [c.options?.map((o) => o.name).join(', '), c.note]
                .filter(Boolean)
                .join(' · ');
              return (
                <View key={`${c.item_id}-${index}`} style={styles.cartLineRow}>
                  <View style={styles.cartLineNameCol}>
                    <Text style={styles.cartLineQtyName}>{c.quantity}× {c.name}</Text>
                    {noteLine ? <Text style={styles.cartLineNote}>{noteLine}</Text> : null}
                  </View>
                  <Text style={styles.cartLinePrice}>
                    ฿{((c.unit_price_satang * c.quantity) / 100).toLocaleString()}
                  </Text>
                  <Pressable style={styles.cartRemoveButton} onPress={() => removeFromCart(index)}>
                    <Text style={styles.cartRemoveButtonText}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>


        <View style={styles.cartDivider} />

        <View style={styles.cartTotalRow}>
          <Text style={styles.cartTotalLabel}>รวมรอบนี้</Text>
          <Text style={styles.cartTotalValue}>฿{(roundTotal / 100).toLocaleString()}</Text>
        </View>

        <Pressable
          style={styles.reviewButton}
          disabled={cart.length === 0}
          onPress={() =>
            navigation.navigate('ReviewScreen', {
              billId,
              tableId,
              roundNumber: roundCount + 1,
            })
          }
        >
          <Text style={styles.reviewButtonText}>ตรวจรายการ →</Text>
        </Pressable>
      </View>


    </View>

  );
}

const styles = StyleSheet.create({
  // Layout หลัก — 3 zone
  screen: {
    flex: 1,
    flexDirection: 'row',
  },


  // ซ้าย — sidebar (ข้อมูลบิล + หมวดหมู่)
  leftPanel: {
    flex: 3,
    backgroundColor: colors.surface.sidebarCard,
    padding: 24,
    borderRightWidth: 1,
    borderRightColor: alpha.borderMin,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.statusGreenBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.core.brandGreen,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    marginTop: 24,
  },
  billInfoText: {
    fontSize: 13,
    color: colors.text.description,
    marginTop: 4,
  },
  categoryList: {
    marginTop: 24,
    gap: 4,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  categoryItemActive: {
    backgroundColor: colors.core.darkGreen,
  },
  categoryItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  categoryItemTextActive: {
    color: colors.core.screenBg,
  },
  categoryItemCount: {
    fontSize: 13,
    color: colors.text.placeholder,
  },
  categoryItemCountActive: {
    color: alpha.onDarkMax,
  },
  // กลาง — ค้นหา / filter / กริดเมนู
  middlePanel: {
    flex: 6,
    backgroundColor: colors.core.screenBg,
    padding: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface.searchChip,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text.secondary,
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface.statusGreenBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  sectionMeta: {
    fontSize: 13,
    color: colors.text.placeholder,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  menuCard: {
    width: '31%',
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha.borderMin,
    overflow: 'hidden',
  },
  menuCardImage: {
    width: '100%',
    height: 110,
    backgroundColor: colors.placeholder[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCardImageText: {
    fontSize: 12,
    color: colors.text.placeholder,
  },
  menuCardImagePhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  menuCardBody: {
    padding: 14,
  },
  menuCardName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  menuCardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  menuCardPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.core.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },

  // ขวา — ตะกร้ารอบปัจจุบัน
  rightPanel: {
    flex: 4,
    backgroundColor: colors.surface.cartPanel,
    padding: 24,
  },
  cartScroll: {
    flex: 1,
  },
  cartHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  cartHeaderSubtitle: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 4,
  },
  cartList: {
    marginTop: 20,
    gap: 16,
  },
  cartLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  cartLineNameCol: {
    flex: 1,
  },
  cartLineQtyName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  cartLineNote: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 2,
  },
  cartLinePrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  cartRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.red.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartRemoveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.red.action,
  },
  cartDivider: {
    height: 1,
    backgroundColor: alpha.borderMin,
    marginVertical: 20,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartTotalLabel: {
    fontSize: 14,
    color: colors.text.description,
  },
  cartTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  reviewButton: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  reviewButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
});
