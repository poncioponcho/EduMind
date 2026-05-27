import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppSkeleton } from '@/components/Skeleton';
import { LandingPage } from '@/pages/LandingPage';
import { DiagnosisPage } from '@/pages/DiagnosisPage';
import { TeachingPage } from '@/pages/TeachingPage';
import { PathPage } from '@/pages/PathPage';
import { ReportPage } from '@/pages/ReportPage';
import { AdminPage } from '@/pages/AdminPage';
import { EvolvePage } from '@/pages/EvolvePage';
import { createUser, getCurrentUser } from '@/services/database';
import { initUserLearning } from '@/services/agentService';
import { initMockMode, IS_MOCK_MODE } from '@/config';
import type { User } from '@/types';

type Page = 'landing' | 'diagnosis' | 'teaching' | 'path' | 'report' | 'admin' | 'evolve';

function MockBanner() {
  const [visible, setVisible] = useState(true);

  if (!IS_MOCK_MODE || !visible) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center justify-center gap-3 text-sm">
      <span className="text-yellow-400 font-medium">
        ⚠️ 演示模式：知识诊断引擎为模拟数据。完整功能需启动后端服务。
      </span>
      <a
        href="https://github.com/poncioponcho/EduMind#本地部署"
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-400 underline text-xs hover:text-cyan-300"
      >
        部署说明
      </a>
      <button
        onClick={() => setVisible(false)}
        className="text-muted-foreground hover:text-white text-xs ml-2"
      >
        ✕
      </button>
    </div>
  );
}

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [navigateTo, setNavigateTo] = useState<Page | null>(null);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initMockMode();
      const existing = getCurrentUser();
      if (existing) {
        setUser(existing);
        initUserLearning(existing.id);
      }
      setAppReady(true);
    };
    init();
  }, []);

  if (!appReady) return <AppSkeleton />;

  const handleLogin = () => {
    if (!username.trim()) return;
    const newUser = createUser(username.trim(), 'logical');
    setUser(newUser);
    initUserLearning(newUser.id);
    setShowLogin(false);
    if (navigateTo) {
      setCurrentPage(navigateTo);
      setNavigateTo(null);
    }
  };

  const requireAuth = (page: Page) => {
    if (!user) {
      setNavigateTo(page);
      setShowLogin(true);
      return;
    }
    setCurrentPage(page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return (
          <LandingPage
            onStart={() => requireAuth('diagnosis')}
            onViewPath={() => requireAuth('path')}
            onViewReport={() => requireAuth('report')}
            onAdmin={() => setCurrentPage('admin')}
            user={user}
          />
        );
      case 'diagnosis':
        return user ? (
          <DiagnosisPage
            user={user}
            onComplete={() => setCurrentPage('teaching')}
            onNavigate={setCurrentPage}
          />
        ) : null;
      case 'teaching':
        return user ? (
          <TeachingPage user={user} onNavigate={setCurrentPage} />
        ) : null;
      case 'path':
        return user ? (
          <PathPage user={user} onNavigate={setCurrentPage} />
        ) : null;
      case 'report':
        return user ? (
          <ReportPage user={user} onNavigate={setCurrentPage} />
        ) : null;
      case 'admin':
        return <AdminPage onBack={() => setCurrentPage('landing')} />;
      case 'evolve':
        return <EvolvePage onNavigate={setCurrentPage} />;
      default:
        return <LandingPage onStart={() => requireAuth('diagnosis')} onViewPath={() => requireAuth('path')} onViewReport={() => requireAuth('report')} onAdmin={() => setCurrentPage('admin')} user={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MockBanner />
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage('landing')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="font-bold text-lg text-white">EduMind</span>
          </button>

          <div className="flex items-center gap-4">
            {user && currentPage !== 'landing' && (
              <div className="hidden md:flex items-center gap-2 text-sm">
                <button
                  onClick={() => setCurrentPage('diagnosis')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${currentPage === 'diagnosis' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}
                >
                  诊断
                </button>
                <button
                  onClick={() => setCurrentPage('teaching')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${currentPage === 'teaching' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}
                >
                  学习
                </button>
                <button
                  onClick={() => setCurrentPage('path')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${currentPage === 'path' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}
                >
                  路径
                </button>
                <button
                  onClick={() => setCurrentPage('report')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${currentPage === 'report' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}
                >
                  报告
                </button>
                <button
                  onClick={() => setCurrentPage('evolve')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${currentPage === 'evolve' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}
                >
                  🧬进化
                </button>
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
                  {user.username[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-muted-foreground hidden sm:block">{user.username}</span>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => { setNavigateTo(null); setShowLogin(true); }}
                className="bg-primary hover:bg-primary/90"
              >
                登录
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-14">
        {renderPage()}
      </main>

      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">开始学习之旅</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              请输入你的名字，AI教师团队将为你提供个性化辅导
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-white">名字</Label>
              <Input
                id="username"
                placeholder="请输入你的名字"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="bg-secondary border-border text-white"
                autoFocus
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={!username.trim()}
              className="w-full bg-primary hover:bg-primary/90"
            >
              开始学习
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
