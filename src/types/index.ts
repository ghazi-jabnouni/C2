export interface Repository {
  id: string;
  name: string;
  gitUrl: string;
  branch: string;
  credentialId?: string | null;
  lastSync: string;
  status: 'synced' | 'syncing' | 'error';
  playbooks: string[];
}

export interface Credential {
  id: string;
  name: string;
  type: 'ssh_key' | 'vault_password' | 'cloud_token' | 'password' | 'microsoft' | 'token' | 'active_directory';
  username: string;
  sshKey?: string;
  vaultPassword?: string;
  sudoPassword?: string;
  password?: string;
  secretToken?: string;
  msClientId?: string;
  msClientSecret?: string;
  msTenant?: string;
  domain?: string;
  adAuthMethod?: 'ntlm' | 'kerberos' | 'credssp' | 'ldap';
  createdAt: string;
}

export interface Inventory {
  id: string;
  name: string;
  type: 'static' | 'dynamic';
  connectionType?: 'ssh' | 'winrm' | 'local';
  hostCount: number;
  inventoryContent: string;
  fileName?: string | null;
  filePath?: string | null;
  credentialId?: string | null;
  updatedAt: string;
}

export interface Environment {
  id: string;
  name: string;
  // Variables/secrets may be nested objects (groups), so allow any values
  variables: Record<string, any>;
  secrets: Record<string, any>;
  updatedAt: string;
}

export type DatabaseType = 'postgresql' | 'oracle' | 'mysql' | 'mssql' | 'redis' | 'mongodb' | 'infrastructure' | 'custom';

export interface DatabaseTypeRecord {
  id: string;
  key: DatabaseType | string;
  name: string;
  icon: string;
  color: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  type?: 'ansible' | 'terraform';
  provider?: string;
  terraformAction?: 'plan' | 'apply' | 'destroy';
  description: string;
  dbType?: DatabaseType;
  repositoryId: string;
  playbook: string;
  inventoryId: string;
  credentialId?: string | null;
  environmentId?: string | null;
  extraVars: string;
  limit: string;
  tags: string;
  allowCliArgs: boolean;
  totalRuns: number;
  lastRunStatus: 'never' | 'running' | 'success' | 'failed';
  lastRunAt: string | null;
  folderPath?: string;
  folderFiles?: string[];
}

export interface TaskExecution {
  id: string;
  templateId: string;
  templateName: string;
  type?: 'ansible' | 'terraform';
  provider?: string;
  terraformAction?: 'plan' | 'apply' | 'destroy';
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  duration: string;
  triggeredBy: string;
  inventoryName: string;
  playbook: string;
  extraVars?: string;
  limit?: string;
  hostsStats: {
    ok: number;
    changed: number;
    unreachable: number;
    failed: number;
    skipped: number;
  };
  logs: string[];
}

export interface Schedule {
  id: string;
  templateId: string;
  templateName: string;
  cron: string;
  cronHuman: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
}

export interface PendingRequest {
  id: string;
  clientName: string;
  clientIp: string;
  templateId: string;
  templateName: string;
  itemType?: 'template' | 'workflow';
  workflowId?: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  extraVars: Record<string, any>;
  reason: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  tokenFull: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'playbook' | 'approval' | 'notification' | 'hook' | 'end';
  templateId?: string;
  label: string;
  playbook?: string;
  hookUrl?: string;
  approvalMessage?: string;
  approvalDecision?: 'yes' | 'no';
  yesTargetNodeId?: string;
  noTargetNodeId?: string;
  x: number;
  y: number;
  status: 'idle' | 'running' | 'waiting_for_approval' | 'success' | 'failed' | 'skipped';
  simulateFailure?: boolean;
  executionHistory?: TaskExecution[];
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  type: 'always' | 'success' | 'failure';
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  duration: string;
  triggeredBy: string;
  totalStages: number;
  logs: string[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  executionHistory?: WorkflowExecution[];
  totalRuns: number;
  lastRunStatus: 'never' | 'running' | 'success' | 'failed';
  lastRunAt: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'Admin' | 'Operator' | 'Read-Only' | 'Requester';
  status: 'active' | 'inactive';
  lastLogin: string;
}

export interface DashboardStats {
  totalTemplates: number;
  totalInventories: number;
  totalTasksRun: number;
  runningTasks: number;
  successfulTasks: number;
  failedTasks: number;
  pendingApprovalsCount: number;
  activeSchedulesCount: number;
  recentTasks: TaskExecution[];
}

export interface AnsibleCollection {
  name: string;
  version: string;
}

export interface SystemInfo {
  ansible: {
    version: string;
    pythonVersion: string | null;
    configFile: string | null;
    available: boolean;
    rawFirstLine: string | null;
  };
  terraform: {
    version: string;
    available: boolean;
  };
  collections: AnsibleCollection[];
  platform: {
    nodeVersion: string;
    platform: string;
    arch: string;
    hostname: string;
    kernel: string;
    pythonVersion: string;
    uptime: number;
    memoryUsageMb: number;
  };
}
