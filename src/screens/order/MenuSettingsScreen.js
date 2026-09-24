import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  FlatList,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

// ไฟล์นี้อยู่ที่ src/screens/employee/MenuSettingsScreen.js
// colors.js / menuQueries.js อยู่ที่ src/screens/customer/ ตามโครงสร้างจริงของโปรเจกต์คุณ
// ถ้าย้ายไฟล์ ให้แก้ path 2 บรรทัดนี้ตามตำแหน่งใหม่
import colors, { withAlpha } from '../customer/style/colors';
import {
  getCategories,
  getMenuItemsWithCategory,
  getSoldTodayByItem,
  getMenuOptionsByItem,
  updateMenuItem,
  setMenuItemAvailability,
  addMenuOption,
  addMenuItem,
} from '../customer/Settingmenu';

const border = withAlpha(colors.core.darkGreen, 0.12);

const SIDEBAR_ITEMS = [
  'เมนูและราคา',
  'หมวดหมู่',
  'ตัวเลือกย่อย / ท็อปปิ้ง',
  'บิลทั้งร้าน',
  'พนักงาน',
];

function satangToBaht(satang) {
  return Math.round(satang / 100);
}

function bahtToSatang(baht) {
  return Math.round(baht * 100);
}

function SidebarItem({ label, active }) {
  return (
    <TouchableOpacity style={[styles.sidebarItem, active && styles.sidebarItemActive]}>
      <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function CategoryChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.categoryChip, active && styles.categoryChipActive]}
      onPress={onPress}
    >
      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MenuRow({ item, selected, onPress, onToggleOpen }) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, selected && styles.menuRowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuRowName}>
        <Text style={styles.menuRowTitle}>{item.name}</Text>
        <Text style={styles.menuRowSubtitle}>{item.categoryName}</Text>
      </View>
      <Text style={styles.menuRowPrice}>฿{satangToBaht(item.priceSatang)}</Text>
      <Text style={styles.menuRowSold}>{item.soldToday ?? 0}</Text>
      <View style={styles.menuRowStatus}>
        <Text style={item.isAvailable ? styles.statusOpen : styles.statusClosed}>
          {item.isAvailable ? 'เปิด' : 'ปิดชั่วคราว'}
        </Text>
        <Switch
          value={!!item.isAvailable}
          onValueChange={() => onToggleOpen(item)}
          trackColor={{ false: colors.surface.switchOff, true: colors.core.brandGreen }}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function MenuSettingsScreen() {
  const db = useSQLiteContext();

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(null); // null = ทั้งหมด
  const [options, setOptions] = useState([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // ฟอร์มแก้ไขเมนูที่เลือก (แยกจาก list จนกว่าจะกด "บันทึกการแก้ไข")
  const [editName, setEditName] = useState('');
  const [editPriceBaht, setEditPriceBaht] = useState('');
  const [editCategoryId, setEditCategoryId] = useState(null);

  // ฟอร์มเพิ่มเมนูใหม่
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPriceBaht, setAddPriceBaht] = useState('');
  const [addCategoryId, setAddCategoryId] = useState(null);
  const [addCategoryPickerOpen, setAddCategoryPickerOpen] = useState(false);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const loadData = useCallback(async () => {
    const [cats, menuItems, soldMap] = await Promise.all([
      getCategories(db),
      getMenuItemsWithCategory(db),
      getSoldTodayByItem(db),
    ]);
    const merged = menuItems.map((mi) => ({ ...mi, soldToday: soldMap[mi.id] ?? 0 }));
    setCategories(cats);
    setItems(merged);
    setSelectedId((current) => current ?? (merged[0] ? merged[0].id : null));
    return { cats, merged };
  }, [db]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // โหลดตัวเลือกย่อย + เติมฟอร์มแก้ไข ทุกครั้งที่เปลี่ยนรายการที่เลือก
  useEffect(() => {
    if (!selectedItem) return;
    setEditName(selectedItem.name);
    setEditPriceBaht(String(satangToBaht(selectedItem.priceSatang)));
    setEditCategoryId(selectedItem.categoryId);
    getMenuOptionsByItem(db, selectedItem.id).then(setOptions);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // กรองตามคำค้นหา + หมวดหมู่ที่เลือก (กดชิปหมวดหมู่แล้วเหลือแต่หมวดนั้น)
  const filteredItems = items.filter((i) => {
    const matchesSearch = i.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesCategory = activeCategoryId === null || i.categoryId === activeCategoryId;
    return matchesSearch && matchesCategory;
  });

  async function handleToggleOpen(item) {
    await setMenuItemAvailability(db, item.id, !item.isAvailable);
    await loadData();
  }

  async function handleSave() {
    if (!selectedItem) return;
    await updateMenuItem(db, selectedItem.id, {
      name: editName,
      priceSatang: bahtToSatang(Number(editPriceBaht) || 0),
      categoryId: editCategoryId,
    });
    await loadData();
  }

  async function handleAddOption() {
    if (!selectedItem) return;
    await addMenuOption(db, selectedItem.id, 'ตัวเลือกใหม่', 0);
    const updated = await getMenuOptionsByItem(db, selectedItem.id);
    setOptions(updated);
  }

  function openAddModal() {
    setAddName('');
    setAddPriceBaht('');
    setAddCategoryId(categories[0]?.id ?? null);
    setAddModalOpen(true);
  }

  async function handleCreateItem() {
    if (!addName.trim() || !addCategoryId || !addPriceBaht) return; // กันกรอกไม่ครบ
    const newId = await addMenuItem(db, {
      name: addName.trim(),
      categoryId: addCategoryId,
      priceSatang: bahtToSatang(Number(addPriceBaht) || 0),
    });
    setAddModalOpen(false);
    await loadData();
    setSelectedId(newId); // เลือกเมนูที่เพิ่งเพิ่ม ให้เปิดแผงแก้ไขขึ้นมาเลย
  }

  const selectedCategoryName = categories.find((c) => c.id === editCategoryId)?.name ?? '';
  const addCategoryName = categories.find((c) => c.id === addCategoryId)?.name ?? 'เลือกหมวด';

  return (
    <View style={styles.screen}>
      {/* ---- คอลัมน์ซ้าย: sidebar ---- */}
      <View style={styles.sidebar}>
        <Text style={styles.sidebarTitle}>ตั้งค่าร้าน</Text>
        <Text style={styles.sidebarSubtitle}>ผู้จัดการ · ป้าน้อย</Text>
        <View style={{ height: 20 }} />
        {SIDEBAR_ITEMS.map((label, idx) => (
          <SidebarItem key={label} label={label} active={idx === 0} />
        ))}
      </View>

      {/* ---- คอลัมน์กลาง: รายการเมนู ---- */}
      <View style={styles.menuColumn}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาเมนูที่จะแก้ไข"
            placeholderTextColor={colors.text.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />
          <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
            <Text style={styles.addButtonText}>+ เพิ่มเมนูใหม่</Text>
          </TouchableOpacity>
        </View>

        {/* ---- แถบชิปหมวดหมู่ — กดแล้วกรอง list เหลือแต่หมวดนั้น ---- */}
        <View style={styles.categoryChipsRow}>
          <CategoryChip
            label="ทั้งหมด"
            active={activeCategoryId === null}
            onPress={() => setActiveCategoryId(null)}
          />
          {categories.map((cat) => (
            <CategoryChip
              key={cat.id}
              label={cat.name}
              active={activeCategoryId === cat.id}
              onPress={() => setActiveCategoryId(cat.id)}
            />
          ))}
        </View>

        <View style={styles.menuHeaderRow}>
          <Text style={[styles.menuHeaderText, { flex: 1 }]}>เมนู</Text>
          <Text style={styles.menuHeaderTextPrice}>ราคา</Text>
          <Text style={styles.menuHeaderTextSold}>ขายวันนี้</Text>
          <Text style={styles.menuHeaderTextStatus}>เปิดขาย</Text>
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <MenuRow
              item={item}
              selected={item.id === selectedId}
              onPress={() => setSelectedId(item.id)}
              onToggleOpen={handleToggleOpen}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>ไม่มีเมนูในหมวดนี้</Text>
          }
        />
      </View>

      {/* ---- คอลัมน์ขวา: แก้ไขเมนู ---- */}
      {selectedItem && (
        <View style={styles.editPanel}>
          <Text style={styles.editTitle}>แก้ไขเมนู</Text>
          <Text style={styles.editSubtitle}>{selectedItem.name}</Text>

          <Text style={styles.fieldLabel}>ชื่อเมนู</Text>
          <TextInput style={styles.textInput} value={editName} onChangeText={setEditName} />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.fieldLabel}>ราคา</Text>
              <TextInput
                style={styles.textInput}
                value={editPriceBaht}
                keyboardType="numeric"
                onChangeText={(text) => setEditPriceBaht(text.replace(/[^0-9]/g, ''))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>หมวด</Text>
              <TouchableOpacity
                style={styles.categoryPicker}
                onPress={() => setCategoryPickerOpen(true)}
              >
                <Text style={styles.categoryPickerText}>{selectedCategoryName} ⌄</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.fieldLabel}>ตัวเลือกย่อยที่มีผลต่อราคา</Text>
          {options.map((opt) => (
            <View key={opt.id} style={styles.addonRow}>
              <Text style={styles.addonLabel}>{opt.name}</Text>
              <Text style={styles.addonPrice}>+฿{satangToBaht(opt.priceDeltaSatang)}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.addAddonButton} onPress={handleAddOption}>
            <Text style={styles.addAddonText}>+ เพิ่มตัวเลือก</Text>
          </TouchableOpacity>

          <View style={styles.disableRow}>
            <Text style={styles.disableLabel}>ปิดขายชั่วคราว</Text>
            <Switch
              value={!selectedItem.isAvailable}
              onValueChange={() => handleToggleOpen(selectedItem)}
              trackColor={{ false: colors.orange.bgLight, true: colors.orange.brand }}
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>บันทึกการแก้ไข</Text>
          </TouchableOpacity>
          <Text style={styles.saveNote}>การเปลี่ยนราคามีผลกับบิลที่เปิดใหม่เท่านั้น</Text>
        </View>
      )}

      {/* ---- modal เลือกหมวดหมู่ (แผงแก้ไขเมนู) ---- */}
      <Modal visible={categoryPickerOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCategoryPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.modalRow}
                onPress={() => {
                  setEditCategoryId(cat.id);
                  setCategoryPickerOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ---- modal เพิ่มเมนูใหม่ ---- */}
      <Modal visible={addModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.addModalCard}>
            <Text style={styles.editTitle}>เพิ่มเมนูใหม่</Text>

            <Text style={styles.fieldLabel}>ชื่อเมนู</Text>
            <TextInput
              style={styles.textInput}
              value={addName}
              onChangeText={setAddName}
              placeholder="เช่น ผัดกะเพราหมูสับ"
              placeholderTextColor={colors.text.placeholder}
            />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>ราคา (บาท)</Text>
                <TextInput
                  style={styles.textInput}
                  value={addPriceBaht}
                  keyboardType="numeric"
                  onChangeText={(text) => setAddPriceBaht(text.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>หมวด</Text>
                <TouchableOpacity
                  style={styles.categoryPicker}
                  onPress={() => setAddCategoryPickerOpen(true)}
                >
                  <Text style={styles.categoryPickerText}>{addCategoryName} ⌄</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.addModalButtonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setAddModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButtonSmall} onPress={handleCreateItem}>
                <Text style={styles.saveButtonText}>เพิ่มเมนู</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- modal เลือกหมวดหมู่ (ฟอร์มเพิ่มเมนูใหม่) ---- */}
      <Modal visible={addCategoryPickerOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAddCategoryPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.modalRow}
                onPress={() => {
                  setAddCategoryId(cat.id);
                  setAddCategoryPickerOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.core.screenBg,
  },

  // ---- Sidebar ----
  sidebar: {
    width: 220,
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: border,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  sidebarSubtitle: {
    fontSize: 12,
    color: colors.text.label,
    marginTop: 2,
  },
  sidebarItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  sidebarItemActive: {
    backgroundColor: colors.core.darkGreen,
  },
  sidebarItemText: {
    fontSize: 14,
    color: colors.core.darkGreen,
  },
  sidebarItemTextActive: {
    color: colors.core.screenBg,
    fontWeight: 'bold',
  },

  // ---- Menu column ----
  menuColumn: {
    flex: 1,
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: border,
  },
  searchRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface.searchChip,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 13,
    color: colors.core.darkGreen,
  },
  addButton: {
    backgroundColor: colors.core.brandGreen,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.core.screenBg,
    fontWeight: 'bold',
    fontSize: 13,
  },

  // ---- Category chips ----
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  categoryChip: {
    backgroundColor: colors.surface.searchChip,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipActive: {
    backgroundColor: colors.core.brandGreen,
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  categoryChipTextActive: {
    color: colors.core.screenBg,
    fontWeight: 'bold',
  },

  menuHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  menuHeaderText: {
    fontSize: 12,
    color: colors.text.label,
  },
  menuHeaderTextPrice: {
    width: 70,
    fontSize: 12,
    color: colors.text.label,
    textAlign: 'right',
  },
  menuHeaderTextSold: {
    width: 70,
    fontSize: 12,
    color: colors.text.label,
    textAlign: 'right',
  },
  menuHeaderTextStatus: {
    width: 110,
    fontSize: 12,
    color: colors.text.label,
    textAlign: 'right',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: border,
  },
  menuRowSelected: {
    borderColor: colors.core.brandGreen,
    borderWidth: 2,
  },
  menuRowName: {
    flex: 1,
  },
  menuRowTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  menuRowSubtitle: {
    fontSize: 11,
    color: colors.text.label,
    marginTop: 2,
  },
  menuRowPrice: {
    width: 70,
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
    textAlign: 'right',
  },
  menuRowSold: {
    width: 70,
    fontSize: 13,
    color: colors.text.label,
    textAlign: 'right',
  },
  menuRowStatus: {
    width: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  statusOpen: {
    fontSize: 12,
    color: colors.text.label,
    marginRight: 6,
  },
  statusClosed: {
    fontSize: 12,
    color: colors.orange.textDark,
    marginRight: 6,
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.label,
    textAlign: 'center',
    marginTop: 20,
  },

  // ---- Edit panel ----
  editPanel: {
    width: 340,
    padding: 20,
    backgroundColor: colors.surface.cartPanel,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  editSubtitle: {
    fontSize: 13,
    color: colors.text.label,
    marginTop: 2,
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.text.label,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.core.darkGreen,
  },
  fieldRow: {
    flexDirection: 'row',
  },
  categoryPicker: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryPickerText: {
    fontSize: 14,
    color: colors.core.darkGreen,
  },
  addonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  addonLabel: {
    fontSize: 13,
    color: colors.core.darkGreen,
  },
  addonPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  addAddonButton: {
    borderWidth: 1,
    borderColor: border,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  addAddonText: {
    fontSize: 13,
    color: colors.text.label,
  },
  disableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.orange.bgLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  disableLabel: {
    fontSize: 13,
    color: colors.orange.textDark,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: colors.core.darkGreen,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonSmall: {
    flex: 1,
    backgroundColor: colors.core.darkGreen,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveButtonText: {
    color: colors.core.screenBg,
    fontWeight: 'bold',
    fontSize: 14,
  },
  saveNote: {
    fontSize: 11,
    color: colors.text.label,
    textAlign: 'center',
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.text.secondary,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // ---- Category picker modal ----
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(colors.core.darkGreen, 0.35),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: 260,
    backgroundColor: colors.core.screenBg,
    borderRadius: 14,
    paddingVertical: 8,
  },
  modalRow: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  modalRowText: {
    fontSize: 14,
    color: colors.core.darkGreen,
  },

  // ---- Add menu item modal ----
  addModalCard: {
    width: 360,
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    padding: 20,
  },
  addModalButtonRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
});