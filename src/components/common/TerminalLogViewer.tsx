import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Square,
  Copy,
  Download,
  Check,
  Search,
  ArrowDown,
  Maximize2,
  Minimize2,
  RefreshCw
} from 'lucide-react';
import type { TaskExecution } from '../../types';

interface TerminalLogViewerProps {
  task: TaskExecution | null;
  onCancel?: (taskId: string) => void;
  onRerun?: (templateId: string) => void;
}

export const TerminalLogViewer: React.FC<TerminalLogViewerProps> = ({
  task,
  onCancel,
  onRerun
}) => {
  const [logs, setLogs] = useState<string[]>(task?.logs || []);
  const [currentTask, setCurrentTask] = useState<TaskExecution | null>(task);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Sync state if task prop changes
  useEffect(() => {
    setCurrentTask(task);
    if (task) {
      setLogs(task.logs || []);
    }
  }, [task]);

  // Poll active backend API task logs for running tasks
  useEffect(() => {
    if (!task || !task.id) return;

    let isSubscribed = true;
    let pollInterval: any = null;

    // Fetch latest task logs from backend API
    const fetchLatestTaskLogs = async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}`);
        if (res.ok) {
          const updated = await res.json();
          if (isSubscribed && updated) {
            setCurrentTask(updated);
            if (Array.isArray(updated.logs) && updated.logs.length > 0) {
              setLogs(updated.logs);
            }
          }
        }
      } catch (_) {}
    };

    fetchLatestTaskLogs();

    // If task is running, poll every 500ms for live updates
    if (task.status === 'running') {
      pollInterval = setInterval(fetchLatestTaskLogs, 500);
    }

    // Connect WebSocket if supported
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?taskId=${task.id}`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INIT_TASK' && data.task) {
            setCurrentTask(data.task);
            if (data.task.logs) setLogs(data.task.logs);
          } else if (data.type === 'LOG_APPEND') {
            setLogs((prev) => [...prev, data.line]);
            if (data.hostsStats) {
              setCurrentTask((prev) => prev ? { ...prev, hostsStats: data.hostsStats } : prev);
            }
          } else if (data.type === 'TASK_FINISHED' || data.type === 'TASK_CANCELLED') {
            setCurrentTask(data.task);
            if (data.task.logs) setLogs(data.task.logs);
          }
        } catch (_) {}
      };
      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => setWsConnected(false);
    } catch (_) {}

    return () => {
      isSubscribed = false;
      if (pollInterval) clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, [task?.id, task?.status]);

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const getLogString = (l: any): string => {
    if (typeof l === 'string') return l;
    if (l && typeof l === 'object') return l.line || l.message || l.msg || JSON.stringify(l);
    return String(l ?? '');
  };

  const handleCopyLogs = () => {
    const textLogs = logs.map(getLogString).join('\n');
    navigator.clipboard.writeText(textLogs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const element = document.createElement('a');
    const textLogs = logs.map(getLogString).join('\n');
    const file = new Blob([textLogs], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `ansible-log-${currentTask?.id || 'execution'}.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const filteredLogs = searchQuery
    ? logs.filter((l) => getLogString(l).toLowerCase().includes(searchQuery.toLowerCase()))
    : logs;

  // Format line ANSI colors safely
  const formatLogLine = (rawLine: any) => {
    const line = getLogString(rawLine);
    if (line.startsWith('PLAY [') || line.startsWith('PLAY RECAP')) {
      return <span style={{ color: '#38bdf8', fontWeight: 700 }}>{line}</span>;
    }
    if (line.startsWith('TASK [')) {
      return <span style={{ color: '#818cf8', fontWeight: 600 }}>{line}</span>;
    }
    if (line.includes('ok:')) {
      return <span style={{ color: '#34d399' }}>{line}</span>;
    }
    if (line.includes('changed:')) {
      return <span style={{ color: '#fbbf24' }}>{line}</span>;
    }
    if (line.includes('fatal:') || line.includes('failed:') || line.includes('ABORTED')) {
      return <span style={{ color: '#f87171', fontWeight: 600 }}>{line}</span>;
    }
    if (line.includes('skipping:')) {
      return <span style={{ color: '#94a3b8' }}>{line}</span>;
    }
    return <span style={{ color: '#cbd5e1' }}>{line}</span>;
  };

  if (!currentTask) {
    return (
      <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Terminal size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
        <p style={{ fontWeight: 600, fontSize: '1rem' }}>No Execution Selected</p>
        <p style={{ fontSize: '0.85rem' }}>Select a task from history or launch a template to inspect live Ansible execution output.</p>
      </div>
    );
  }

  const isRunning = currentTask.status === 'running';

  return (
    <div
      className={`glass-panel animate-fade-in ${isFullScreen ? 'fullscreen-terminal' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--terminal-border)',
        ...(isFullScreen
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9999,
              borderRadius: 0
            }
          : { minHeight: 480, height: '620px' })
      }}
    >
      {/* Terminal Top Navigation Bar */}
      <div
        style={{
          backgroundColor: 'var(--terminal-header)',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--terminal-border)',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#10b981' }}></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>
              {currentTask.templateName}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              ({currentTask.id})
            </span>
          </div>

          <span
            className={`badge ${
              isRunning
                ? 'badge-running pulse-running'
                : currentTask.status === 'success'
                ? 'badge-success'
                : 'badge-danger'
            }`}
          >
            {isRunning ? 'RUNNING' : currentTask.status.toUpperCase()}
          </span>

          <span style={{ fontSize: '0.7rem', color: wsConnected ? '#10b981' : '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: wsConnected ? '#10b981' : '#64748b' }} />
            {wsConnected ? 'LIVE WS' : 'MOCK STREAM'}
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '4px 8px 4px 30px',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none',
                width: 150
              }}
            />
          </div>

          {/* Autoscroll Toggle */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              color: autoScroll ? '#38bdf8' : '#94a3b8',
              backgroundColor: autoScroll ? 'rgba(56, 189, 248, 0.15)' : undefined
            }}
            title="Toggle Autoscroll"
          >
            <ArrowDown size={14} />
            <span style={{ fontSize: '0.75rem' }}>Auto-scroll</span>
          </button>

          {/* Copy Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCopyLogs}
            title="Copy all logs"
            style={{ color: '#f8fafc' }}
          >
            {copied ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
            <span style={{ fontSize: '0.75rem' }}>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Download Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadLogs}
            title="Download log file"
            style={{ color: '#f8fafc' }}
          >
            <Download size={14} />
          </button>

          {/* Cancel Task */}
          {isRunning && onCancel && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onCancel(currentTask.id)}
            >
              <Square size={13} fill="white" />
              <span>Abort</span>
            </button>
          )}

          {/* Rerun Task */}
          {!isRunning && onRerun && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onRerun(currentTask.templateId)}
            >
              <RefreshCw size={13} />
              <span>Rerun</span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsFullScreen(!isFullScreen)}
            style={{ color: '#f8fafc' }}
          >
            {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Task Meta Sub-header */}
      <div
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          padding: '8px 18px',
          borderBottom: '1px solid var(--terminal-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.8rem',
          color: '#94a3b8',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>
            <strong style={{ color: '#cbd5e1' }}>Playbook:</strong> {currentTask.playbook}
          </span>
          <span>
            <strong style={{ color: '#cbd5e1' }}>Inventory:</strong> {currentTask.inventoryName}
          </span>
          <span>
            <strong style={{ color: '#cbd5e1' }}>Triggered by:</strong> {currentTask.triggeredBy}
          </span>
          <span>
            <strong style={{ color: '#cbd5e1' }}>Duration:</strong> {currentTask.duration}
          </span>
        </div>

        {/* Host Recap Stats Pill */}
        {currentTask.hostsStats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: '#34d399', fontSize: '0.75rem' }}>
              ok: {currentTask.hostsStats.ok}
            </span>
            <span style={{ color: '#fbbf24', fontSize: '0.75rem' }}>
              changed: {currentTask.hostsStats.changed}
            </span>
            <span style={{ color: '#f87171', fontSize: '0.75rem' }}>
              failed: {currentTask.hostsStats.failed}
            </span>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              unreachable: {currentTask.hostsStats.unreachable}
            </span>
          </div>
        )}
      </div>

      {/* Terminal Output Area */}
      <div
        ref={logContainerRef}
        style={{
          flex: 1,
          backgroundColor: 'var(--terminal-bg)',
          padding: '16px 20px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.825rem',
          lineHeight: '1.6',
          overflowY: 'auto',
          color: 'var(--terminal-text)'
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic', padding: 20 }}>
            {searchQuery ? `No lines matching "${searchQuery}"` : 'Initializing execution session...'}
          </div>
        ) : (
          filteredLogs.map((line, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: 16,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                padding: '1px 0'
              }}
            >
              <span
                style={{
                  userSelect: 'none',
                  color: 'var(--terminal-line-num)',
                  width: 32,
                  textAlign: 'right',
                  flexShrink: 0,
                  fontSize: '0.75rem'
                }}
              >
                {idx + 1}
              </span>
              <div style={{ flex: 1 }}>{formatLogLine(line)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
