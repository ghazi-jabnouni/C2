import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';
import { WorkflowDiagramPage } from './pages/WorkflowDiagramPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { InventoriesPage } from './pages/InventoriesPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { EnvironmentsPage } from './pages/EnvironmentsPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { PendingRequestsPage } from './pages/PendingRequestsPage';
import { ApiTokensPage } from './pages/ApiTokensPage';
import { UsersPage } from './pages/UsersPage';
import { DatabaseTypesPage } from './pages/DatabaseTypesPage';
import { RequestCatalogPage } from './pages/RequestCatalogPage';
import { SystemInfoPage } from './pages/SystemInfoPage';
import type { TaskTemplate, TaskExecution } from './types';

export const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) return hash;
    const saved = localStorage.getItem('app_current_tab');
    if (saved) return saved;
    return user?.role === 'Requester' ? 'request-catalog' : 'dashboard';
  });

  const [focusTaskId, setFocusTaskId] = useState<string | null>(() => {
    return localStorage.getItem('app_focus_task_id');
  });

  const [workflowId, setWorkflowId] = useState<string | null>(() => {
    return localStorage.getItem('app_workflow_id');
  });

  useEffect(() => {
    if (currentTab) {
      localStorage.setItem('app_current_tab', currentTab);
      if (window.location.hash !== `#${currentTab}`) {
        window.location.hash = currentTab;
      }
    }
  }, [currentTab]);

  useEffect(() => {
    if (focusTaskId) {
      localStorage.setItem('app_focus_task_id', focusTaskId);
    } else {
      localStorage.removeItem('app_focus_task_id');
    }
  }, [focusTaskId]);

  useEffect(() => {
    if (workflowId) {
      localStorage.setItem('app_workflow_id', workflowId);
    } else {
      localStorage.removeItem('app_workflow_id');
    }
  }, [workflowId]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && hash !== currentTab) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentTab]);

  const handleLaunchTemplate = (_tmpl: TaskTemplate) => {
    setCurrentTab('templates');
  };

  const handleInspectTask = (task: TaskExecution) => {
    setFocusTaskId(task.id);
    setCurrentTab('templates');
  };

  const handleTaskApproved = (taskId: string) => {
    setFocusTaskId(taskId);
    setCurrentTab('templates');
  };

  const handleOpenTemplates = (databaseType?: string) => {
    setFocusTaskId(null);
    setCurrentTab(databaseType ? `templates:${databaseType}` : 'templates');
  };

  const handleOpenWorkflowDiagram = (id: string) => {
    setWorkflowId(id);
    setCurrentTab('workflow-diagram');
  };

  const renderContent = () => {
    if (user?.role === 'Requester' && currentTab !== 'request-catalog' && currentTab !== 'pending-requests') {
      return <RequestCatalogPage />;
    }

    switch (currentTab) {
      case 'request-catalog':
        return <RequestCatalogPage />;
      case 'dashboard':
        return (
          <DashboardPage
            onNavigate={(tab) => setCurrentTab(tab)}
            onLaunchTemplate={handleLaunchTemplate}
            onInspectTask={handleInspectTask}
          />
        );
      case 'templates':
        return <TemplatesPage initialActiveTaskId={focusTaskId} />;
      case 'workflows':
        return <WorkflowBuilderPage onOpenWorkflowDiagram={handleOpenWorkflowDiagram} />;
      case 'workflow-diagram':
        return workflowId ? (
          <WorkflowDiagramPage 
            workflowId={workflowId} 
            onBack={() => setCurrentTab('workflows')} 
          />
        ) : (
          <WorkflowBuilderPage onOpenWorkflowDiagram={handleOpenWorkflowDiagram} />
        );
      case 'repositories':
        return <RepositoriesPage />;
      case 'inventories':
        return <InventoriesPage />;
      case 'credentials':
        return <CredentialsPage />;
      case 'environments':
        return <EnvironmentsPage />;
      case 'schedules':
        return <SchedulesPage />;
      case 'pending-requests':
        return <PendingRequestsPage onTaskApproved={handleTaskApproved} />;
      case 'api-tokens':
        return <ApiTokensPage />;
      case 'users':
        return <UsersPage />;
      case 'database-types':
        return <DatabaseTypesPage onOpenTemplates={(databaseType) => handleOpenTemplates(databaseType)} />;
      case 'system-info':
        return <SystemInfoPage />;
      default:
        if (currentTab.startsWith('templates:')) {
          return <TemplatesPage initialActiveTaskId={focusTaskId} initialDatabaseType={currentTab.slice('templates:'.length)} />;
        }
        return user?.role === 'Requester' ? (
          <RequestCatalogPage />
        ) : (
          <DashboardPage
            onNavigate={(tab) => setCurrentTab(tab)}
            onLaunchTemplate={handleLaunchTemplate}
            onInspectTask={handleInspectTask}
          />
        );
    }
  };
  return (
    <AppLayout
      currentTab={currentTab}
      onTabChange={(tab) => {
        setFocusTaskId(null);
        setWorkflowId(null);
        setCurrentTab(tab);
      }}
      onQuickLaunch={() => setCurrentTab('templates')}
    >
      {renderContent()}
    </AppLayout>
  );
};

const AppWithAuth: React.FC = () => {
  const { token } = useAuth();
  if (!token) return <LoginPage />;
  return <AppContent />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWithAuth />
      </AuthProvider>
    </ThemeProvider>
  );
}
