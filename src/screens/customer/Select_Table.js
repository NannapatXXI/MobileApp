import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import colors, { alpha } from './style/colors';
import { getTablesWithStatus, openNewBill } from '../../db/queries_customer/tables';
import { getKitchenQueueCount } from '../../db/queries_customer/orders';
import { resetSalesData } from '../../db/db';

//ใช้การ render ตารางผ่าน scrollviwe ไม่ใช่การใช้ FlatList
// 133 คือ การดึงมาจาก db
// 134 คือ state จากเครื่องไม่เกี่ยวกับ db

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // ไทย = UTC+7 เสมอ ไม่มี DST

// คำนวณเวลาไทยตรงจาก UTC 
//ส่งกลับ getUTCxxx จะได้ไม่ให้เครื่องเอา โวนเวลาของเครื่องมาคิด
function getBangkokNow() {
  return new Date(Date.now() + BANGKOK_OFFSET_MS);
}

function formatThaiDate(bangkokDate) {
  const day = THAI_DAYS[bangkokDate.getUTCDay()];
  const month = THAI_MONTHS[bangkokDate.getUTCMonth()];
  const buddhistYear = bangkokDate.getUTCFullYear() + 543;
  const hours = bangkokDate.getUTCHours();
  const period = hours < 12 ? 'เช้า' : hours < 17 ? 'บ่าย' : 'เย็น';
  return `${day} ${bangkokDate.getUTCDate()} ${month} ${buddhistYear} · รอบ${period}`;
}


