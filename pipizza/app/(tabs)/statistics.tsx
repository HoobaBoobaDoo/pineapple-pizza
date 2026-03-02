import { StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/AuthContext';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

const { width } = Dimensions.get('window');
const isMobile = width < 768;

interface DailyStats {
  id: string;
  date: string;
  taskCompletions: { [taskId: string]: number };
  totalPoints: number;
  totalCompletions: number;
  userId: string;
}

interface Task {
  id: string;
  name: string;
  points: number;
}

export default function StatisticsScreen() {
  const { user, userData, auth, db } = useAuth();
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<DailyStats[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStatistics();
      fetchTasks();
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        fetchStatistics();
      }
    }, [user])
  );

  const fetchTasks = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'tasks'), where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchStatistics = async () => {
    if (!auth.currentUser) return;
    try {
      // Get all stats for the user and filter/sort in memory to avoid index requirements
      const q = query(collection(db, 'dailyStats'), where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const statsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as DailyStats))
        .filter(stat => stat.date >= sevenDaysAgoStr) // Filter to last 7 days
        .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date desc

      setDailyStats(statsData);
      setWeeklyStats(statsData);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTaskName = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    return task ? task.name : 'Unknown Task';
  };

  const getWeeklyTotal = () => {
    return weeklyStats.reduce((acc, day) => ({
      points: acc.points + day.totalPoints,
      completions: acc.completions + day.totalCompletions
    }), { points: 0, completions: 0 });
  };

  const getMotivationalMessage = () => {
    const weekly = getWeeklyTotal();
    if (weekly.points === 0) {
      return "Let's get started! Every journey begins with a single step.";
    } else if (weekly.points < 50) {
      return "Great start! Keep building those habits.";
    } else if (weekly.points < 100) {
      return "You're on fire! Consistency is paying off.";
    } else if (weekly.points < 200) {
      return "Amazing progress! You're crushing your goals.";
    } else {
      return "Legendary performance! You're unstoppable!";
    }
  };

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    return dailyStats.find(stat => stat.date === today) || null;
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.loadingContainer}>
          <Ionicons name="analytics" size={48} color="#FFFFFF" />
          <ThemedText style={styles.loadingText}>Loading your statistics...</ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  const weeklyTotal = getWeeklyTotal();
  const todayStats = getTodayStats();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.headerTitle}>Your Progress</ThemedText>
        <ThemedText style={styles.motivationalMessage}>{getMotivationalMessage()}</ThemedText>
      </ThemedView>

      {/* Today's Stats */}
      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Today</ThemedText>
        <ThemedView style={styles.statsCard}>
          <ThemedView style={styles.statRow}>
            <ThemedView style={styles.statItem}>
              <Ionicons name="trophy" size={24} color="#FFD700" />
              <ThemedText style={styles.statValue}>{todayStats?.totalPoints || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Points</ThemedText>
            </ThemedView>
            <ThemedView style={styles.statItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <ThemedText style={styles.statValue}>{todayStats?.totalCompletions || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Tasks</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {/* Weekly Stats */}
      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>This Week</ThemedText>
        <ThemedView style={styles.statsCard}>
          <ThemedView style={styles.statRow}>
            <ThemedView style={styles.statItem}>
              <Ionicons name="calendar" size={24} color="#667EEA" />
              <ThemedText style={styles.statValue}>{weeklyTotal.points}</ThemedText>
              <ThemedText style={styles.statLabel}>Total Points</ThemedText>
            </ThemedView>
            <ThemedView style={styles.statItem}>
              <Ionicons name="checkmark-done-circle" size={24} color="#4CAF50" />
              <ThemedText style={styles.statValue}>{weeklyTotal.completions}</ThemedText>
              <ThemedText style={styles.statLabel}>Total Tasks</ThemedText>
            </ThemedView>
          </ThemedView>
          <ThemedView style={styles.statRow}>
            <ThemedView style={styles.statItem}>
              <Ionicons name="trending-up" size={24} color="#FF9800" />
              <ThemedText style={styles.statValue}>
                {weeklyStats.length > 0 ? Math.round(weeklyTotal.points / weeklyStats.length) : 0}
              </ThemedText>
              <ThemedText style={styles.statLabel}>Avg/Day</ThemedText>
            </ThemedView>
            <ThemedView style={styles.statItem}>
              <Ionicons name="locate" size={24} color="#9C27B0" />
              <ThemedText style={styles.statValue}>
                {userData?.weeklyTargetPoints ? Math.round((weeklyTotal.points / userData.weeklyTargetPoints) * 100) : 0}%
              </ThemedText>
              <ThemedText style={styles.statLabel}>Target</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {/* Recent Days */}
      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Recent Activity</ThemedText>
        {dailyStats.length === 0 ? (
          <ThemedView style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={48} color="#666" />
            <ThemedText style={styles.emptyText}>No activity yet this week.</ThemedText>
            <ThemedText style={styles.emptySubtext}>Complete some tasks to see your progress!</ThemedText>
          </ThemedView>
        ) : (
          dailyStats.slice(0, 7).map((day) => (
            <ThemedView key={day.id} style={styles.dayCard}>
              <ThemedView style={styles.dayHeader}>
                <ThemedText style={styles.dayDate}>
                  {new Date(day.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </ThemedText>
                <ThemedView style={styles.dayStats}>
                  <ThemedText style={styles.dayPoints}>{day.totalPoints} pts</ThemedText>
                  <ThemedText style={styles.dayCompletions}>{day.totalCompletions} tasks</ThemedText>
                </ThemedView>
              </ThemedView>
              {Object.keys(day.taskCompletions).length > 0 && (
                <ThemedView style={styles.taskBreakdown}>
                  {Object.entries(day.taskCompletions).map(([taskId, count]) => (
                    <ThemedText key={taskId} style={styles.taskItem}>
                      • {getTaskName(taskId)}: {count}x
                    </ThemedText>
                  ))}
                </ThemedView>
              )}
            </ThemedView>
          ))
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingHorizontal: isMobile ? 20 : 40,
    paddingTop: 60,
    paddingBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  motivationalMessage: {
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 30,
    paddingHorizontal: isMobile ? 20 : 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
  },
  statsCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 15,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#42A5F5',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 5,
  },
  statLabel: {
    fontSize: 14,
    color: '#B0B0B0',
    marginTop: 2,
  },
  dayCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#667EEA',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dayStats: {
    alignItems: 'flex-end',
  },
  dayPoints: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  dayCompletions: {
    fontSize: 12,
    color: '#B0B0B0',
  },
  taskBreakdown: {
    marginTop: 10,
  },
  taskItem: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 3,
  },
  emptyCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 15,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 15,
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 20,
  },
});
