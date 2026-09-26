import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Switch, FlatList, TouchableOpacity, Modal, Pressable,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import colors, { withAlpha } from '../customer/style/colors';

// ---------------------------------------------------------------------------
// db functions — รวมไว้ไฟล์เดียวกับหน้าจอ ตรงกับตารางใน db/schema.js
// (categories, menu_items, menu_options, order_items, order_rounds, bills)
// ---------------------------------------------------------------------------
const satangToBaht = (satang) => Math.round(satang / 100);
const bahtToSatang = (baht) => Math.round(baht * 100);
const getCategories = (db) =>
  db.getAllAsync('SELECT category_id AS id, name FROM categories ORDER BY category_id');
const getMenuItemsWithCategory = (db) =>
  db.getAllAsync(`SELECT mi.item_id AS id, mi.name, mi.price_satang AS priceSatang,
    mi.is_available AS isAvailable, mi.category_id AS categoryId, c.name AS categoryName
    FROM menu_items mi JOIN categories c ON c.category_id = mi.category_id ORDER BY mi.item_id`);
async function getSoldTodayByItem(db) {
  const rows = await db.getAllAsync(`SELECT oi.item_id AS itemId, SUM(oi.quantity) AS qty
    FROM order_items oi JOIN order_rounds r ON r.round_id = oi.round_id
    JOIN bills b ON b.bill_id = r.bill_id
    WHERE oi.status != 'cancelled' AND date(b.opened_at) = date('now', 'localtime')
    GROUP BY oi.item_id`);
  const map = {};
  for (const row of rows) map[row.itemId] = row.qty;
  return map;
}

const getMenuOptionsByItem = (db, itemId) =>
  db.getAllAsync(
    'SELECT option_id AS id, name, price_delta_satang AS priceDeltaSatang FROM menu_options WHERE item_id = ? ORDER BY option_id',
    [itemId]
  );
const updateMenuItem = (db, itemId, { name, priceSatang, categoryId }) =>
  db.runAsync('UPDATE menu_items SET name = ?, price_satang = ?, category_id = ? WHERE item_id = ?', [
    name, priceSatang, categoryId, itemId,
  ]);
const setMenuItemAvailability = (db, itemId, isAvailable) =>
  db.runAsync('UPDATE menu_items SET is_available = ? WHERE item_id = ?', [isAvailable ? 1 : 0, itemId]);
const addMenuOption = async (db, itemId, name, priceDeltaSatang) =>
  (await db.runAsync('INSERT INTO menu_options (item_id, name, price_delta_satang) VALUES (?, ?, ?)', [
    itemId, name, priceDeltaSatang,
  ])).lastInsertRowId;
const addMenuItem = async (db, { name, categoryId, priceSatang }) =>
  (await db.runAsync('INSERT INTO menu_items (category_id, name, price_satang) VALUES (?, ?, ?)', [
    categoryId, name, priceSatang,
  ])).lastInsertRowId;
const border = withAlpha(colors.core.darkGreen, 0.12);
const SIDEBAR_ITEMS = ['เมนูและราคา', 'บิลทั้งร้าน'];
const SUMMARY_ROUTE = 'Summary'; // ชื่อ route ของ SummaryScreen ใน navigator (แก้ให้ตรงกับที่ลงทะเบียนไว้)

// ---------------------------------------------------------------------------
// ชิ้นส่วนย่อยที่ใช้ซ้ำ
// ---------------------------------------------------------------------------

