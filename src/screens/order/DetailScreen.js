import { View ,Text,StyleSheet,Pressable} from 'react-native';
import { useState, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import BillOrder from '../../component/BillOrder';
import { getBillWithRounds } from '../../db/db';
import { billToOrders, calcBillTotals, toThaiTime } from '../../utils/bill';


export default function DetailScreen({ route, navigation }) {
  const { billId, tableId } = route.params ?? {};
  const db = useSQLiteContext();
  const [bill, setBill] = useState(null);

  useEffect(() => {
    if (!billId) return;
    getBillWithRounds(db, billId).then(setBill);
  }, [db, billId]);

  const orders = billToOrders(bill);
  const { subtotal, service, vat, total } = calcBillTotals(orders);
  const itemCount = orders.reduce((sum, r) => sum + r.items.length, 0);

    return (
      <View style={styles.content}>
       
          <View style={styles.boxLeft}>
           
           
            <View style={{paddingBottom:16}}>
              <Text style={{fontSize:24,paddingBottom:12, paddingTop:20,fontWeight:'bold'}}>สรุปบิล #{billId}</Text>
              <Text>โต๊ะ {bill?.table_number ?? '-'} · เปิด {toThaiTime(bill?.opened_at)} · {orders.length} รอบ · {itemCount} รายการ</Text>
            </View>
            <BillOrder orders={orders}/>
           
          </View>
          <View style={styles.boxRight}>

                <Text style={{fontSize:24,paddingBottom:12, paddingTop:20,fontWeight:'bold'}} >ยอดที่ต้องชำระ</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom:10}}>
                  <Text  style={{fontSize:18,color: '#42544A'}}>รวมค่าอาหาร</Text>
                  <Text  style={{fontSize:18,color: '#42544A',fontWeight:'bold'}}>฿{subtotal.toLocaleString()}</Text>
                </View>
               
                <View style={{flexDirection:'row', justifyContent: 'space-between', paddingBottom:10 }}>
                
                        <Text style={{fontSize:18,color: '#42544A'}}>ค่าบริการ 10%</Text>
                       <Text  style={{fontSize:18,color: '#42544A',fontWeight:'bold'}}>฿{service.toLocaleString()}</Text>
                  
                 
                   
                </View>
                <View style={{flexDirection:'row', justifyContent: 'space-between' , paddingBottom:10}}>
                       <Text  style={{fontSize:18,color: '#42544A'}}>ภาษีมูลค่าเพิ่ม 7% </Text>
                       <Text  style={{fontSize:18,color: '#42544A',fontWeight:'bold'}} >฿{vat.toLocaleString()}</Text>
                  
                </View>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E0EDE4', paddingTop:20 }}/>

                <View style={{flexDirection:'row', justifyContent: 'space-between', paddingTop:20 }}>
                  <Text style={{fontSize:24,fontWeight:'bold'}}>ยอดรวมทั้งบิล</Text>
                  <Text style={{fontSize:30,fontWeight:'bold'}} >฿{total.toLocaleString()}</Text>
                </View>


                <View  style={{borderWidth:1,borderColor:'#E0EDE4',borderRadius:20,backgroundColor:'#fff',marginTop:20}}>
                  <View style={{padding:30}}>
                    <Text style={{fontSize:14, fontWeight:'bold'}}>ชำระที่เคาน์เตอร์</Text>
                    <View style={{paddingTop:10}}>
                        <Text style={{fontSize:14,color: '#42544A'}}>แจ้งเลขบิล #{billId} ที่เคาน์เตอร์ พนักงานจะปิดบิลและออกใบเสร็จให้</Text>
                    </View>
                  </View>
                
                </View>
            <View style={{paddingTop:140}}>
                    <Pressable style={{borderRadius:20,backgroundColor:'#16281F',marginTop:20}}  onPress={() => navigation.navigate('Bill', { billId })} >
                      <View style={{justifyContent:'center',alignItems:'center',padding:30}}>
                            <Text style={{fontSize:20,fontWeight:'bold',color:'#fff'}}>พิมพ์ใบเสร็จเป็นไฟล์</Text>
                      </View>

                    </Pressable>
                    <Pressable style={{borderRadius:20,backgroundColor:'#FAFDF7',marginTop:20 ,borderColor:'#E0EDE4',borderWidth:1}} onPress={() => navigation.navigate('MenuScreen', { billId, tableId })}>
                      <View style={{justifyContent:'center',alignItems:'center',padding:30}}>
                            <Text style={{fontSize:20,fontWeight:'bold',color:'#42544A'}}>สั่งเพิ่ม</Text>
                      </View>

                    </Pressable>

                    <Pressable  onPress={() => console.log('เก็บเงินโต๊ะ ' + bill?.table_number)}>
                      <View style={{paddingTop:20}}>
                            <Text style={{textAlign:'center'}}> เรียกพนักงานมาเก็บเงินที่โต๊ะ </Text>
                      </View>
                      
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
    flexDirection:'row'
  },
  boxLeft:{
    flex: 6,
   
    paddingLeft:20
  },
  boxRight:{
    flex:4,
    backgroundColor: '#FAFDF7',
    borderColor:'blue',
    paddingHorizontal:20,
    borderLeftWidth:1,
    borderLeftColor: '#E0EDE4',
   
    
  },

})