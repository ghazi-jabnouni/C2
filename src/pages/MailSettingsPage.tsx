import React, { useEffect, useState } from 'react';
import { Archive, Check, Gauge, LoaderCircle, Mail, Save, Send, Server } from 'lucide-react';
import type { MailSettings, RuntimeSettings } from '../types';
import { api } from '../services/api';

const emptySettings: MailSettings = {
  host: '',
  port: 587,
  secure: false,
  username: '',
  fromAddress: '',
  passwordConfigured: false
};

const defaultRuntimeSettings: RuntimeSettings = {
  maxConcurrentTasks: 5,
  logRetentionDays: 0,
  serviceNames: []
};
export const MailSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<MailSettings>(emptySettings);
  const [password, setPassword] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(defaultRuntimeSettings);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([api.getMailSettings(), api.getRuntimeSettings()])
      .then(([mail, runtime]) => {
        setSettings(mail);
        setRuntimeSettings({
          ...defaultRuntimeSettings,
          ...runtime,
          serviceNames: Array.isArray(runtime.serviceNames) ? runtime.serviceNames : []
        });
      })
      .catch((error) => setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) }))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      const saved = await api.saveMailSettings({
        host: settings.host,
        port: Number(settings.port),
        secure: settings.secure,
        username: settings.username,
        fromAddress: settings.fromAddress,
        ...(password ? { password } : {})
      });
      setSettings(saved);
      setPassword('');
      setNotice({ kind: 'success', text: 'Mail settings saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSendingTest(true);
    setNotice(null);
    try {
      const result = await api.sendMailTest(testRecipient);
      setNotice({ kind: 'success', text: `${result.message} Message ID: ${result.messageId}` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSendingTest(false);
    }
  };

  const updateSetting = <K extends keyof MailSettings>(key: K, value: MailSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  if (isLoading) {
    return <div className="glass-panel" style={{ padding: 32, color: 'var(--text-muted)' }}>Loading mail settings...</div>;
  }

  const handleSaveRuntimeSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingRuntime(true);
    setNotice(null);
    try {
      const saved = await api.saveRuntimeSettings({
        maxConcurrentTasks: Number(runtimeSettings.maxConcurrentTasks),
        logRetentionDays: Number(runtimeSettings.logRetentionDays),
        serviceNames: runtimeSettings.serviceNames
      });
      setRuntimeSettings({
        ...defaultRuntimeSettings,
        ...saved,
        serviceNames: Array.isArray(saved.serviceNames) ? saved.serviceNames : runtimeSettings.serviceNames
      });
      setNotice({
        kind: 'success',
        text: `Runtime settings saved.${saved.deletedLogs ? ` Removed ${saved.deletedLogs} expired task or workflow run log(s).` : ''}`
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSavingRuntime(false);
    }
  };
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 920 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>Settings</h2>
        <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Mail delivery and task execution controls</p>
      </div>

      {notice && (
        <div role="status" style={{ padding: '10px 12px', borderRadius: 6, border: `1px solid ${notice.kind === 'success' ? '#10b981' : '#ef4444'}`, color: notice.kind === 'success' ? '#10b981' : '#ef4444', background: 'var(--bg-secondary)' }}>
          {notice.text}
        </div>
      )}

      <form className="glass-panel" onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
          <Server size={17} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 750 }}>SMTP server</h3>
          {settings.passwordConfigured && <span className="badge badge-success" style={{ marginLeft: 'auto' }}>PASSWORD SAVED</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
          <label className="form-label">
            SMTP host
            <input className="form-control" required value={settings.host} onChange={(event) => updateSetting('host', event.target.value)} placeholder="smtp.gmail.com" />
          </label>
          <label className="form-label">
            Port
            <input className="form-control" required type="number" min={1} max={65535} value={settings.port} onChange={(event) => updateSetting('port', Number(event.target.value))} />
          </label>
          <label className="form-label">
            SMTP username
            <input className="form-control" required autoComplete="username" value={settings.username} onChange={(event) => updateSetting('username', event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="form-label">
            From address
            <input className="form-control" required type="email" value={settings.fromAddress} onChange={(event) => updateSetting('fromAddress', event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="form-label">
            SMTP password / app password
            <input className="form-control" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={settings.passwordConfigured ? 'Leave blank to keep saved password' : 'Enter SMTP password'} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 22, color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.secure} onChange={(event) => updateSetting('secure', event.target.checked)} />
            Use secure TLS connection (port 465)
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? <LoaderCircle size={15} className="spin-slow" /> : <Save size={15} />}
            <span>{isSaving ? 'Saving...' : 'Save mail settings'}</span>
          </button>
        </div>
      </form>

      <form onSubmit={handleSendTest} className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
          <Mail size={17} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 750 }}>Send test email</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <label className="form-label" style={{ flex: '1 1 260px', margin: 0 }}>
            Recipient
            <input className="form-control" required type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="recipient@gmail.com" />
          </label>
          <button className="btn btn-secondary" type="submit" disabled={isSendingTest || !settings.passwordConfigured}>
            {isSendingTest ? <LoaderCircle size={15} className="spin-slow" /> : <Send size={15} />}
            <span>{isSendingTest ? 'Sending...' : 'Send test'}</span>
          </button>
          {settings.passwordConfigured && <Check size={15} color="#10b981" aria-label="SMTP password configured" />}
        </div>
      </form>

      <form onSubmit={handleSaveRuntimeSettings} className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
          <Gauge size={17} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 750 }}>Runtime controls</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
          <label className="form-label">
            Maximum concurrent tasks
            <input
              className="form-control"
              required
              type="number"
              min={1}
              max={100}
              step={1}
              value={runtimeSettings.maxConcurrentTasks}
              onChange={(event) => setRuntimeSettings((current) => ({ ...current, maxConcurrentTasks: Number(event.target.value) }))}
            />
            <span style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)', fontSize: '0.73rem', fontWeight: 400 }}>
              Applies immediately to manual, workflow, and scheduled task launches.
            </span>
          </label>
          <label className="form-label">
              Completed task and workflow log retention (days)
            <input
              className="form-control"
              required
              type="number"
              min={0}
              max={3650}
              step={1}
              value={runtimeSettings.logRetentionDays}
              onChange={(event) => setRuntimeSettings((current) => ({ ...current, logRetentionDays: Number(event.target.value) }))}
            />
            <span style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)', fontSize: '0.73rem', fontWeight: 400 }}>
              Enter 0 to keep history indefinitely. Saving a retention period prunes expired completed runs now and daily thereafter.
            </span>
          </label>
          <label className="form-label" style={{ gridColumn: '1 / -1' }}>
            Service names
            <textarea
              className="form-control"
              rows={3}
              value={runtimeSettings.serviceNames.join('\n')}
              onChange={(event) => setRuntimeSettings((current) => ({
                ...current,
                serviceNames: [...new Set(event.target.value.split('\n').map((name) => name.trim()).filter(Boolean))]
              }))}
              placeholder={'Application X\nCustomer Portal'}
            />
            <span style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)', fontSize: '0.73rem', fontWeight: 400 }}>
              One service per line. These names are suggested when starting a workflow.
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Archive size={14} /> Running tasks are never removed by log retention.
          </span>
          <button className="btn btn-primary" type="submit" disabled={isSavingRuntime}>
            {isSavingRuntime ? <LoaderCircle size={15} className="spin-slow" /> : <Save size={15} />}
            <span>{isSavingRuntime ? 'Saving...' : 'Save runtime settings'}</span>
          </button>
        </div>
      </form>

      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
        For Gmail, use smtp.gmail.com on port 587 with TLS off, and use a Google App Password instead of your account password.
      </p>
    </div>
  );
};