function SidebarItem({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.sidebarItem, active && styles.sidebarItemActive]} onPress={onPress}>
      <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CategoryChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.categoryChip, active && styles.categoryChipActive]} onPress={onPress}>
      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function MenuRow({ item, selected, onPress, onToggleOpen }) {
  return (
    <TouchableOpacity style={[styles.menuRow, selected && styles.menuRowSelected]} onPress={onPress} activeOpacity={0.7}>
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

// modal เลือกหมวดหมู่ — ใช้ร่วมกันทั้งฟอร์มแก้ไขและฟอร์มเพิ่มเมนู
function CategoryPickerModal({ visible, categories, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalCard}>
          {categories.map((cat) => (
            <TouchableOpacity key={cat.id} style={styles.modalRow} onPress={() => onSelect(cat.id)}>
              <Text style={styles.modalRowText}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// แผงแก้ไขเมนู (คอลัมน์ขวา)
function EditPanel({ item, options, name, onChangeName, priceBaht, onChangePrice, categoryName, onOpenCategoryPicker, onAddOption, onToggleOpen, onSave }) {
  return (
    <View style={styles.editPanel}>
      <Text style={styles.editTitle}>แก้ไขเมนู</Text>
      <Text style={styles.editSubtitle}>{item.name}</Text>
      <Text style={styles.fieldLabel}>ชื่อเมนู</Text>
      <TextInput style={styles.textInput} value={name} onChangeText={onChangeName} />
      <View style={styles.fieldRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.fieldLabel}>ราคา</Text>
          <TextInput
            style={styles.textInput}
            value={priceBaht}
            keyboardType="numeric"
            onChangeText={(text) => onChangePrice(text.replace(/[^0-9]/g, ''))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>หมวด</Text>
          <TouchableOpacity style={styles.categoryPicker} onPress={onOpenCategoryPicker}>
            <Text style={styles.categoryPickerText}>{categoryName} ⌄</Text>
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
      <TouchableOpacity style={styles.addAddonButton} onPress={onAddOption}>
        <Text style={styles.addAddonText}>+ เพิ่มตัวเลือก</Text>
      </TouchableOpacity>
      <View style={styles.disableRow}>
        <Text style={styles.disableLabel}>ปิดขายชั่วคราว</Text>
        <Switch
          value={!item.isAvailable}
          onValueChange={onToggleOpen}
          trackColor={{ false: colors.orange.bgLight, true: colors.orange.brand }}
        />
      </View>
      <TouchableOpacity style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveButtonText}>บันทึกการแก้ไข</Text>
      </TouchableOpacity>
      <Text style={styles.saveNote}>การเปลี่ยนราคามีผลกับบิลที่เปิดใหม่เท่านั้น</Text>
    </View>
  );
}

// modal เพิ่มเมนูใหม่
function AddMenuModal({ visible, name, onChangeName, priceBaht, onChangePrice, categoryName, onOpenCategoryPicker, onCancel, onCreate }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.addModalCard}>
          <Text style={styles.editTitle}>เพิ่มเมนูใหม่</Text>
          <Text style={styles.fieldLabel}>ชื่อเมนู</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={onChangeName}
            placeholder="เช่น ผัดกะเพราหมูสับ"
            placeholderTextColor={colors.text.placeholder}
          />
          <View style={styles.fieldRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.fieldLabel}>ราคา (บาท)</Text>
              <TextInput
                style={styles.textInput}
                value={priceBaht}
                keyboardType="numeric"
                onChangeText={(text) => onChangePrice(text.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.text.placeholder}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>หมวด</Text>
              <TouchableOpacity style={styles.categoryPicker} onPress={onOpenCategoryPicker}>
                <Text style={styles.categoryPickerText}>{categoryName} ⌄</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.addModalButtonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButtonSmall} onPress={onCreate}>
              <Text style={styles.saveButtonText}>เพิ่มเมนู</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// หน้าจอหลัก
// ---------------------------------------------------------------------------

export default function MenuSettingsScreen({ navigation }) {
  const db = useSQLiteContext();
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(null); // null = ทั้งหมด
  const [options, setOptions] = useState([]);

  // ฟอร์มแก้ไขเมนูที่เลือก (แยกจาก list จนกว่าจะกด "บันทึกการแก้ไข")
  const [editName, setEditName] = useState('');
  const [editPriceBaht, setEditPriceBaht] = useState('');
  const [editCategoryId, setEditCategoryId] = useState(null);

  // ฟอร์มเพิ่มเมนูใหม่
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPriceBaht, setAddPriceBaht] = useState('');
  const [addCategoryId, setAddCategoryId] = useState(null);
  // modal เลือกหมวดหมู่ใช้ร่วมกัน — 'edit' | 'add' | null บอกว่ากำลังเลือกให้ฟอร์มไหน
  const [pickerTarget, setPickerTarget] = useState(null);

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
  }, [db]);

  useEffect(() => { loadData(); }, [loadData]);

  // โหลดตัวเลือกย่อย + เติมฟอร์มแก้ไข ทุกครั้งที่เปลี่ยนรายการที่เลือก
  useEffect(() => {
    if (!selectedItem) return;
    setEditName(selectedItem.name);
    setEditPriceBaht(String(satangToBaht(selectedItem.priceSatang)));
    setEditCategoryId(selectedItem.categoryId);
    getMenuOptionsByItem(db, selectedItem.id).then(setOptions);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // กรองตามคำค้นหา + หมวดหมู่ที่เลือก
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
    setOptions(await getMenuOptionsByItem(db, selectedItem.id));
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

  // เลือกหมวดจาก modal กลาง แล้วส่งค่าไปให้ฟอร์มที่กำลังเปิดอยู่ (edit หรือ add)
  function handlePickCategory(categoryId) {
    if (pickerTarget === 'edit') setEditCategoryId(categoryId);
    if (pickerTarget === 'add') setAddCategoryId(categoryId);
    setPickerTarget(null);
  }
  const selectedCategoryName = categories.find((c) => c.id === editCategoryId)?.name ?? '';
  const addCategoryName = categories.find((c) => c.id === addCategoryId)?.name ?? 'เลือกหมวด';

  return (
    <View style={styles.screen}>
      {/* ---- คอลัมน์ซ้าย: sidebar ---- */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeaderRow}>
          <View>
            <Text style={styles.sidebarTitle}>ตั้งค่าร้าน</Text>
            <Text style={styles.sidebarSubtitle}>ผู้จัดการ · ป้าน้อย</Text>
          </View>
          <Pressable style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>
        <View style={{ height: 20 }} />
        {SIDEBAR_ITEMS.map((label, idx) => (
          <SidebarItem
            key={label}
            label={label}
            active={idx === 0}
            onPress={idx === 1 ? () => navigation.navigate(SUMMARY_ROUTE) : undefined}
          />
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
        {/* ---- แถบชิปหมวดหมู่ ---- */}
        <View style={styles.categoryChipsRow}>
          <CategoryChip label="ทั้งหมด" active={activeCategoryId === null} onPress={() => setActiveCategoryId(null)} />
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
          ListEmptyComponent={<Text style={styles.emptyText}>ไม่มีเมนูในหมวดนี้</Text>}
        />
      </View>

      {/* ---- คอลัมน์ขวา: แก้ไขเมนู ---- */}
      {selectedItem && (
        <EditPanel
          item={selectedItem}
          options={options}
          name={editName}
          onChangeName={setEditName}
          priceBaht={editPriceBaht}
          onChangePrice={setEditPriceBaht}
          categoryName={selectedCategoryName}
          onOpenCategoryPicker={() => setPickerTarget('edit')}
          onAddOption={handleAddOption}
          onToggleOpen={() => handleToggleOpen(selectedItem)}
          onSave={handleSave}
        />
      )}

      <CategoryPickerModal
        visible={pickerTarget !== null}
        categories={categories}
        onSelect={handlePickCategory}
        onClose={() => setPickerTarget(null)}
      />

      <AddMenuModal
        visible={addModalOpen}
        name={addName}
        onChangeName={setAddName}
        priceBaht={addPriceBaht}
        onChangePrice={setAddPriceBaht}
        categoryName={addCategoryName}
        onOpenCategoryPicker={() => setPickerTarget('add')}
        onCancel={() => setAddModalOpen(false)}
        onCreate={handleCreateItem}
      />
    </View>
  );
}

const rightCell = (width) => ({ width, fontSize: 12, color: colors.text.label, textAlign: 'right' });
const rowText = (size, color, weight) => ({ fontSize: size, color, ...(weight ? { fontWeight: weight } : {}) });

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.core.screenBg },
  // ---- Sidebar ----
  sidebar: { width: 220, padding: 20, borderRightWidth: 1, borderRightColor: border },
  sidebarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sidebarTitle: rowText(20, colors.core.darkGreen, 'bold'),
  sidebarSubtitle: { fontSize: 12, color: colors.text.label, marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface.sidebarCard, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 20, color: colors.text.description },
  sidebarItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sidebarItemActive: { backgroundColor: colors.core.darkGreen },
  sidebarItemText: { fontSize: 14, color: colors.core.darkGreen },
  sidebarItemTextActive: { color: colors.core.screenBg, fontWeight: 'bold' },
  // ---- Menu column ----
  menuColumn: { flex: 1, padding: 20, borderRightWidth: 1, borderRightColor: border },
  searchRow: { flexDirection: 'row', marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: colors.surface.searchChip, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, fontSize: 13, color: colors.core.darkGreen },
  addButton: { backgroundColor: colors.core.brandGreen, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addButtonText: rowText(13, colors.core.screenBg, 'bold'),
  // ---- Category chips ----
  categoryChipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  categoryChip: { backgroundColor: colors.surface.searchChip, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginRight: 8, marginBottom: 8 },
  categoryChipActive: { backgroundColor: colors.core.brandGreen },
  categoryChipText: { fontSize: 12, color: colors.text.secondary },
  categoryChipTextActive: { color: colors.core.screenBg, fontWeight: 'bold' },
  // ---- Menu list header + rows ----
  menuHeaderRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8 },
  menuHeaderText: { fontSize: 12, color: colors.text.label },
  menuHeaderTextPrice: rightCell(70),
  menuHeaderTextSold: rightCell(70),
  menuHeaderTextStatus: rightCell(110),
  menuRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface.sidebarCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: border },
  menuRowSelected: { borderColor: colors.core.brandGreen, borderWidth: 2 },
  menuRowName: { flex: 1 },
  menuRowTitle: rowText(14, colors.core.darkGreen, 'bold'),
  menuRowSubtitle: { fontSize: 11, color: colors.text.label, marginTop: 2 },
  menuRowPrice: { width: 70, fontSize: 14, fontWeight: 'bold', color: colors.core.darkGreen, textAlign: 'right' },
  menuRowSold: { width: 70, fontSize: 13, color: colors.text.label, textAlign: 'right' },
  menuRowStatus: { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  statusOpen: { fontSize: 12, color: colors.text.label, marginRight: 6 },
  statusClosed: { fontSize: 12, color: colors.orange.textDark, marginRight: 6 },
  emptyText: { fontSize: 13, color: colors.text.label, textAlign: 'center', marginTop: 20 },
  // ---- Edit panel ----
  editPanel: { width: 340, padding: 20, backgroundColor: colors.surface.cartPanel },
  editTitle: rowText(18, colors.core.darkGreen, 'bold'),
  editSubtitle: { fontSize: 13, color: colors.text.label, marginTop: 2, marginBottom: 18 },
  fieldLabel: { fontSize: 12, color: colors.text.label, marginBottom: 6, marginTop: 12 },
  textInput: { borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.core.darkGreen },
  fieldRow: { flexDirection: 'row' },
  categoryPicker: { borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  categoryPickerText: { fontSize: 14, color: colors.core.darkGreen },
  addonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  addonLabel: { fontSize: 13, color: colors.core.darkGreen },
  addonPrice: rowText(13, colors.core.darkGreen, 'bold'),
  addAddonButton: { borderWidth: 1, borderColor: border, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 16 },
  addAddonText: { fontSize: 13, color: colors.text.label },
  disableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.orange.bgLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20 },
  disableLabel: rowText(13, colors.orange.textDark, 'bold'),
  saveButton: { backgroundColor: colors.core.darkGreen, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveButtonSmall: { flex: 1, backgroundColor: colors.core.darkGreen, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginLeft: 8 },
  saveButtonText: rowText(14, colors.core.screenBg, 'bold'),
  saveNote: { fontSize: 11, color: colors.text.label, textAlign: 'center', marginTop: 10 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: rowText(14, colors.text.secondary, 'bold'),
  // ---- Category picker + add menu modals ----
  modalOverlay: { flex: 1, backgroundColor: withAlpha(colors.core.darkGreen, 0.35), justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: 260, backgroundColor: colors.core.screenBg, borderRadius: 14, paddingVertical: 8 },
  modalRow: { paddingVertical: 12, paddingHorizontal: 18 },
  modalRowText: { fontSize: 14, color: colors.core.darkGreen },
  addModalCard: { width: 360, backgroundColor: colors.core.screenBg, borderRadius: 16, padding: 20 },
  addModalButtonRow: { flexDirection: 'row', marginTop: 20 },
});