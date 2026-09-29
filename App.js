import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SQLiteProvider } from 'expo-sqlite';
import PreSendToKitchen from './src/screens/order/PreSendToKitchen';
import DetailScreen from './src/screens/order/DetailScreen';
import ExportBillScreen from './src/screens/order/ExportBillScreen';
import { DATABASE_NAME, initDb, seedDb, seedMockBill } from './src/db/db';
import { CartProvider } from './src/context/CartContext';
import SelectTable from './src/screens/customer/Select_Table';
import MenuScreen from './src/screens/customer/Menu_Screen';
import ReviewScreen from './src/screens/customer/Review_Screen';
import ItemDetailScreen from './src/screens/customer/Item_Detail_Screen';
import OrderKitScreen from './src/screens/kitchen/OrderKitScreen';
import RoundStatusScreen from './src/screens/kitchen/RoundStatusScreen';
import CancelItemScreen from './src/screens/kitchen/CancelItemScreen';

const Stack = createNativeStackNavigator();

// ต้องอยู่นอก component ไม่งั้นจะได้ arrow function ใหม่ทุก render
// SQLiteProvider ใช้ onInit เป็น dependency ของ useEffect → ถ้าตัวอ้างเปลี่ยน
// provider จะปิดแล้วเปิด DB ใหม่ (และรัน init/seed ซ้ำ) ทุกครั้งที่ App re-render
async function initDatabase(db) {
  await initDb(db);
  await seedDb(db);
  await seedMockBill(db);
}

export default function App() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase}>
      <CartProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="SelectTable" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SelectTable" component={SelectTable} />
            <Stack.Screen name="MenuScreen" component={MenuScreen} />
            <Stack.Screen name="ReviewScreen" component={ReviewScreen} />
            <Stack.Screen name="ItemDetailScreen" component={ItemDetailScreen} options={{ presentation: 'transparentModal', animation: 'fade' }}/>
              <Stack.Screen name="SendToKitchen" component={PreSendToKitchen} options={{ headerShown: false }} />
              <Stack.Screen name="Detail" component={DetailScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Bill" component={ExportBillScreen} options={{ headerShown: false }} />
              
              {/* ฝั่งครัว — ใช้ DB ตัวเดียวกับฝั่งลูกค้า (order_rounds / order_items) */}
              <Stack.Screen name="OrderKitScreen" component={OrderKitScreen} options={{ headerShown: false }} />
              <Stack.Screen name="RoundStatusScreen" component={RoundStatusScreen} options={{ headerShown: false }} />
              <Stack.Screen name="CancelItemScreen" component={CancelItemScreen} options={{ headerShown: false }} />
          </Stack.Navigator>
          
        </NavigationContainer>
      </CartProvider>
    </SQLiteProvider>
  );
}
