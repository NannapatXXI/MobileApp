import { View ,Text,ScrollView,StyleSheet,Dimensions,Pressable} from 'react-native';
import { useState,useEffect,useMemo } from 'react';
import { getBillWithRounds } from '../../db/db';
import { useSQLiteContext } from "expo-sqlite";
import OrderInRound from '../../component/BillOrderStatus';


export default function HomeScreen({ navigation }) {
  const roundBill = 1;
  const status = 'รอทำ'
  const db = useSQLiteContext();
  const [bill, setBill] = useState(null);
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const selectedRound = bill?.rounds?.find(r => r.round_id === selectedRoundId);
  const filteredBill = bill
  ? (selectedRoundId
      ? { ...bill, rounds: bill.rounds.filter(r => r.round_id === selectedRoundId) }
      : bill)
  : null;
  const [selected, setSelected] = useState(false);

  const totalAllSatang = useMemo(() => {
    if (!bill?.rounds) return 0;
    return bill.rounds.reduce((sum, round) => {
      return sum + round.items.reduce((s, item) => {
        const optionTotal = item.options?.reduce((o, opt) => o + opt.price_delta_satang_snapshot, 0) ?? 0;
        return s + (item.unit_price_satang + optionTotal) * item.quantity;
      }, 0);
    }, 0);
  }, [bill]);

  const statusStyle = {
    'รอทำ':      { bg: '#FDF3EC', text: '#B0632F' },
    'กำลังทำ':   { bg: '#E4F0E7', text: '#57685C' },
    'เสิร์ฟแล้ว': { bg: '#E4F0E7', text: '#3D7A52' },
  };
  const styleStatus = statusStyle[status] ?? { bg: '#F5F5F5', text: '#757575' };

  
  useEffect(() => {
    if (!db) return;
    async function load() {
      try {
        const data = await getBillWithRounds(db, 1);
        setBill(data);
        // เซ็ต round แรกเป็น default
        if (data?.rounds?.length > 0) {
          setSelectedRoundId(data.rounds[0].round_id);
        }
      } catch (e) {
        console.log('db error:', e.message);
      }
    }
    load();
  }, [db]);

  // TODO: ยังไม่ทำระบบ PIN ตอนนี้ — แค่ทำให้กดได้ก่อน
  function handleStaffPress() {
    console.log('กดปุ่มพนักงานแล้ว');
  }

  return (
    <View style={styles.content}> 

      {/* ---- ปุ่มสำหรับพนักงาน มุมขวาบน (ยังไม่มี PIN / ยังไม่ navigate ไปไหน) ---- */}
      <Pressable
        style={({ pressed }) => [styles.staffBadge, pressed && styles.staffBadgePressed]}
        onPress={handleStaffPress}
      >
        <Text style={styles.staffBadgeText}>สำหรับพนักงาน</Text>
      </Pressable>

      <View >
        <View style={styles.Toplayer}>
            <View  style={{flexDirection: 'row'}} >
              <View style={{padding:12 }}>
                  <Text style={styles.Icon} >✔️</Text>
              </View>
              
              <View style={styles.infoBox}>
                <View>
                  <Text style= {styles.HeaderText}>ส่งเข้าครัวแล้ว</Text>
                </View>
                <View>
                <Text style={styles.infoText}>
                    รอบที่ : {selectedRound?.round_number ?? '-'}    
                    ส่ง: {selectedRound?.ordered_at?.slice(11, 16) ?? '-'}  
                    โต้ะ: {bill?.table_number ?? '-'}  
                    บิล: {bill?.bill_id ?? '-'}
                  
                  </Text>
                </View>
              </View>
            </View>
          <View style={{paddingRight:10,alignItems:'flex-end'}}>
            <View>
              <Text style= {styles.infoText}>ยอดบิลสะสม</Text>
            </View>
            <View>
                  <Text style={styles.HeaderText}>{(totalAllSatang / 100).toFixed(0)} บาท</Text>
            </View>    
          </View>
        </View>
      </View>
      <View style={styles.MidContent}>
        <View style={styles.Toplayer} >
              <View style={styles.Box2} >
                   <Text style={styles.midText} >สถานะรายการ</Text>
              </View>
              <View style={styles.Box3} >
                <View style={{paddingLeft:20}}>
                    <Text style={styles.midText}>รอบที่สั่งไปแล้ว</Text>
                </View>
                 
              </View>
         
      
        </View>
            
          <View  style={styles.TopLayerHeader}>
            <View style={styles.Box2} >
           
          
                <OrderInRound bill={filteredBill} styleStatus={styleStatus}/>
          


            </View>

            
            <View style={styles.Box3} >
                 
                  <ScrollView style={{ height: 350 }}>
                    <View style={{ padding: 10 }}>
                      {/* ปุ่ม "ทุกรอบ" */}
                      
                       {/* วนรอบจริงจาก DB */}
                      {(bill?.rounds ?? []).map(round => { 
                        const isSelected = selectedRoundId === round.round_id;
                        const total = round.items?.reduce((sum, i) => {
                          const optionTotal = i.options?.reduce((o, opt) => o + opt.price_delta_satang_snapshot, 0) ?? 0;
                          return sum + (i.unit_price_satang + optionTotal) * i.quantity;
                        }, 0) ?? 0;
                        return (
                          <View key={round.round_id} style={styles.Box5}>
                            <Pressable
                              onPress={() =>{setSelectedRoundId(isSelected ? null : round.round_id); console.log('bill ที่เลือก:', JSON.stringify(filteredBill, null, 2));  }}
                              style={{
                                backgroundColor: isSelected ? '#E4F0E7' : '#fff',
                                padding: 16, borderRadius: 12, gap: 12, flex: 1,
                                borderWidth: 2,
                                borderColor: isSelected ? '#2F6B4F' : '#E0EDE4',
                              }}
                            >
                              <Text style={{ fontWeight: 'bold', fontSize: 18,
                                color: isSelected ? '#2F6B4F' : '#000' }}>
                                รอบที่ {round.round_number}  เวลา: {round.ordered_at?.slice(11, 16)}
                              </Text>
                              <Text style={{ color: isSelected ? '#2F6B4F' : '#000' }}>
                                {round.items?.length ?? 0} รายการ
                              </Text>
                              <Text style={{ fontWeight: 'bold', fontSize: 18,
                                color: isSelected ? '#2F6B4F' : '#000' }}>
                                {(total / 100).toFixed(0)} บาท
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
             <View style={{flex:1 ,flexDirection:'row',gap:20}}>
                    <Pressable style={{flex:4,backgroundColor:'#16281F',borderRadius:12, alignItems:'center',justifyContent:'center'}}>
                            <Text style={{color:'white',fontWeight:'bold',fontSize:16}} >ส่งเพิ่ม(เปิดรอบที่ {(bill?.rounds?.length ?? 0) + 1} )</Text>
                    </Pressable>
                    <Pressable style={{flex:3,backgroundColor:'#FFF',borderRadius:12, alignItems:'center',justifyContent:'center',  borderWidth:2, borderColor:  '#E0EDE4'} }  onPress={() => navigation.navigate('Detail' )}>
                            <Text style={{color:'#2F6B4F',fontWeight:'bold',fontSize:16}} >ดูสรุปบิล</Text>
                    </Pressable>
                    <Pressable style={{flex:3,backgroundColor:'#FFF',borderRadius:12, alignItems:'center',justifyContent:'center',  borderWidth:2, borderColor:  '#E0EDE4'}}>
                            <Text style={{color:'#2F6B4F',fontWeight:'bold',fontSize:16}} >เรียกพนักงาน</Text>
                    </Pressable>
             </View>
      </View>
    </View>
    

  );
}

export const styles = StyleSheet.create({
  content:{
    flex: 1,
    backgroundColor: '#fff',
  },
  Toplayer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingRight:20,
    paddingTop: 30,
   
  },
  HeaderText :{
    fontSize: 25,
    fontWeight: 'bold',
  },
  infoText:{
    fontSize: 18,
    color:"#57685C"
  },
  Icon:{
    fontSize : 20,
    borderWidth:1,
    borderColor:'#E4F0E7',
    backgroundColor:'#E4F0E7',
    padding:20,
    borderRadius:40
  },
  infoBox:{
      paddingTop: 10
  },
  MidContent:{
    flex: 1, 
  },
  Box2:{
   
    flex: 7,
   
  },
  Box3:{
   
   flex: 3

 },Toplayer2: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 8,
  flex: 1
 
},midText:{
  fontSize:18,
  fontWeight:'bold'
},Box4:{
  marginBottom:10,
  borderWidth:2,
  borderColor: '#E0EDE4',
  borderRadius: 16,
  padding: 5,
  flexDirection:'row',
  justifyContent: 'space-between',
  
},
amountItem:{
  color:'#42544A'
},
TopLayerHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  paddingHorizontal: 16,
  paddingVertical: 8,
    flex: 1,  
  
},Box5:{
  marginBottom:10,
  borderRadius: 16,
  padding: 5,
  flexDirection:'row',
  justifyContent: 'space-between',
  
},Bottonlayyer: {
  minHeight: 70,
 
  margin:10
},

  // ---- ปุ่มสำหรับพนักงาน (มุมขวาบน) — แค่กดได้ ยังไม่มี PIN / ยัง navigate ไปไหน ----
  staffBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: '#E4F0E7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  staffBadgePressed: {
    opacity: 0.7,
  },
  staffBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#42544A',
  },
});