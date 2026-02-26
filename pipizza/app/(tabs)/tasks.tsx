import React, { useEffect, useState } from 'react';
import { FlatList, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '@/lib/AuthContext';

// Task type matching the schema
interface Task {
  id: string;
  name: string;
  points: number;
  urgency: string;
  description?: string;
  isRepeating: boolean;
  createdAt: string;
}

interface TaskCompletion {
  id: string;
  taskId: string;
  completedAt: Date;
  pointsEarned: number;
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const { width } = Dimensions.get('window');
  const isMobile = width < 768;

  const fetchData = async () => {
    if (!auth.currentUser) return;
    try {
      // Fetch tasks
      const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', auth.currentUser.uid));
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasksData = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);

      // Fetch today's completions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const completionsQuery = query(
        collection(db, 'taskCompletions'),
        where('userId', '==', auth.currentUser.uid),
        where('completedAt', '>=', today),
        where('completedAt', '<', tomorrow)
      );
      const completionsSnapshot = await getDocs(completionsQuery);
      const completionsData = completionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        completedAt: doc.data().completedAt.toDate()
      } as TaskCompletion));
      setCompletions(completionsData);

      // Calculate total points
      const total = completionsData.reduce((sum, completion) => sum + completion.pointsEarned, 0);
      setTotalPoints(total);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const completeTask = async (taskId: string, points: number) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'taskCompletions'), {
        userId: auth.currentUser.uid,
        taskId,
        completedAt: new Date(),
        pointsEarned: points,
      });
      // Update local state
      setTotalPoints(prev => prev + points);
      setCompletions(prev => [...prev, {
        id: 'temp-' + Date.now(), // Temporary ID
        taskId,
        completedAt: new Date(),
        pointsEarned: points
      }]);
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const removeCompletion = async (taskId: string, points: number) => {
    if (!auth.currentUser) return;
    try {
      // Find the most recent completion for this task
      const taskCompletions = completions.filter(c => c.taskId === taskId);
      if (taskCompletions.length === 0) return;

      const mostRecent = taskCompletions[taskCompletions.length - 1];
      await deleteDoc(doc(db, 'taskCompletions', mostRecent.id));

      // Update local state
      setTotalPoints(prev => prev - points);
      setCompletions(prev => prev.filter(c => c.id !== mostRecent.id));
    } catch (error) {
      console.error('Error removing completion:', error);
    }
  };

  const renderTask = ({ item }: { item: Task }) => {
    const taskCompletions = completions.filter(c => c.taskId === item.id);
    const completionCount = taskCompletions.length;

    return (
      <ThemedView style={{
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: isMobile ? '100%' : '80%',
        alignSelf: 'center'
      }}>
        <ThemedView style={{ flex: 1 }}>
          <ThemedText style={{ fontSize: 16, fontWeight: 'bold' }}>{item.name}</ThemedText>
          <ThemedText style={{ fontSize: 14, color: '#666' }}>{item.points} points - {item.urgency}</ThemedText>
          {item.description && <ThemedText style={{ fontSize: 12, color: '#888' }}>{item.description}</ThemedText>}
        </ThemedView>

        <ThemedView style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#f0f0f0',
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 5,
          marginRight: 10
        }}>
          <ThemedText style={{ fontSize: 16, fontWeight: 'bold', marginRight: 10 }}>{completionCount}</ThemedText>
          <TouchableOpacity
            onPress={() => completeTask(item.id, item.points)}
            style={{
              backgroundColor: 'green',
              borderRadius: 15,
              width: 30,
              height: 30,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 5
            }}
          >
            <ThemedText style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>+</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => removeCompletion(item.id, item.points)}
            style={{
              backgroundColor: completionCount === 0 ? '#ccc' : 'red',
              borderRadius: 15,
              width: 30,
              height: 30,
              justifyContent: 'center',
              alignItems: 'center'
            }}
            disabled={completionCount === 0}
          >
            <ThemedText style={{ color: completionCount === 0 ? '#888' : 'white', fontSize: 18, fontWeight: 'bold' }}>−</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    );
  };

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ThemedText>Loading tasks...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ThemedView style={{
        padding: 20,
        backgroundColor: '#f8f8f8',
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        alignItems: 'center'
      }}>
        <ThemedText type="title" style={{ marginBottom: 5 }}>Tasks</ThemedText>
        <ThemedText style={{ fontSize: 18, fontWeight: 'bold' }}>Total Points Today: {totalPoints}</ThemedText>
      </ThemedView>
      <FlatList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<ThemedText style={{ textAlign: 'center', padding: 20 }}>No tasks found. Create some tasks!</ThemedText>}
      />
    </ThemedView>
  );
}