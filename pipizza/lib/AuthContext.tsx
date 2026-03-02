import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { router } from 'expo-router';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAl27xnN0ai5rYwpHRNYZI1ZyYgR29YC_o",
  authDomain: "pineapple-pizza-ee50c.firebaseapp.com",
  projectId: "pineapple-pizza-ee50c",
  storageBucket: "pineapple-pizza-ee50c.firebasestorage.app",
  messagingSenderId: "436843432306",
  appId: "1:436843432306:web:39b80e97b1dedc51c0f5eb",
  measurementId: "G-H5DEDSX7NR"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// Export auth for use in components
export { auth };

interface AuthContextType {
  user: User | null;
  userData: { nickname: string; email: string; weeklyTargetPoints: number } | null;
  loading: boolean;
  userDataInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserData: (data: Partial<{ nickname: string; email: string; weeklyTargetPoints: number }>) => Promise<void>;
  auth: any; // Firebase auth instance
  db: any; // Firestore db instance
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<{ nickname: string; email: string; weeklyTargetPoints: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [userDataInitialized, setUserDataInitialized] = useState(false);

  // Create db instance inside the component
  const db = getFirestore(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Ensure user document exists in Firestore
        const userDoc = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDoc);
        const userExists = userSnap.exists();
        const existingData = userSnap.data();
        
        const userDataToSet: any = {
          displayName: pendingName || user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          weeklyTargetPoints: 100,
        };
        
        // Only set createdAt for new users
        if (!userExists) {
          userDataToSet.createdAt = new Date();
        }
        
        // Only set nickname if it doesn't already exist or if we have a pending name
        if (pendingName) {
          userDataToSet.nickname = pendingName;
        } else if (!userExists || !existingData?.nickname) {
          userDataToSet.nickname = user.providerData[0]?.providerId === 'google.com' ? '' : (user.displayName || user.email?.split('@')[0] || 'User');
        }
        
        await setDoc(userDoc, userDataToSet, { merge: true });
        
        // Fetch user data
        const updatedUserSnap = await getDoc(userDoc);
        if (updatedUserSnap.exists()) {
          const data = updatedUserSnap.data();
          setUserData({
            nickname: data.nickname || '',
            email: data.email || '',
            weeklyTargetPoints: data.weeklyTargetPoints || 100,
          });
        }
        
        setPendingName(null);
        setUserDataInitialized(true);
      } else {
        setUserData(null);
        setUserDataInitialized(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [pendingName]);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, username: string) => {    if (!username || !username.trim()) {
      throw new Error('Username is required');
    }
        setPendingName(username);
    setUserDataInitialized(false); // Reset the flag
    await createUserWithEmailAndPassword(auth, email, password);
    
    // Wait for user data to be initialized
    return new Promise<void>((resolve) => {
      const checkInitialized = () => {
        if (userDataInitialized) {
          resolve();
        } else {
          setTimeout(checkInitialized, 100); // Check every 100ms
        }
      };
      checkInitialized();
    });
  };

  const googleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const updateUserData = async (data: Partial<{ nickname: string; email: string; weeklyTargetPoints: number }>) => {
    if (!user) return;
    const userDoc = doc(db, 'users', user.uid);
    await updateDoc(userDoc, data);
    // Update local state
    setUserData(prev => prev ? { ...prev, ...data } : null);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, userDataInitialized, login, signup, googleLogin, logout, updateUserData, auth, db }}>
      {children}
    </AuthContext.Provider>
  );
};