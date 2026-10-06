import { View ,Text,ScrollView,FlatList} from 'react-native';
const BillOrder =({orders})=>{
        return(
                <View style={{ flex: 1 }}>
                    
                <View style={{ flexDirection: 'row',  borderBottomWidth: 1,borderBottomColor: '#E0EDE4', borderTopWidth: 1,borderTopColor: '#E0EDE4', paddingBottom:12 , paddingTop:12,marginRight:20,}}>
                                
                    <Text style={{ flex: 5}}>รายการอาหาร</Text>
                    <Text style={{ flex: 2 ,}}>ราคาต่ออัน</Text>
                    <Text style={{ flex: 1 ,textAlign: 'center' }}>จำนวน</Text>
                    <Text style={{ flex: 2,textAlign: 'right' ,paddingRight:12}}>รวม</Text>
                </View>
                <FlatList
                data={orders}
                keyExtractor={(item) => item.round.toString()}
                renderItem={({ item: round }) => (
                    <View style={{marginRight:20}}>
                    <ScrollView  >
                    {/* header รอบ */}
                    <View style={{flexDirection:'row',paddingBottom:10,paddingTop:10}}>
                        <Text style={{fontSize:18,fontWeight:'bold'}}>รอบที่ {round.round}  </Text>
                        <Text style={{paddingTop:6}}>ส่งครัว {round.sentTime} · {round.status}</Text>

                    </View>
                    
                    {/* รายการในรอบ */}
                    <FlatList
                        data={round.items}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E0EDE4' }}>
                            <View style={{ flex: 5 ,paddingTop:12}}>
                                <Text style={{fontSize:18,fontWeight:'300', paddingTop:1}} >{item.name}</Text>
                                <Text style={{color: '#42544A',paddingVertical:12}}>{item.note}</Text>
                            </View>
                        
                            <Text style={{ flex: 2,paddingTop:18 ,paddingLeft:12}}>฿{item.price}</Text>
                            <Text style={{ flex: 1 ,paddingTop:18,textAlign: 'center' }}>{item.qty}</Text>
                            <Text style={{ flex: 2,fontSize:18,fontWeight:'bold',paddingTop:14 ,textAlign: 'right',paddingRight:12}}>฿{item.lineTotal}</Text>
                        </View>
                        )}
                        scrollEnabled={false}
                    />
                    </ScrollView>
                    </View>
                    
                )}
                />
             </View>
        )

}

export default BillOrder