// เติม T + ' ให้ parser รู้ว่า string นี้คือ UTC ไม่ใช่ local time จะได้เวลาไทยตลอด
function formatBangkokHM(sqliteUtcString) {
  if (!sqliteUtcString) return '';
  const utcMs = Date.parse(sqliteUtcString.replace(' ', 'T') + 'Z');
  const bangkokDate = new Date(utcMs + BANGKOK_OFFSET_MS);
  const hh = String(bangkokDate.getUTCHours()).padStart(2, '0');
  const mm = String(bangkokDate.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}


// เปิดบิลแต่ไม่ได้สั่ง จะถือว่าไม่มีบิลค้างเด้ออ
function isTableBusy(t) {
  return t.bill_id != null && t.round_count > 0;
}

function LiveClock() {
  const [now, setNow] = useState(getBangkokNow());

  useEffect(() => {
    const id = setInterval(() => setNow(getBangkokNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');

  return (
    <View style={styles.clockBlock}>
      <Text style={styles.clockTime}>{hh}:{mm}</Text>
      <Text style={styles.clockDate}>{formatThaiDate(now)}</Text>
    </View>
  );
}

export default function SelectTable({ navigation }) {
  const db = useSQLiteContext();  // เอาไว้ไปดึงข้อมูลคำสั่ง query โต๊ะใน table.js
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [kitchenQueueCount, setKitchenQueueCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getTablesWithStatus(db).then(setTables);
      getKitchenQueueCount(db).then(setKitchenQueueCount);
    }, [db])
  );

  const selectedTable = tables.find((t) => t.table_id === selectedTableId);
  
  // busy คือต้องสั่งก่อนอย่าน้อย 1 ครั้งนะครับ ่ท่านผู้ชม 
  const canOpenNewBill = !!selectedTable && !isTableBusy(selectedTable);
  const canEnterExistingBill = !!selectedTable && isTableBusy(selectedTable);

  const availableCount = tables.filter((t) => !isTableBusy(t)).length;
  const busyCount = tables.filter((t) => isTableBusy(t)).length;

  async function handleOpenNewBill() {
    if (!canOpenNewBill) return;
    // ถ้าโต๊ะนี้มีบิลเปิดอยู่แล้ว (แค่ยังไม่สั่ง) ใช้บิลเดิมต่อ ไม่ insert ซ้ำ กันบิลซ้อนกัน
    const billId =
      selectedTable.bill_id ?? (await openNewBill(db, selectedTable.table_id));
    navigation.navigate('MenuScreen', { billId, tableId: selectedTable.table_id });
  }

  function handleEnterExistingBill() {
    if (!canEnterExistingBill) return;
    navigation.navigate('MenuScreen', {
      billId: selectedTable.bill_id,
      tableId: selectedTable.table_id,
    });
  }

  function handleResetData() {
    Alert.alert(
      'ล้างข้อมูลการขายทั้งหมด?',
      'บิล รอบการสั่ง และรายการที่สั่งไปทั้งหมดจะถูกลบกลับสู่สถานะเริ่มต้น (เมนู/หมวดหมู่/โต๊ะไม่หาย) แก้คืนไม่ได้',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ล้างข้อมูล',
          style: 'destructive',
          onPress: async () => {
            await resetSalesData(db);
            setSelectedTableId(null);
            getTablesWithStatus(db).then(setTables);
            getKitchenQueueCount(db).then(setKitchenQueueCount);
          },
        },
      ]
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.leftPanel}>
        <View>
          <Text style={styles.kicker}>KRUA PA NOI · TABLE UNIT</Text>
          <Text style={styles.greetingTitle}>สวัสดีครับ{'\n'}เริ่มสั่งได้เลย</Text>
          <Text style={styles.greetingSubtitle}>
            แตะหมายเลขโต๊ะที่คุณนั่งอยู่จากผังด้านขวา แล้วเปิดบิลใหม่หรือเข้าบิลที่ค้างอยู่
          </Text>
          <View style={{height:150}}>

          </View>

          <LiveClock />

          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>โต๊ะว่าง</Text>
              <Text style={styles.statValue}>{availableCount}</Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>มีบิลค้าง</Text>
              <Text style={styles.statValueOrange}>{busyCount}</Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>คิวครัว</Text>
              <Text style={styles.statValue}>{kitchenQueueCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.leftFooterRow}>
          <Pressable style={styles.resetButton} onPress={handleResetData}>
            <Text style={styles.resetButtonText}>ล้างข้อมูลการขาย</Text>
          </Pressable>

          <Pressable style={styles.staffButton} onPress={() => navigation.navigate('StaffScreen')}>
            <Text style={styles.staffButtonText}>สำหรับพนักงาน</Text>
          </Pressable>
        </View>

      </View>

      <View style={styles.rightPanel}>
        <View style={styles.rightHeaderRow}>
          <View>
            <Text style={styles.rightTitle}>เลือกโต๊ะของคุณ</Text>
            <Text style={styles.rightSubtitle}>โต๊ะสีส้มคือมีบิลอยู่ แตะเพื่อสั่งต่อในบิลเดิม</Text>
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendBadge}>
              <View style={styles.legendDotAvailable} />
              <Text style={styles.legendText}>ว่าง {availableCount}</Text>
            </View>
            <View style={styles.legendBadge}>
              <View style={styles.legendDotBusy} />
              <Text style={styles.legendText}>มีบิลค้าง {busyCount}</Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.gridScroll}>  
          <View style={styles.gridWrap}>
             {tables.map((t) => {
              const isBusy = isTableBusy(t);
              const isSelected = t.table_id === selectedTableId;

              return (
                <Pressable
                  key={t.table_id}
                  onPress={() => setSelectedTableId(t.table_id)}
                  style={[
                    styles.tableCard,
                    isBusy && styles.tableCardBusy,
                    isSelected && styles.tableCardSelected,
                  ]}
                >
                  <Text style={styles.tableNumber}>T{t.table_number}</Text>

                  {isSelected ? (
                    <Text style={styles.tableSelectedLabel}>เลือกอยู่</Text>
                  ) : isBusy ? (
                    <>
                      <Text style={styles.tableBusyAmount}>
                        ฿{(t.total_satang / 100).toLocaleString()}
                      </Text>
                      <Text style={styles.tableBusyRounds}>{t.round_count} รอบ</Text>
                      <Text style={styles.tableOpenedTime}>
                        เปิด {formatBangkokHM(t.opened_at)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.tableStatusText}>ว่าง · {t.seats} ที่นั่ง</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleOpenNewBill}
            disabled={!canOpenNewBill}
            style={[styles.primaryButton, !canOpenNewBill && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>
              {selectedTable ? `เปิดบิลใหม่ · โต๊ะ ${selectedTable.table_number}` : 'เปิดบิลใหม่'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleEnterExistingBill}
            disabled={!canEnterExistingBill}
            style={[styles.secondaryButton, !canEnterExistingBill && styles.secondaryButtonDisabled]}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                !canEnterExistingBill && styles.secondaryButtonTextDisabled,
              ]}
            >
              เข้าบิลที่ค้างอยู่
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  // Layout หลัก
  screen: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 4,
    backgroundColor: colors.core.darkGreen,
    padding: 32,
    justifyContent: 'space-between',
  },
  rightPanel: {
    flex: 6,
    backgroundColor: colors.core.screenBg,
    padding: 32,
  },
  title: {
    color: colors.core.screenBg,
    fontSize: 24,
    fontWeight: 'bold',
  },

  
  // ฝั่งซ้าย — หัวข้อร้าน / คำทักทาย
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: alpha.onDarkMax,
  },
  greetingTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 'bold',
    color: colors.core.screenBg,
    marginTop: 16,
  },
  greetingSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: alpha.onDarkMax,
    marginTop: 12,
  },

  
  // ฝั่งซ้าย — นาฬิกา / วันที่
  clockBlock: {
    marginTop: 32,
  },
  clockTime: {
    fontSize: 56,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  clockDate: {
    fontSize: 14,
    color: alpha.onDarkMax,
    marginTop: 4,
  },

  // ฝั่งซ้าย — เส้นแบ่ง / ตัวเลขสรุป 3 ช่อง
  divider: {
    height: 1,
    backgroundColor: alpha.onDarkMin,
    marginVertical: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statColumn: {
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 12,
    color: alpha.onDarkMax,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.core.screenBg,
    marginTop: 4,
  },
  statValueOrange: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.orange.numberOnDark,
    marginTop: 4,
  },

  // ฝั่งซ้าย — แถวปุ่มล่างสุดของแผง (ล้างข้อมูล + สำหรับพนักงาน)
  leftFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resetButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: alpha.onDarkMin,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: alpha.onDarkMax,
  },
  staffButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  staffButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.core.darkGreen,
  },

  // ฝั่งขวา — หัวข้อ + legend
  rightHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rightTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  rightSubtitle: {
    fontSize: 13,
    color: colors.text.description,
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
  },
  legendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface.sidebarCard,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  legendDotAvailable: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.muted5,
  },
  legendDotBusy: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange.brand,
  },
  legendText: {
    fontSize: 13,
    color: colors.text.secondary,
  },

  
  // ฝั่งขวา — กริดโต๊ะ
  gridScroll: {
    flex: 1,
    marginTop: 20,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  tableCard: {
    width: '23%',
    minHeight: 140,
    backgroundColor: colors.core.screenBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha.borderMin,
    padding: 16,
    justifyContent: 'space-between',
  },
  tableCardBusy: {
    backgroundColor: colors.orange.bgLight,
    borderColor: alpha.orangeHighlight35,
  },
  tableCardSelected: {
    backgroundColor: colors.surface.statusGreenBg,
    borderColor: colors.core.brandGreen,
    borderWidth: 2,
  },
  tableNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  tableStatusText: {
    fontSize: 13,
    color: colors.text.label,
    marginTop: 8,
  },
  tableBusyAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.orange.textDark,
  },
  tableBusyRounds: {
    fontSize: 13,
    color: colors.orange.textDark,
    marginTop: 2,
  },
  tableOpenedTime: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 6,
  },
  tableSelectedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.core.brandGreen,
  },

  // ฝั่งขวา — แถบปุ่มล่าง
  actionRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.core.darkGreen,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surface.switchOff,
  },
  primaryButtonText: {
    color: colors.core.screenBg,
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.core.screenBg,
    borderWidth: 1,
    borderColor: alpha.borderMax,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  secondaryButtonDisabled: {
    borderColor: alpha.borderMin,
  },
  secondaryButtonText: {
    color: colors.core.darkGreen,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonTextDisabled: {
    color: colors.text.placeholder,
  },
});
