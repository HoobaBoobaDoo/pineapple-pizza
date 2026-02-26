import React, { useEffect, useState } from 'react';
import { FlatList, TouchableOpacity, Dimensions, Platform, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
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
  maxDaily?: number;
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
  const [weeklyTotalDocId, setWeeklyTotalDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [urgency, setUrgency] = useState('3');
  const [points, setPoints] = useState('');
  const [maxDaily, setMaxDaily] = useState('');

  const { width } = Dimensions.get('window');
  const isMobile = width < 768;

  const getStartOfWeek = (date: Date = new Date()) => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay() + 1); // Monday
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  };

  const fetchData = async () => {
    if (!auth.currentUser) return;
    try {
      // Fetch tasks
      const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', auth.currentUser.uid));
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasksData = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);

      // Get current week start
      const weekStart = getStartOfWeek();
      
      // Fetch this week's completions (Monday to Sunday)
      const endOfWeek = new Date(weekStart);
      endOfWeek.setDate(weekStart.getDate() + 7); // Next Monday

      const completionsQuery = query(
        collection(db, 'taskCompletions'),
        where('userId', '==', auth.currentUser.uid),
        where('completedAt', '>=', weekStart),
        where('completedAt', '<', endOfWeek)
      );
      const completionsSnapshot = await getDocs(completionsQuery);
      const completionsData = completionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        completedAt: doc.data().completedAt.toDate()
      } as TaskCompletion));
      setCompletions(completionsData);

      // Calculate total points for this week
      const calculatedTotal = completionsData.reduce((sum, completion) => sum + completion.pointsEarned, 0);

      // Fetch or create weekly total document
      const weeklyTotalsQuery = query(
        collection(db, 'weeklyTotals'),
        where('userId', '==', auth.currentUser.uid),
        where('weekStart', '==', weekStart)
      );
      const weeklyTotalsSnapshot = await getDocs(weeklyTotalsQuery);

      // Use calculated total as the source of truth, but sync with stored total
      let weeklyTotal = calculatedTotal;
      
      if (weeklyTotalsSnapshot.empty) {
        // Create new weekly total document
        const newWeeklyTotal = await addDoc(collection(db, 'weeklyTotals'), {
          userId: auth.currentUser.uid,
          weekStart: weekStart,
          totalPoints: calculatedTotal,
          lastUpdated: new Date()
        });
        setWeeklyTotalDocId(newWeeklyTotal.id);
      } else {
        // Update existing document if total doesn't match
        const weeklyTotalDoc = weeklyTotalsSnapshot.docs[0];
        setWeeklyTotalDocId(weeklyTotalDoc.id);
        if (weeklyTotalDoc.data().totalPoints !== calculatedTotal) {
          await updateDoc(doc(db, 'weeklyTotals', weeklyTotalDoc.id), {
            totalPoints: calculatedTotal,
            lastUpdated: new Date()
          });
        }
      }
      setTotalPoints(weeklyTotal);
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
    
    // Find the task to check maxDaily limit
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Check if we've reached the max daily limit
    // Default to unlimited (99999999) completions per day if no maxDaily is set, max 100 for set values
    let maxCompletions = 99999999; // Default to unlimited
    if (task.maxDaily && !isNaN(Number(task.maxDaily))) {
      const num = Number(task.maxDaily);
      if (num > 0) {
        maxCompletions = Math.min(num, 100); // Cap at 100 for set values to prevent abuse
      }
    }
    const taskCompletions = completions.filter(c => c.taskId === taskId);
    if (taskCompletions.length >= maxCompletions) {
      Alert.alert('Limit Reached', `You can only complete this task ${maxCompletions} times per day.`);
      return;
    }
    
    try {
      await addDoc(collection(db, 'taskCompletions'), {
        userId: auth.currentUser.uid,
        taskId,
        completedAt: new Date(),
        pointsEarned: points,
      });
      // Update local state
      const newCompletions = [...completions, {
        id: 'temp-' + Date.now(), // Temporary ID
        taskId,
        completedAt: new Date(),
        pointsEarned: points
      }];
      setCompletions(newCompletions);
      const newTotal = newCompletions.reduce((sum, completion) => sum + completion.pointsEarned, 0);
      setTotalPoints(newTotal);

      // Update weekly total in Firestore
      if (weeklyTotalDocId) {
        await updateDoc(doc(db, 'weeklyTotals', weeklyTotalDocId), {
          totalPoints: newTotal,
          lastUpdated: new Date()
        });
      }
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
      const newCompletions = completions.filter(c => c.id !== mostRecent.id);
      setCompletions(newCompletions);
      const newTotal = newCompletions.reduce((sum, completion) => sum + completion.pointsEarned, 0);
      setTotalPoints(newTotal);

      // Update weekly total in Firestore
      if (weeklyTotalDocId) {
        await updateDoc(doc(db, 'weeklyTotals', weeklyTotalDocId), {
          totalPoints: newTotal,
          lastUpdated: new Date()
        });
      }
    } catch (error) {
      console.error('Error removing completion:', error);
    }
  };

  const simulateWeekPass = async () => {
    if (!auth.currentUser) return;
    
    try {
      // Calculate current week boundaries
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7); // Next Monday

      // Delete all completions for this week
      const deletePromises = completions.map(completion => 
        deleteDoc(doc(db, 'taskCompletions', completion.id))
      );
      
      await Promise.all(deletePromises);
      
      // Reset local state
      setCompletions([]);
      setTotalPoints(0);
      
      // Reset weekly total in Firestore
      if (weeklyTotalDocId) {
        await updateDoc(doc(db, 'weeklyTotals', weeklyTotalDocId), {
          totalPoints: 0,
          lastUpdated: new Date()
        });
      }
      
      Alert.alert('Week Reset', 'All weekly completions have been reset!');
    } catch (error) {
      console.error('Error resetting week:', error);
      Alert.alert('Error', 'Failed to reset week');
    }
  };

  const addTask = async () => {
    if (!auth.currentUser) return;
    
    // Validation
    if (!taskName.trim()) {
      Alert.alert('Error', 'Please enter a task name');
      return;
    }
    const pointsNum = parseInt(points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      Alert.alert('Error', 'Please enter a valid number of points');
      return;
    }
    let maxDailyNum: number | undefined;
    if (maxDaily.trim() !== '') {
      maxDailyNum = Math.min(parseInt(maxDaily), 100);
      if (isNaN(maxDailyNum) || maxDailyNum <= 0) {
        Alert.alert('Error', 'Please enter a valid max daily amount (1-100)');
        return;
      }
    }
    const urgencyNum = parseInt(urgency);
    if (isNaN(urgencyNum) || urgencyNum < 1 || urgencyNum > 5) {
      Alert.alert('Error', 'Please select a valid urgency (1-5)');
      return;
    }

    try {
      await addDoc(collection(db, 'tasks'), {
        userId: auth.currentUser.uid,
        name: taskName.trim(),
        points: pointsNum,
        urgency: urgencyNum.toString(),
        isRepeating: true,
        createdAt: new Date(),
        maxDaily: maxDailyNum,
      });

      // Reset form and close modal
      setTaskName('');
      setUrgency('3');
      setPoints('');
      setMaxDaily('');
      setModalVisible(false);

      // Refresh tasks
      await fetchData();
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task');
    }
  };

  const renderTask = ({ item }: { item: Task }) => {
    const taskCompletions = completions.filter(c => c.taskId === item.id);
    const completionCount = taskCompletions.length;
    let maxCompletions = 99999999; // Default to unlimited
    if (item.maxDaily && !isNaN(Number(item.maxDaily))) {
      const num = Number(item.maxDaily);
      if (num > 0) {
        maxCompletions = Math.min(num, 100); // Cap at 100 for set values to prevent abuse
      }
    }
    const isAtLimit = completionCount >= maxCompletions;
    const isUnlimited = maxCompletions === 99999999;

    // Color coding based on urgency
    const urgencyColors = {
      '1': '#FF6B6B', // Red for high urgency
      '2': '#FFA726', // Orange
      '3': '#42A5F5', // Blue for medium
      '4': '#66BB6A', // Green
      '5': '#AB47BC'  // Purple for low urgency
    };

    const urgencyColor = urgencyColors[item.urgency as keyof typeof urgencyColors] || '#42A5F5';

    return (
      <ThemedView style={{
        marginHorizontal: isMobile ? 10 : 20,
        marginVertical: 8,
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        padding: 20,
        boxShadow: '0px 2px 8px rgba(0,0,0,0.3)',
        elevation: 4,
        borderLeftWidth: 4,
        borderLeftColor: urgencyColor,
      }}>
        <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <ThemedView style={{ flex: 1, marginRight: 15 }}>
            <ThemedText style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: '#FFFFFF',
              marginBottom: 6
            }}>
              {item.name}
            </ThemedText>

            <ThemedView style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <ThemedView style={{
                backgroundColor: '#FFD700',
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                marginRight: 8
              }}>
                <ThemedText style={{ fontSize: 12, fontWeight: 'bold', color: '#2C3E50' }}>
                  {item.points} pts
                </ThemedText>
              </ThemedView>

              <ThemedView style={{
                backgroundColor: urgencyColor,
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                marginRight: 8
              }}>
                <ThemedText style={{ fontSize: 12, fontWeight: 'bold', color: 'white' }}>
                  Urgency {item.urgency}
                </ThemedText>
              </ThemedView>

              <ThemedView style={{
                backgroundColor: isAtLimit ? '#EF5350' : '#81C784',
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2
              }}>
                <ThemedText style={{ fontSize: 12, fontWeight: 'bold', color: 'white' }}>
                  {completionCount}/{isUnlimited ? '∞' : maxCompletions}
                </ThemedText>
              </ThemedView>
            </ThemedView>

            {item.description && (
              <ThemedText style={{
                fontSize: 14,
                color: '#B0B0B0',
                lineHeight: 20
              }}>
                {item.description}
              </ThemedText>
            )}
          </ThemedView>

          <ThemedView style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isAtLimit ? '#2D1818' : '#1B2D1B',
            borderRadius: 25,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderWidth: 2,
            borderColor: isAtLimit ? '#EF5350' : '#4CAF50'
          }}>
            <ThemedText style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: isAtLimit ? '#FF8A80' : '#81C784',
              marginRight: 12,
              minWidth: 20,
              textAlign: 'center'
            }}>
              {completionCount}
            </ThemedText>

            <TouchableOpacity
              onPress={() => completeTask(item.id, item.points)}
              disabled={isAtLimit}
              style={{
                backgroundColor: isAtLimit ? '#424242' : '#4CAF50',
                borderRadius: 20,
                width: 40,
                height: 40,
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 8,
                boxShadow: '0px 1px 2px rgba(0,0,0,0.3)',
                elevation: 2
              }}
            >
              <ThemedText style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>+</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => removeCompletion(item.id, item.points)}
              disabled={completionCount === 0}
              style={{
                backgroundColor: completionCount === 0 ? '#424242' : '#F44336',
                borderRadius: 20,
                width: 40,
                height: 40,
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: '0px 1px 2px rgba(0,0,0,0.3)',
                elevation: 2
              }}
            >
              <ThemedText style={{
                color: completionCount === 0 ? '#757575' : 'white',
                fontSize: 24,
                fontWeight: 'bold'
              }}>
                −
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    );
  };

  if (loading) {
    return (
      <ThemedView style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#121212'
      }}>
        <ThemedView style={{
          backgroundColor: '#1E1E1E',
          borderRadius: 20,
          padding: 30,
          alignItems: 'center',
          boxShadow: '0px 4px 8px rgba(0,0,0,0.3)',
          elevation: 4
        }}>
          <Ionicons name="hourglass" size={48} color="#FFFFFF" style={{ marginBottom: 20 }} />
          <ThemedText style={{
            fontSize: 18,
            fontWeight: '600',
            color: '#FFFFFF',
            textAlign: 'center'
          }}>
            Loading your tasks...
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#121212' }}>
      <ThemedView style={{
        backgroundColor: 'linear-gradient(135deg, #1E3A8A 0%, #3730A3 50%, #581C87 100%)',
        paddingTop: 50,
        paddingBottom: 30,
        paddingHorizontal: 20,
        alignItems: 'center',
        boxShadow: '0px 4px 8px rgba(0,0,0,0.5)',
        elevation: 8
      }}>
        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Ionicons name="clipboard" size={32} color="white" style={{ marginRight: 10 }} />
          <ThemedText style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: 'white'
          }}>
            Tasks
          </ThemedText>
        </ThemedView>

        {/* Prominent Score Display */}
        <ThemedView style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.2)',
          paddingHorizontal: 40,
          paddingVertical: 20,
          borderRadius: 30,
          marginBottom: 25,
          boxShadow: '0px 4px 6px rgba(0,0,0,0.4)',
          elevation: 6,
          backdropFilter: 'blur(10px)'
        }}>
          <ThemedText style={{
            color: 'white',
            fontSize: 28,
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            {totalPoints} Points This Week
          </ThemedText>
          <ThemedText style={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: 14,
            textAlign: 'center',
            marginTop: 5
          }}>
            Keep it up!
          </ThemedText>
        </ThemedView>

        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            paddingHorizontal: 30,
            paddingVertical: 15,
            borderRadius: 25,
            boxShadow: '0px 3px 5px rgba(0,0,0,0.4)',
            elevation: 5,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            marginBottom: 15
          }}
        >
          <ThemedText style={{
            color: 'white',
            fontSize: 16,
            fontWeight: 'bold'
          }}>
            <Ionicons name="add-circle" size={16} color="white" /> Add New Task
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={simulateWeekPass}
          style={{
            backgroundColor: 'rgba(255, 165, 0, 0.8)',
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
            boxShadow: '0px 2px 4px rgba(0,0,0,0.3)',
            elevation: 3,
            borderWidth: 1,
            borderColor: 'rgba(255, 165, 0, 0.5)'
          }}
        >
          <ThemedText style={{
            color: 'white',
            fontSize: 14,
            fontWeight: 'bold'
          }}>
            <Ionicons name="refresh" size={14} color="white" /> Simulate Week Pass
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <FlatList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <ThemedView style={{
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            marginTop: 20
          }}>
            <Ionicons name="list" size={48} color="#FFFFFF" style={{ marginBottom: 20 }} />
            <ThemedText style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: '#FFFFFF',
              textAlign: 'center',
              marginBottom: 10
            }}>
              No tasks yet!
            </ThemedText>
            <ThemedText style={{
              fontSize: 16,
              color: '#B0B0B0',
              textAlign: 'center',
              lineHeight: 24
            }}>
              Create your first task to start earning points and building great habits.
            </ThemedText>
          </ThemedView>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <ThemedView style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: 20
        }}>
          <ThemedView style={{
            backgroundColor: '#1E1E1E',
            borderRadius: 20,
            padding: 25,
            width: isMobile ? '95%' : 450,
            maxHeight: '90%',
            boxShadow: '0px 10px 20px rgba(0,0,0,0.5)',
            elevation: 10
          }}>
            <ThemedView style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 25,
              paddingBottom: 15,
              borderBottomWidth: 2,
              borderBottomColor: '#333'
            }}>
              <ThemedText style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: '#FFFFFF'
              }}>
              <Ionicons name="add" size={20} color="#FFFFFF" /> Create New Task
              </ThemedText>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{
                  width: 35,
                  height: 35,
                  borderRadius: 17.5,
                  backgroundColor: '#333',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <Ionicons name="close" size={18} color="#B0B0B0" />
              </TouchableOpacity>
            </ThemedView>

            <ThemedView style={{ marginBottom: 20 }}>
              <ThemedText style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#FFFFFF',
                marginBottom: 8
              }}>
                <Ionicons name="document-text" size={16} color="#FFFFFF" /> Task Name
              </ThemedText>
              <TextInput
                placeholder="What task do you want to accomplish?"
                value={taskName}
                onChangeText={setTaskName}
                style={{
                  borderWidth: 2,
                  borderColor: '#444',
                  borderRadius: 12,
                  padding: 15,
                  fontSize: 16,
                  backgroundColor: '#2A2A2A',
                  color: '#FFFFFF',
                  marginBottom: 5
                }}
                placeholderTextColor="#888"
              />
            </ThemedView>

            <ThemedView style={{ flexDirection: isMobile ? 'column' : 'row', marginBottom: 20 }}>
              <ThemedView style={{ flex: 1, marginRight: isMobile ? 0 : 10, marginBottom: isMobile ? 15 : 0 }}>
                <ThemedText style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  marginBottom: 8
                }}>
                  <Ionicons name="flash" size={16} color="#FFFFFF" /> Urgency (1-5)
                </ThemedText>
                <TextInput
                  placeholder="1-5"
                  value={urgency}
                  onChangeText={setUrgency}
                  keyboardType="numeric"
                  style={{
                    borderWidth: 2,
                    borderColor: '#444',
                    borderRadius: 12,
                    padding: 15,
                    fontSize: 16,
                    backgroundColor: '#2A2A2A',
                    color: '#FFFFFF',
                    textAlign: 'center'
                  }}
                  placeholderTextColor="#888"
                />
              </ThemedView>

              <ThemedView style={{ flex: 1, marginLeft: isMobile ? 0 : 10 }}>
                <ThemedText style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  marginBottom: 8
                }}>
                  <Ionicons name="trophy" size={16} color="#FFFFFF" /> Points
                </ThemedText>
                <TextInput
                  placeholder="Points value"
                  value={points}
                  onChangeText={setPoints}
                  keyboardType="numeric"
                  style={{
                    borderWidth: 2,
                    borderColor: '#444',
                    borderRadius: 12,
                    padding: 15,
                    fontSize: 16,
                    backgroundColor: '#2A2A2A',
                    color: '#FFFFFF',
                    textAlign: 'center'
                  }}
                  placeholderTextColor="#888"
                />
              </ThemedView>
            </ThemedView>

            <ThemedView style={{ marginBottom: 30 }}>
              <ThemedText style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#FFFFFF',
                marginBottom: 8
              }}>
                <Ionicons name="repeat" size={16} color="#FFFFFF" /> Max Daily Completions
              </ThemedText>
              <TextInput
                placeholder="How many times per day? (optional, unlimited if empty)"
                value={maxDaily}
                onChangeText={setMaxDaily}
                keyboardType="numeric"
                style={{
                  borderWidth: 2,
                  borderColor: '#444',
                  borderRadius: 12,
                  padding: 15,
                  fontSize: 16,
                  backgroundColor: '#2A2A2A',
                  color: '#FFFFFF'
                }}
                placeholderTextColor="#888"
              />
            </ThemedView>

            <ThemedView style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingTop: 20,
              borderTopWidth: 2,
              borderTopColor: '#333'
            }}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{
                  backgroundColor: '#333',
                  paddingHorizontal: 25,
                  paddingVertical: 12,
                  borderRadius: 25,
                  borderWidth: 2,
                  borderColor: '#444',
                  flex: 1,
                  marginRight: 10
                }}
              >
                <ThemedText style={{
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#B0B0B0'
                }}>
                  Cancel
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addTask}
                style={{
                  backgroundColor: '#667EEA',
                  paddingHorizontal: 25,
                  paddingVertical: 12,
                  borderRadius: 25,
                  flex: 1,
                  marginLeft: 10,
                  boxShadow: '0px 4px 8px rgba(102,126,234,0.3)',
                  elevation: 4
                }}
              >
                <ThemedText style={{
                  color: 'white',
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: 'bold'
                }}>
                  <Ionicons name="checkmark" size={16} color="white" /> Create Task
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}