import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth, auth, db } from '@/lib/AuthContext';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface DailySummary {
  id: string;
  date: string;
  pointsEarnedToday: number;
  pizzaEarnedToday: number;
  user: {
    displayName: string;
  };
}

export default function HomeScreen() {
  const { user, userData, logout } = useAuth();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      if (!auth.currentUser) return;
      const userId = auth.currentUser.uid;
      const today = new Date().toISOString().split('T')[0];
      try {
        const q = query(collection(db, 'dailySummaries'), where('userId', '==', userId), where('date', '==', today));
        const snapshot = await getDocs(q);
        const summaryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailySummary));
        setSummary(summaryData[0] || null);
      } catch (error) {
        console.error('Error fetching summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Please log in to view your dashboard.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Welcome, {userData?.nickname || user?.displayName || user?.email}!</ThemedText>
      <ThemedText>Track your productivity and earn pizza!</ThemedText>
      {loading ? (
        <ThemedText>Loading summary...</ThemedText>
      ) : summary ? (
        <ThemedView style={styles.summary}>
          <ThemedText>Points today: {summary.pointsEarnedToday}</ThemedText>
          <ThemedText>Pizza earned: {summary.pizzaEarnedToday}</ThemedText>
        </ThemedView>
      ) : (
        <ThemedText>No summary for today yet.</ThemedText>
      )}
      <TouchableOpacity onPress={handleLogout} style={styles.button}>
        <ThemedText style={styles.buttonText}>Logout</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  summary: {
    marginVertical: 20,
    alignItems: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 5,
  },
  buttonText: {
    color: 'white',
  },
});
