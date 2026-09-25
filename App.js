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

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      onInit={async (db) => {
        await initDb(db);
        await seedDb(db);
        await seedMockBill(db);
        // await logAllData(db); // เปิดเมื่ออยากดูข้อมูลใน DB ตอน debug (ต้อง import logAllData ด้วย)
      }}
    >
      <CartProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="SelectTable" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SelectTable" component={SelectTable} />
            <Stack.Screen name="MenuScreen" component={MenuScreen} />
            <Stack.Screen name="ReviewScreen" component={ReviewScreen} />
            <Stack.Screen
              name="ItemDetailScreen"
              component={ItemDetailScreen}
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
              <Stack.Screen name="SendToKitchen" component={PreSendToKitchen} options={{ headerShown: false }} />
              <Stack.Screen name="Detail" component={DetailScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Bill" component={ExportBillScreen} options={{ headerShown: false }} />
          </Stack.Navigator>
          
        </NavigationContainer>
      </CartProvider>
    </SQLiteProvider>
  );
}
