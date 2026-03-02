import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, FlatList, Alert, Modal, TextInput, Dimensions, ScrollView, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/AuthContext';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, Timestamp, setDoc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isMobile = width < 768;
const numColumns = isMobile ? 1 : 2;

interface Task {
  id: string;
  name: string;
  points: number;
  urgency: string;
  maxDailyCompletions: number;
  userId: string;
  createdAt?: any; // Firestore timestamp
}

interface TaskCompletion {
  id: string;
  taskId: string;
  userId: string;
  completedAt: Timestamp;
  points: number;
}

interface DailyStats {
  date: string;
  taskCompletions: { [taskId: string]: number };
  totalPoints: number;
  totalCompletions: number;
}

export default function TasksScreen() {
  const { user, auth, db } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskCompletions, setTaskCompletions] = useState<TaskCompletion[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskName, setTaskName] = useState('');
  const [points, setPoints] = useState('');
  const [urgency, setUrgency] = useState('3');
  const [maxDailyCompletions, setMaxDailyCompletions] = useState('');
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownTaskId, setDropdownTaskId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const dropdownButtonRefs = useRef<{ [key: string]: React.ComponentRef<typeof TouchableOpacity> | null }>({});

  const showDropdown = (taskId: string, ref: React.ComponentRef<typeof TouchableOpacity> | null) => {
    setDropdownTaskId(taskId);
    
    if (ref) {
      ref.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
        setDropdownPosition({ x: pageX - 120, y: pageY + height + 5 });
        setDropdownVisible(true);
      });
    } else {
      setDropdownVisible(true);
    }
  };
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [limitModalVisible, setLimitModalVisible] = useState(false);
  const [pendingCompletion, setPendingCompletion] = useState<{ taskId: string; points: number } | null>(null);

  useEffect(() => {
    if (user) {
      fetchTasks();
      fetchCompletions();
      fetchWeeklyStats();
    }
  }, [user]);

  const fetchTasks = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'tasks'), where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const tasksData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Task))
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime(); // Sort by createdAt desc
        });
      setTasks(tasksData);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompletions = async () => {
    if (!auth.currentUser) return;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const q = query(
        collection(db, 'taskCompletions'),
        where('userId', '==', auth.currentUser.uid),
        where('completedAt', '>=', Timestamp.fromDate(today))
      );
      const snapshot = await getDocs(q);
      const completionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskCompletion));
      setTaskCompletions(completionsData);
    } catch (error) {
      console.error('Error fetching completions:', error);
    }
  };

  const fetchWeeklyStats = async () => {
    if (!auth.currentUser) return;
    try {
      // Fetch all stats for the user and filter/sort in memory to avoid index requirements
      const q = query(collection(db, 'dailyStats'), where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const statsData = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.date || '',
            taskCompletions: data.taskCompletions || {},
            totalPoints: data.totalPoints || 0,
            totalCompletions: data.totalCompletions || 0,
            userId: data.userId || ''
          } as DailyStats;
        })
        .filter(stat => stat.date >= sevenDaysAgoStr) // Filter to last 7 days
        .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date desc

      setWeeklyStats(statsData);
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
    }
  };

  const getWeeklyTotal = () => {
    return weeklyStats.reduce((total, day) => total + day.totalPoints, 0);
  };

  const getTodayCompletions = (taskId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return taskCompletions.filter(
      c => c.taskId === taskId && c.completedAt.toDate() >= today
    ).length;
  };

  const completeTask = async (taskId: string, points: number) => {
    if (!auth.currentUser) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const todayCompletions = getTodayCompletions(taskId);
    if (todayCompletions >= task.maxDailyCompletions) {
      setPendingCompletion({ taskId, points });
      setLimitModalVisible(true);
      return;
    }

    try {
      await addDoc(collection(db, 'taskCompletions'), {
        taskId,
        userId: auth.currentUser.uid,
        completedAt: Timestamp.now(),
        points
      });
      fetchCompletions();
      updateDailyStats(taskId, points, true);
    } catch (error) {
      console.error('Error completing task:', error);
      Alert.alert('Error', 'Failed to complete task');
    }
  };

  const forceCompleteTask = async () => {
    if (!pendingCompletion || !auth.currentUser) return;

    try {
      await addDoc(collection(db, 'taskCompletions'), {
        taskId: pendingCompletion.taskId,
        userId: auth.currentUser.uid,
        completedAt: Timestamp.now(),
        points: pendingCompletion.points
      });
      fetchCompletions();
      updateDailyStats(pendingCompletion.taskId, pendingCompletion.points, true);
      setLimitModalVisible(false);
      setPendingCompletion(null);
    } catch (error) {
      console.error('Error completing task:', error);
      Alert.alert('Error', 'Failed to complete task');
    }
  };

  const updateDailyStats = async (taskId: string, points: number, isAddition: boolean = true) => {
    if (!auth.currentUser) return;

    const today = new Date().toISOString().split('T')[0];
    const statsRef = doc(db, 'dailyStats', `${auth.currentUser.uid}_${today}`);

    try {
      const statsDoc = await getDoc(statsRef);
      if (statsDoc.exists()) {
        const currentStats = statsDoc.data() as DailyStats;
        const newTotalPoints = isAddition ? currentStats.totalPoints + points : currentStats.totalPoints - points;
        const newTotalCompletions = isAddition ? currentStats.totalCompletions + 1 : currentStats.totalCompletions - 1;
        const newTaskCompletions = { ...currentStats.taskCompletions };
        newTaskCompletions[taskId] = (newTaskCompletions[taskId] || 0) + (isAddition ? 1 : -1);
        if (newTaskCompletions[taskId] <= 0) delete newTaskCompletions[taskId];

        await updateDoc(statsRef, {
          totalPoints: Math.max(0, newTotalPoints),
          totalCompletions: Math.max(0, newTotalCompletions),
          taskCompletions: newTaskCompletions
        });
      } else {
        // Create new daily stats
        const taskCompletions = isAddition ? { [taskId]: 1 } : {};
        await setDoc(statsRef, {
          userId: auth.currentUser.uid,
          date: today,
          taskCompletions,
          totalPoints: isAddition ? points : 0,
          totalCompletions: isAddition ? 1 : 0
        });
      }
      fetchWeeklyStats();
    } catch (error) {
      console.error('Error updating daily stats:', error);
    }
  };

  const removeCompletion = async (taskId: string, points: number) => {
    if (!auth.currentUser) return;

    const todayCompletions = taskCompletions.filter(
      c => c.taskId === taskId && c.completedAt.toDate().toDateString() === new Date().toDateString()
    );

    if (todayCompletions.length === 0) return;

    try {
      await deleteDoc(doc(db, 'taskCompletions', todayCompletions[todayCompletions.length - 1].id));
      fetchCompletions();
      updateDailyStats(taskId, points, false);
    } catch (error) {
      console.error('Error removing completion:', error);
      Alert.alert('Error', 'Failed to remove completion');
    }
  };

  const simulateDayPass = async () => {
    if (!auth.currentUser) return;

    try {
      // Store daily statistics
      const today = new Date().toISOString().split('T')[0];
      const todayCompletions = taskCompletions.filter(
        c => c.completedAt.toDate().toDateString() === new Date().toDateString()
      );

      const stats: DailyStats = {
        date: today,
        taskCompletions: {},
        totalPoints: 0,
        totalCompletions: todayCompletions.length
      };

      todayCompletions.forEach(completion => {
        stats.taskCompletions[completion.taskId] = (stats.taskCompletions[completion.taskId] || 0) + 1;
        stats.totalPoints += completion.points;
      });

      await addDoc(collection(db, 'dailyStats'), {
        ...stats,
        userId: auth.currentUser.uid
      });

      // Clear today's completions
      const deletePromises = todayCompletions.map(completion =>
        deleteDoc(doc(db, 'taskCompletions', completion.id))
      );
      await Promise.all(deletePromises);

      fetchCompletions();
      fetchWeeklyStats();
      Alert.alert('Day Passed', `You earned ${stats.totalPoints} points today!`);
    } catch (error) {
      console.error('Error simulating day pass:', error);
      Alert.alert('Error', 'Failed to simulate day pass');
    }
  };

  const renderUrgencyIndicator = (urgency: string) => {
    if (urgency === '1') return null;
    if (urgency === '2') return <ThemedText style={styles.urgencyIndicator}>II</ThemedText>;
    if (urgency === '3') return <ThemedText style={styles.urgencyIndicator}>III</ThemedText>;
    return null;
  };

  const renderTask = ({ item }: { item: Task }) => {
    const todayCompletions = getTodayCompletions(item.id);

    return (
      <ThemedView style={styles.taskContainer}>
        <TouchableOpacity
          ref={(ref) => {
            dropdownButtonRefs.current[item.id] = ref;
          }}
          onPress={() => showDropdown(item.id, dropdownButtonRefs.current[item.id])}
          style={styles.menuButton}
        >
          <Ionicons name="ellipsis-vertical" size={16} color="#FFFFFF" />
        </TouchableOpacity>

        <ThemedView style={styles.taskCard}>
          <ThemedView style={styles.taskContent}>
            <ThemedView style={styles.taskHeader}>
              <ThemedText style={styles.taskTitle}>{item.name}</ThemedText>
              {renderUrgencyIndicator(item.urgency)}
            </ThemedView>
            <ThemedText style={styles.taskPoints}>{item.points || 0} pts</ThemedText>
          </ThemedView>

          <ThemedView style={styles.taskActions}>
            <TouchableOpacity
              onPress={() => completeTask(item.id, item.points || 0)}
              style={styles.addButton}
            >
              <ThemedText style={styles.buttonText}>+</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => removeCompletion(item.id, item.points || 0)}
              style={styles.removeButton}
            >
              <ThemedText style={styles.buttonText}>-</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    );
  };

  const createTask = async () => {
    if (!auth.currentUser || !taskName.trim() || !points.trim() || !maxDailyCompletions.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const pointsNum = parseInt(points);
    const maxCompletionsNum = parseInt(maxDailyCompletions);
    const urgencyNum = parseInt(urgency);

    if (isNaN(pointsNum) || pointsNum <= 0) {
      Alert.alert('Error', 'Please enter a valid number of points');
      return;
    }

    if (isNaN(maxCompletionsNum) || maxCompletionsNum <= 0) {
      Alert.alert('Error', 'Please enter a valid maximum daily completions');
      return;
    }

    if (isNaN(urgencyNum) || urgencyNum < 1 || urgencyNum > 3) {
      Alert.alert('Error', 'Please enter urgency between 1-3');
      return;
    }

    try {
      await addDoc(collection(db, 'tasks'), {
        name: taskName.trim(),
        points: pointsNum,
        urgency: urgencyNum.toString(),
        maxDailyCompletions: maxCompletionsNum,
        userId: auth.currentUser.uid,
        createdAt: Timestamp.now()
      });

      setModalVisible(false);
      setTaskName('');
      setPoints('');
      setUrgency('3');
      setMaxDailyCompletions('');
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      Alert.alert('Error', 'Failed to create task');
    }
  };

  const editTask = async () => {
    if (!selectedTask || !taskName.trim() || !points.trim() || !maxDailyCompletions.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const pointsNum = parseInt(points);
    const maxCompletionsNum = parseInt(maxDailyCompletions);
    const urgencyNum = parseInt(urgency);

    if (isNaN(pointsNum) || pointsNum <= 0) {
      Alert.alert('Error', 'Please enter a valid number of points');
      return;
    }

    if (isNaN(maxCompletionsNum) || maxCompletionsNum <= 0) {
      Alert.alert('Error', 'Please enter a valid maximum daily completions');
      return;
    }

    if (isNaN(urgencyNum) || urgencyNum < 1 || urgencyNum > 3) {
      Alert.alert('Error', 'Please enter urgency between 1-3');
      return;
    }

    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        name: taskName.trim(),
        points: pointsNum,
        urgency: urgencyNum.toString(),
        maxDailyCompletions: maxCompletionsNum,
      });

      setEditModalVisible(false);
      setSelectedTask(null);
      setTaskName('');
      setPoints('');
      setUrgency('3');
      setMaxDailyCompletions('');
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const toggleUrgency = async (taskId: string) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      if (taskDoc.exists()) {
        const currentUrgency = taskDoc.data().urgency || '3';
        const newUrgency = currentUrgency === '1' ? '3' : '1'; // Toggle between enabled (3) and disabled (1)
        await updateDoc(taskRef, { urgency: newUrgency });
        fetchTasks();
      }
    } catch (error) {
      console.error('Error toggling urgency:', error);
      Alert.alert('Error', 'Failed to toggle urgency');
    }
  };

  const deleteTask = async () => {
    setDeleteModalVisible(true);
  };

  const confirmDeleteTask = async () => {
    if (!selectedTask) return;

    try {
      await deleteDoc(doc(db, 'tasks', selectedTask.id));

      // Delete all completions for this task
      const completionsQuery = query(
        collection(db, 'taskCompletions'),
        where('taskId', '==', selectedTask.id)
      );
      const completionsSnapshot = await getDocs(completionsQuery);
      const deletePromises = completionsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      setDeleteModalVisible(false);
      setEditModalVisible(false);
      setSelectedTask(null);
      fetchTasks();
      fetchCompletions();
    } catch (error) {
      console.error('Error deleting task:', error);
      Alert.alert('Error', 'Failed to delete task');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.loadingContainer}>
          <Ionicons name="hourglass" size={48} color="#FFFFFF" />
          <ThemedText style={styles.loadingText}>Loading your tasks...</ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedView style={styles.headerLeft}>
          <ThemedText style={styles.headerTitle}>My Tasks</ThemedText>
          <ThemedText style={styles.weeklyTotal}>Week: {getWeeklyTotal()} pts</ThemedText>
        </ThemedView>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addTaskButton}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </ThemedView>

      <FlatList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        contentContainerStyle={styles.tasksList}
        showsVerticalScrollIndicator={false}
      />

      <ThemedView style={styles.footer}>
        <TouchableOpacity onPress={simulateDayPass} style={styles.simulateButton}>
          <ThemedText style={styles.simulateButtonText}>Simulate Day Pass</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Task Dropdown Menu */}
      <Modal
        visible={dropdownVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        >
          <ThemedView style={[styles.dropdownContent, {
            position: 'absolute',
            left: dropdownPosition.x,
            top: dropdownPosition.y,
          }]}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                const task = tasks.find(t => t.id === dropdownTaskId);
                if (task) {
                  setSelectedTask(task);
                  setTaskName(task.name || '');
                  setPoints((task.points || 0).toString());
                  setUrgency(task.urgency || '3');
                  setMaxDailyCompletions((task.maxDailyCompletions || 1).toString());
                  setEditModalVisible(true);
                }
                setDropdownVisible(false);
              }}
            >
              <Ionicons name="pencil" size={16} color="#FFFFFF" />
              <ThemedText style={styles.dropdownItemText}>Edit</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                if (dropdownTaskId) {
                  toggleUrgency(dropdownTaskId);
                }
                setDropdownVisible(false);
              }}
            >
              <Ionicons name="alert-circle" size={16} color="#FFFFFF" />
              <ThemedText style={styles.dropdownItemText}>Enable Urgency</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                const task = tasks.find(t => t.id === dropdownTaskId);
                if (task) {
                  setSelectedTask(task);
                  deleteTask();
                }
                setDropdownVisible(false);
              }}
            >
              <Ionicons name="trash" size={16} color="#FF6B6B" />
              <ThemedText style={[styles.dropdownItemText, { color: '#FF6B6B' }]}>Remove</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </TouchableOpacity>
      </Modal>

      {/* Add Task Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedView style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Create New Task</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#B0B0B0" />
              </TouchableOpacity>
            </ThemedView>

            <ThemedView style={styles.form}>
              <ThemedView style={styles.inputGroup}>
                <ThemedView style={styles.inputLabel}>
                  <Ionicons name="document-text" size={16} color="#FFFFFF" />
                  <ThemedText style={styles.labelText}>Task Name</ThemedText>
                </ThemedView>
                <TextInput
                  placeholder="What task do you want to accomplish?"
                  value={taskName}
                  onChangeText={setTaskName}
                  style={styles.textInput}
                  placeholderTextColor="#888"
                />
              </ThemedView>

              <ThemedView style={styles.rowInputs}>
                <ThemedView style={styles.inputGroup}>
                  <ThemedView style={styles.inputLabel}>
                    <Ionicons name="trophy" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.labelText}>Points</ThemedText>
                  </ThemedView>
                  <TextInput
                    placeholder="10"
                    value={points}
                    onChangeText={setPoints}
                    keyboardType="numeric"
                    style={styles.textInput}
                    placeholderTextColor="#888"
                  />
                </ThemedView>

                <ThemedView style={styles.inputGroup}>
                  <ThemedView style={styles.inputLabel}>
                    <Ionicons name="flash" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.labelText}>Urgency (1-3)</ThemedText>
                  </ThemedView>
                  <TextInput
                    placeholder="3"
                    value={urgency}
                    onChangeText={setUrgency}
                    keyboardType="numeric"
                    style={styles.textInput}
                    placeholderTextColor="#888"
                  />
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.inputGroup}>
                <ThemedView style={styles.inputLabel}>
                  <Ionicons name="repeat" size={16} color="#FFFFFF" />
                  <ThemedText style={styles.labelText}>Max Daily Completions</ThemedText>
                </ThemedView>
                <TextInput
                  placeholder="5"
                  value={maxDailyCompletions}
                  onChangeText={setMaxDailyCompletions}
                  keyboardType="numeric"
                  style={styles.textInput}
                  placeholderTextColor="#888"
                />
              </ThemedView>

              <ThemedView style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.cancelButton}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={createTask} style={styles.createButton}>
                  <Ionicons name="checkmark" size={16} color="white" />
                  <ThemedText style={styles.createButtonText}>Create Task</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Daily Limit Modal */}
      <Modal
        visible={limitModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setLimitModalVisible(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedView style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Daily Limit Reached</ThemedText>
            </ThemedView>

            <ThemedText style={styles.limitMessage}>
              You've reached the maximum daily completions for this task. Would you like to complete it anyway?
            </ThemedText>

            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setLimitModalVisible(false);
                  setPendingCompletion(null);
                }}
                style={styles.cancelButton}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={forceCompleteTask} style={styles.createButton}>
                <ThemedText style={styles.createButtonText}>Complete Anyway</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        visible={editModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedView style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Edit Task</ThemedText>
              <ThemedView style={styles.headerButtons}>
                <TouchableOpacity onPress={deleteTask} style={styles.headerDeleteButton}>
                  <Ionicons name="trash" size={20} color="#FF6B6B" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#B0B0B0" />
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <ThemedView style={styles.form}>
                <ThemedView style={styles.inputGroup}>
                  <ThemedView style={styles.inputLabel}>
                    <Ionicons name="document-text" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.labelText}>Task Name</ThemedText>
                  </ThemedView>
                  <TextInput
                    placeholder="What task do you want to accomplish?"
                    value={taskName}
                    onChangeText={setTaskName}
                    style={styles.textInput}
                    placeholderTextColor="#888"
                  />
                </ThemedView>

                <ThemedView style={styles.rowInputs}>
                  <ThemedView style={styles.inputGroup}>
                    <ThemedView style={styles.inputLabel}>
                      <Ionicons name="trophy" size={16} color="#FFFFFF" />
                      <ThemedText style={styles.labelText}>Points</ThemedText>
                    </ThemedView>
                    <TextInput
                      placeholder="10"
                      value={points}
                      onChangeText={setPoints}
                      keyboardType="numeric"
                      style={styles.textInput}
                      placeholderTextColor="#888"
                    />
                  </ThemedView>

                  <ThemedView style={styles.inputGroup}>
                    <ThemedView style={styles.inputLabel}>
                      <Ionicons name="flash" size={16} color="#FFFFFF" />
                      <ThemedText style={styles.labelText}>Urgency (1-3)</ThemedText>
                    </ThemedView>
                    <TextInput
                      placeholder="3"
                      value={urgency}
                      onChangeText={setUrgency}
                      keyboardType="numeric"
                      style={styles.textInput}
                      placeholderTextColor="#888"
                    />
                  </ThemedView>
                </ThemedView>

                <ThemedView style={styles.inputGroup}>
                  <ThemedView style={styles.inputLabel}>
                    <Ionicons name="repeat" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.labelText}>Max Daily Completions</ThemedText>
                  </ThemedView>
                  <TextInput
                    placeholder="5"
                    value={maxDailyCompletions}
                    onChangeText={setMaxDailyCompletions}
                    keyboardType="numeric"
                    style={styles.textInput}
                    placeholderTextColor="#888"
                  />
                </ThemedView>

                <ThemedView style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={() => setEditModalVisible(false)}
                    style={styles.cancelButton}
                  >
                    <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={editTask} style={styles.createButton}>
                    <Ionicons name="checkmark" size={16} color="white" />
                    <ThemedText style={styles.createButtonText}>Update Task</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
            </ThemedView>
            </ScrollView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.deleteModalContent}>
            <ThemedView style={styles.deleteModalHeader}>
              <Ionicons name="warning" size={48} color="#FF6B6B" />
              <ThemedText style={styles.deleteModalTitle}>Delete Task</ThemedText>
            </ThemedView>

            <ThemedText style={styles.deleteModalMessage}>
              Are you sure you want to delete "{selectedTask?.name}"? This will also delete all its completion records and cannot be undone.
            </ThemedText>

            <ThemedView style={styles.deleteModalButtons}>
              <TouchableOpacity
                onPress={() => setDeleteModalVisible(false)}
                style={styles.deleteCancelButton}
              >
                <ThemedText style={styles.deleteCancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeleteTask}
                style={styles.deleteConfirmButton}
              >
                <Ionicons name="trash" size={16} color="white" />
                <ThemedText style={styles.deleteConfirmButtonText}>Delete</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isMobile ? 20 : 40,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  weeklyTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginTop: 4,
  },
  addTaskButton: {
    backgroundColor: '#667EEA',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tasksList: {
    paddingHorizontal: isMobile ? 20 : 40,
    paddingBottom: 100,
  },
  taskContainer: {
    position: 'relative',
    marginHorizontal: numColumns > 1 ? 8 : 0,
    marginVertical: 8,
  },
  taskCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 15,
    flex: numColumns > 1 ? 1 : undefined,
    borderLeftWidth: 4,
    borderLeftColor: '#42A5F5',
  },
  taskContent: {
    flex: 1,
    marginRight: 15,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  urgencyIndicator: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 8,
  },
  taskPoints: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  taskActions: {
    width: 50,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    backgroundColor: '#F44336',
    borderRadius: 25,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
    zIndex: 1,
  },
  buttonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: isMobile ? 20 : 40,
    paddingBottom: 30,
    paddingTop: 15,
    backgroundColor: 'rgba(18, 18, 18, 0.9)',
  },
  simulateButton: {
    backgroundColor: '#667EEA',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  simulateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 25,
    width: isMobile ? '95%' : 450,
    height: 600,
  },
  modalScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerDeleteButton: {
    marginRight: 15,
    padding: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  form: {
    marginBottom: 25,
  },
  inputGroup: {
    marginBottom: 20,
  },
  rowInputs: {
    flexDirection: isMobile ? 'column' : 'row',
    marginBottom: 20,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#444',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#2A2A2A',
    color: '#FFFFFF',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    backgroundColor: '#333',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#B0B0B0',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#667EEA',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  limitMessage: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 24,
  },
  editButtons: {
    marginTop: 25,
  },
  deleteButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  deleteModalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 25,
    width: isMobile ? '90%' : 400,
    alignItems: 'center',
  },
  deleteModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  deleteModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 10,
  },
  deleteModalMessage: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  deleteCancelButton: {
    flex: 1,
    backgroundColor: '#333333',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginRight: 10,
  },
  deleteCancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dropdownContent: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 5,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 5,
  },
  dropdownItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 8,
  },
});
