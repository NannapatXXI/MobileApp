import { View, Text, FlatList, StyleSheet } from 'react-native';

const STATUS_STYLE = {
  'pending':   { bg: '#FDF3EC', text: '#B0632F', label: 'รอทำ' },
  'cooking':   { bg: '#FEF9EC', text: '#B08A2F', label: 'กำลังทำ' },
  'served':    { bg: '#E4F0E7', text: '#3D7A52', label: 'เสิร์ฟแล้ว' },
  'cancelled': { bg: '#F5F5F5', text: '#757575', label: 'ยกเลิก' },
};

const BillOrderStatus = ({ bill }) => {
  if (!bill || !bill.rounds) return <Text>กำลังโหลด...</Text>;

  // รวมรายการของทุกรอบเป็น list เดียว แล้วใช้ FlatList ตัวเดียว
  const items = bill.rounds.flatMap((round) => round.items);

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.order_item_id.toString()}
      style={{ flex: 1 }}
      renderItem={({ item }) => {
        const s = STATUS_STYLE[item.status] ?? STATUS_STYLE['pending'];
        const optionNames = item.options.map((o) => o.option_name_snapshot).join(', ');
        return (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={styles.qty}>{item.quantity}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {item.name}
                  {optionNames ? ` (${optionNames})` : ''}
                </Text>
                {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: s.bg }]}>
              <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
            </View>
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0EDE4',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  qty: {
    fontSize: 16,
    color: '#42544A',
    marginRight: 12,
    minWidth: 30,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  note: {
    color: '#B0632F',
    marginTop: 4,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default BillOrderStatus;