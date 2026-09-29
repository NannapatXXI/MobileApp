import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getBillWithRounds } from '../../db/db';
import { toThaiTime } from '../../utils/bill';
import OrderInRound from '../../component/BillOrderStatus';

// ยอดเงินของ 1 รอบ (หน่วยสตางค์)
// unit_price_satang รวมราคา option มาแล้วตอนเพิ่มลงตะกร้า จึงคูณจำนวนได้เลย
function roundTotal(round) {
  let sum = 0;
  for (const item of round.items) {
    sum += item.unit_price_satang * item.quantity;
  }
  return sum;
}

export default function PreSendToKitchen({ route, navigation }) {
  const { billId, tableId } = route.params ?? {};
  const db = useSQLiteContext();
  const [bill, setBill] = useState(null);
  const [selectedRoundId, setSelectedRoundId] = useState(null);

  useEffect(() => {
    if (!billId) return;
    getBillWithRounds(db, billId).then((data) => {
      setBill(data);
      // เลือกรอบล่าสุด (รอบที่เพิ่งส่ง) เป็นค่าเริ่มต้น
      if (data?.rounds?.length > 0) {
        const lastRound = data.rounds[data.rounds.length - 1];
        setSelectedRoundId(lastRound.round_id);
      }
    });
  }, [db, billId]);

  const rounds = bill?.rounds ?? [];
  const selectedRound = rounds.find((r) => r.round_id === selectedRoundId);

  // ถ้าเลือกรอบไว้ แสดงแค่รอบนั้น, ถ้าไม่ได้เลือก แสดงทุกรอบ
  const filteredBill = bill && selectedRoundId
    ? { ...bill, rounds: rounds.filter((r) => r.round_id === selectedRoundId) }
    : bill;

  // ยอดรวมทุกรอบของบิลนี้
  let billTotal = 0;
  for (const round of rounds) {
    billTotal += roundTotal(round);
  }

  return (
    <View style={styles.content}>
      <View style={styles.Toplayer}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ padding: 12 }}>
            <Text style={styles.Icon}>✔️</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.HeaderText}>ส่งเข้าครัวแล้ว</Text>
            <Text style={styles.infoText}>
              รอบที่ : {selectedRound?.round_number ?? '-'}    ส่ง: {toThaiTime(selectedRound?.ordered_at)}  โต๊ะ: {bill?.table_number ?? '-'}  บิล: {bill?.bill_id ?? '-'}
            </Text>
          </View>
        </View>

        <View style={{ paddingRight: 10, alignItems: 'flex-end' }}>
          <Text style={styles.infoText}>ยอดบิลสะสม</Text>
          <Text style={styles.HeaderText}>{(billTotal / 100).toFixed(0)} บาท</Text>
        </View>
      </View>

      <View style={styles.MidContent}>
        <View style={styles.Toplayer}>
          <View style={styles.Box2}>
            <Text style={styles.midText}>สถานะรายการ</Text>
          </View>
          <View style={styles.Box3}>
            <View style={{ paddingLeft: 20 }}>
              <Text style={styles.midText}>รอบที่สั่งไปแล้ว</Text>
            </View>
          </View>
        </View>

        <View style={styles.TopLayerHeader}>
          <View style={styles.Box2}>
            <OrderInRound bill={filteredBill} />
          </View>

          <View style={styles.Box3}>
            <ScrollView style={{ height: 350 }}>
              <View style={{ padding: 10 }}>
                {rounds.map((round) => {
                  const isSelected = selectedRoundId === round.round_id;
                  const textColor = isSelected ? '#2F6B4F' : '#000';
                  return (
                    <View key={round.round_id} style={styles.Box5}>
                      <Pressable
                        onPress={() => setSelectedRoundId(isSelected ? null : round.round_id)}
                        style={{
                          backgroundColor: isSelected ? '#E4F0E7' : '#fff',
                          padding: 16, borderRadius: 12, gap: 12, flex: 1,
                          borderWidth: 2,
                          borderColor: isSelected ? '#2F6B4F' : '#E0EDE4',
                        }}
                      >
                        <Text style={{ fontWeight: 'bold', fontSize: 18, color: textColor }}>
                          รอบที่ {round.round_number}  เวลา: {toThaiTime(round.ordered_at)}
                        </Text>
                        <Text style={{ color: textColor }}>
                          {round.items.length} รายการ
                        </Text>
                        <Text style={{ fontWeight: 'bold', fontSize: 18, color: textColor }}>
                          {(roundTotal(round) / 100).toFixed(0)} บาท
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>

      <View style={styles.Bottonlayyer}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 20 }}>
          <Pressable
            style={{ flex: 4, backgroundColor: '#16281F', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => navigation.navigate('MenuScreen', { billId, tableId })}
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>ส่งเพิ่ม(เปิดรอบที่ {rounds.length + 1} )</Text>
          </Pressable>
          <Pressable
            style={{ flex: 3, backgroundColor: '#FFF', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E0EDE4' }}
            onPress={() => navigation.navigate('Detail', { billId, tableId })}
          >
            <Text style={{ color: '#2F6B4F', fontWeight: 'bold', fontSize: 16 }}>ดูสรุปบิล</Text>
          </Pressable>
          <Pressable
            style={{ flex: 3, backgroundColor: '#FFF', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E0EDE4' }}
          >
            <Text style={{ color: '#2F6B4F', fontWeight: 'bold', fontSize: 16 }}>เรียกพนักงาน</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  Toplayer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingRight: 20,
    paddingTop: 30,
  },
  HeaderText: {
    fontSize: 25,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 18,
    color: '#57685C',
  },
  Icon: {
    fontSize: 20,
    borderWidth: 1,
    borderColor: '#E4F0E7',
    backgroundColor: '#E4F0E7',
    padding: 20,
    borderRadius: 40,
  },
  infoBox: {
    paddingTop: 10,
  },
  MidContent: {
    flex: 1,
  },
  Box2: {
    flex: 7,
  },
  Box3: {
    flex: 3,
  },
  midText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  TopLayerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flex: 1,
  },
  Box5: {
    marginBottom: 10,
    borderRadius: 16,
    padding: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  Bottonlayyer: {
    minHeight: 70,
    margin: 10,
  },
});
