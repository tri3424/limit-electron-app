import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/lib/db';
import { LOGIN_ROUTE } from '@/constants/routes';

const ADMIN_USERNAME = 'Subhadeep.Choudhury';
const ADMIN_PASSWORD = 'Yubi123454';

type UserRole = 'admin' | 'student' | null;

interface AuthUser {
  id?: string;
  username: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // Check for stored session
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
      } catch {
        localStorage.removeItem('currentUser');
      }
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // Check admin credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const adminUser: AuthUser = { username, role: 'admin' as UserRole };
      setUser(adminUser);
      localStorage.setItem('currentUser', JSON.stringify(adminUser));
      return true;
    }

    // Check student credentials
    const student = await db.users.where('username').equals(username).first();
    if (student && student.password === password) {
      const studentUser: AuthUser = { id: student.id, username, role: 'student' as UserRole };
      setUser(studentUser);
      localStorage.setItem('currentUser', JSON.stringify(studentUser));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
    window.location.hash = LOGIN_ROUTE;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

