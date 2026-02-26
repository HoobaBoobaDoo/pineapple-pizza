import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export function HelloWave() {
  return (
    <Animated.View
      style={{
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      <Ionicons name="hand-left" size={28} color="#FFD700" />
    </Animated.View>
  );
}
