import { Pressable, StyleSheet, Text, View } from 'react-native';
import colors, { alpha } from '../customer/style/colors';

const STAFF_MODES = [
  {
    key: 'kitchen',
    letter: 'K',
    avatarColor: colors.core.brandGreen,
    title: 'จอครัว',
    description: 'คิวออร์เดอร์ · เปลี่ยนสถานะ · ยกเลิกรายการ',
  },
  {
    key: 'manage',
    letter: 'F',
    avatarColor: colors.core.darkGreen,
    title: 'การเงิน / จัดการร้าน',
    description: 'ยอดขายรายวัน · ตั้งค่าเมนูและราคา',
    route: 'MenuSettingsScreen',
  },
];

export default function StaffScreen({ navigation }) {
   function handlePressMode(mode) {
      if (mode.route) {
        navigation.navigate(mode.route);
      }
    }
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>โหมดพนักงาน</Text>
            <Text style={styles.subtitle}>เลือกหน้าที่ต้องการเปิดบนเครื่องนี้</Text>
          </View>
          <Pressable style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        <View style={styles.optionList}>
          {STAFF_MODES.map((mode, index) => (
            <Pressable
              key={mode.key}
              style={[styles.optionCard, index === 0 && styles.optionCardSelected]}
              onPress={() => handlePressMode(mode)}
            >
              <View style={[styles.avatar, { backgroundColor: mode.avatarColor }]}>
                <Text style={styles.avatarText}>{mode.letter}</Text>
              </View>
              <View style={styles.optionBody}>
                <Text style={styles.optionTitle}>{mode.title}</Text>
                <Text style={styles.optionDescription}>{mode.description}</Text>
              </View>
              <Text style={styles.optionArrow}>→</Text>
            </Pressable>
          ))}
        </View>


      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.core.canvasBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.core.screenBg,
    borderRadius: 24,
    padding: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.description,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface.sidebarCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text.description,
  },

  optionList: {
    marginTop: 24,
    gap: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    borderColor: alpha.borderMin,
    borderRadius: 16,
    padding: 14,
  },
  optionCardSelected: {
    borderColor: colors.core.brandGreen,
    backgroundColor: colors.surface.statusGreenBg,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.screenBg,
  },
  optionBody: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.core.darkGreen,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 2,
  },
  optionArrow: {
    fontSize: 18,
    color: colors.text.secondary,
  },

  infoBox: {
    marginTop: 24,
    backgroundColor: colors.surface.sidebarCard,
    borderRadius: 16,
    padding: 16,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.placeholder,
  },
});
