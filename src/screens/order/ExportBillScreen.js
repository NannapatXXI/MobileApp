import { View, Text, StyleSheet, TextInput, Switch, Pressable, ScrollView, Alert } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import { captureRef } from 'react-native-view-shot';
import { File, Paths } from 'expo-file-system';
import { getBillWithRounds } from '../../db/db';
import { billToOrders, calcBillTotals, toThaiTime } from '../../utils/bill';

const FORMAT_OPTIONS = [
  { id: 'pdf_a5', label: 'PDF A5 (ใบเสร็จเต็ม)', size: '~120 KB' },
  { id: 'pdf_slip', label: 'PDF สลิป 80 มม.', size: '~60 KB' },
  { id: 'png', label: 'รูปภาพ PNG', size: '~340 KB' },
];

function Row({ label, value, bold, labelStyle }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={[styles.rowText, bold && styles.rowBold, labelStyle]}>{label}</Text>
      <Text style={[styles.rowText, bold && styles.rowBold]}>{value}</Text>
    </View>
  );
}

// สร้างหน้าใบเสร็จเป็น HTML เพื่อให้ expo-print แปลงเป็น PDF
function buildReceiptHtml({ bill, orders, subtotal, service, vat, total, fullTax }) {
  const title = fullTax ? 'ใบกำกับภาษีเต็มรูป' : 'ใบเสร็จรับเงิน';

  let rows = '';
  for (const round of orders) {
    rows += `<tr><td colspan="2" class="round">ROUND ${round.round} · ${round.sentTime}</td></tr>`;
    for (const item of round.items) {
      rows += `<tr><td>${item.name} ×${item.qty}</td><td class="right">${item.price * item.qty}</td></tr>`;
    }
  }

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: sans-serif; padding: 16px; font-size: 12px; }
          h1 { text-align: center; font-size: 18px; margin: 0; }
          .center { text-align: center; color: #666; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 3px 0; }
          .right { text-align: right; }
          .round { color: #888; padding-top: 8px; }
          .total td { font-weight: bold; font-size: 15px; border-top: 1px solid #333; padding-top: 8px; }
          hr { border: none; border-top: 1px dashed #ccc; }
        </style>
      </head>
      <body>
        <h1>ครัวป้าน้อย</h1>
        <p class="center">${title}<br/>123 ถ.นิมมานเหมินท์ เชียงใหม่<br/>TAX ID 0505561000000</p>
        <hr/>
        <table>
          <tr><td>BILL</td><td class="right">#${bill.bill_id}</td></tr>
          <tr><td>TABLE</td><td class="right">T${bill.table_number}</td></tr>
        </table>
        <hr/>
        <table>${rows}</table>
        <hr/>
        <table>
          <tr><td>SUBTOTAL</td><td class="right">${subtotal.toLocaleString()}</td></tr>
          <tr><td>SERVICE 10%</td><td class="right">${service.toLocaleString()}</td></tr>
          <tr><td>VAT 7%</td><td class="right">${vat.toLocaleString()}</td></tr>
          <tr class="total"><td>TOTAL</td><td class="right">฿${total.toLocaleString()}</td></tr>
        </table>
        <p class="center">ขอบคุณที่มาทานค่ะ</p>
      </body>
    </html>
  `;
}

export default function ExportBillScreen({ route, navigation }) {
  const { billId } = route.params ?? {};
  const db = useSQLiteContext();
  const [bill, setBill] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('pdf_a5');
  const [email, setEmail] = useState('');
  const [fullTax, setFullTax] = useState(false);
  const receiptRef = useRef(null); // ใช้ถ่ายภาพใบเสร็จตอนเลือก PNG

  useEffect(() => {
    if (!billId) return;
    getBillWithRounds(db, billId).then(setBill);
  }, [db, billId]);

  const orders = billToOrders(bill);
  const { subtotal, service, vat, total } = calcBillTotals(orders);
  const billDate = bill?.opened_at?.slice(0, 10) ?? '-';

  // 1) สร้างไฟล์ PDF -> คืนค่า uri ของไฟล์ชั่วคราว
  async function makePdf() {
    // ขนาดกระดาษเป็นหน่วย point (1 นิ้ว = 72 point)
    // A5 = 420 x 595, สลิป 80 มม. กว้าง 227
    const size = selectedFormat === 'pdf_slip'
      ? { width: 227, height: 800 }
      : { width: 420, height: 595 };

    const html = buildReceiptHtml({ bill, orders, subtotal, service, vat, total, fullTax });
    const { uri } = await Print.printToFileAsync({ html, ...size });
    return uri;
  }

  // 2) ถ่ายภาพใบเสร็จบนจอเป็น PNG -> คืนค่า uri ของไฟล์ชั่วคราว
  async function makePng() {
    return captureRef(receiptRef, { format: 'png', quality: 1 });
  }

  // 3) ย้ายไฟล์ชั่วคราวมาไว้ในโฟลเดอร์ของแอป แล้วตั้งชื่อใหม่
  //    (ถ้าแชร์ไฟล์ชั่วคราวตรงๆ Android ไม่ยอมให้อ่าน)
  function saveToAppFolder(tempUri, fileName) {
    const file = new File(Paths.document, fileName);
    if (file.exists) file.delete();
    new File(tempUri).copy(file);
    return file.uri;
  }

  async function handleExport() {
    if (!bill) return;

    const isPng = selectedFormat === 'png';
    const fileName = `bill-${bill.bill_id}.${isPng ? 'png' : 'pdf'}`;
    const mimeType = isPng ? 'image/png' : 'application/pdf';

    try {
      const tempUri = isPng ? await makePng() : await makePdf();
      const fileUri = saveToAppFolder(tempUri, fileName);

      // มีอีเมล -> เปิดหน้าส่งเมลพร้อมแนบไฟล์, ไม่มีอีเมล -> เปิดเมนูแชร์
      if (email.trim() !== '') {
        const canSendMail = await MailComposer.isAvailableAsync();
        if (!canSendMail) {
          Alert.alert('ส่งอีเมลไม่ได้', 'เครื่องนี้ยังไม่ได้ตั้งค่าแอปอีเมล');
          return;
        }
        await MailComposer.composeAsync({
          recipients: [email.trim()],
          subject: `ใบเสร็จ ครัว 4 สหาย บิล #${bill.bill_id}`,
          body: 'ขอบคุณที่มาทานครับ ใบเสร็จแนบมากับอีเมลนี้',
          attachments: [fileUri],
        });
      } else {
        await Sharing.shareAsync(fileUri, { mimeType });
      }
    } catch (e) {
      Alert.alert('สร้างไฟล์ไม่สำเร็จ', e.message);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.row}>

        {/* ใบเสร็จ */}
        <View style={styles.receipt} ref={receiptRef} collapsable={false}>
          <Text style={styles.shopName}>ครัวป้าน้อย</Text>
          <Text style={styles.shopSub}>123 ถ.นิมมานเหมินท์ เชียงใหม่</Text>
          <Text style={styles.shopSub}>TAX ID 0505561000000</Text>

          <View style={styles.dividerDash} />

          <Row label="BILL" value={`#${billId}`} />
          <Row label="TABLE" value={`T${bill?.table_number ?? '-'}`} />
          <Row label={billDate} value={`เปิด ${toThaiTime(bill?.opened_at)}`} />

          <View style={styles.dividerDash} />

          {orders.map((round) => (
            <View key={round.round}>
              <Row
                label={`ROUND ${round.round}`}
                value={round.sentTime}
                labelStyle={styles.roundLabel}
              />
              {round.items.map((item) => (
                <Row
                  key={item.id}
                  label={`${item.name}  ×${item.qty}`}
                  value={(item.price * item.qty).toString()}
                />
              ))}
              <View style={{ height: 8 }} />
            </View>
          ))}

          <View style={styles.dividerDash} />

          <Row label="SUBTOTAL" value={subtotal.toLocaleString()} />
          <Row label="SERVICE 10%" value={service.toString()} />
          <Row label="VAT 7%" value={vat.toString()} />

          <View style={styles.dividerSolid} />

          <Row label="TOTAL" value={`฿${total.toLocaleString()}`} bold />

          <View style={{ height: 32 }} />
          <Text style={styles.footer}>ขอบคุณที่มาทานค่ะ</Text>
          <Text style={styles.footer}>ใบเสร็จนี้ออกจากระบบอัตโนมัติ</Text>
        </View>

        {/* Export panel */}
        <View style={styles.exportPanel}>
          <Text style={styles.exportTitle}>บันทึกใบเสร็จ</Text>
          <Text style={styles.exportSub}>เลือกรูปแบบไฟล์ ระบบจะสร้างไฟล์ให้ดาวน์โหลดหรือส่งเข้าอีเมล</Text>

          <View style={{ gap: 12, marginTop: 20 }}>
            {FORMAT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => setSelectedFormat(opt.id)}
                style={[styles.formatOption, selectedFormat === opt.id && styles.formatOptionSelected]}
              >
                <View style={[styles.radio, selectedFormat === opt.id && styles.radioSelected]}>
                  {selectedFormat === opt.id && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.formatLabel, selectedFormat === opt.id && { color: '#2D5A3D' }]}>
                  {opt.label}
                </Text>
                <Text style={styles.formatSize}>{opt.size}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>ส่งเข้าอีเมล (ถ้าต้องการ)</Text>
          <TextInput
            style={styles.input}
            placeholder="you@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <View style={[styles.formatOption, { marginTop: 12 }]}>
            <Text style={[styles.formatLabel, { flex: 1 }]}>ขอใบกำกับภาษีเต็มรูป</Text>
            <Switch
              value={fullTax}
              onValueChange={setFullTax}
              trackColor={{ true: '#2D5A3D' }}
            />
          </View>

          <Pressable style={styles.btnExport} onPress={handleExport}>
            <Text style={styles.btnText}>สร้างไฟล์ใบเสร็จ</Text>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()}>
                     <Text style={styles.backLink}>กลับไปหน้าสรุปบิล</Text>
          </Pressable>

        
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F0E9' },
  row: { flexDirection: 'row', padding: 24, gap: 24 },

  // Receipt
  receipt: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    padding: 24, alignSelf: 'flex-start',
  },
  shopName: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  shopSub: { fontSize: 13, color: '#666', textAlign: 'center' },
  dividerDash: {
    borderBottomWidth: 1, borderBottomColor: '#ccc',
    borderStyle: 'dashed', marginVertical: 12,
  },
  dividerSolid: { borderBottomWidth: 1, borderBottomColor: '#333', marginVertical: 12 },
  rowText: { fontSize: 14, color: '#333' },
  rowBold: { fontWeight: 'bold', fontSize: 16 },
  roundLabel: { color: '#888', fontSize: 12, letterSpacing: 1 },
  footer: { fontSize: 12, color: '#aaa', textAlign: 'center' },

  // Export panel
  exportPanel: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    padding: 24, alignSelf: 'flex-start',
  },
  exportTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  exportSub: { fontSize: 14, color: '#666' },
  sectionLabel: { fontSize: 15, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  formatOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#E0EDE4', borderRadius: 12, padding: 16,
  },
  formatOptionSelected: { borderColor: '#2D5A3D', backgroundColor: '#F0F7F2' },
  formatLabel: { flex: 1, fontSize: 16 },
  formatSize: { fontSize: 13, color: '#999' },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: '#2D5A3D' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2D5A3D' },
  input: {
    borderWidth: 1, borderColor: '#E0EDE4', borderRadius: 10,
    padding: 14, fontSize: 15,
  },
  btnExport: {
    backgroundColor: '#1C2E23', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 20,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  backLink: { textAlign: 'center', marginTop: 16, color: '#666', fontSize: 14 },
});