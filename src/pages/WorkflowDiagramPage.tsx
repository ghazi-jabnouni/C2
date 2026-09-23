import React, { useState, useEffect } from 'react';
import {
  Play,
  Plus,
  CheckCircle2,
  RotateCcw,
  Activity,
  Terminal,
  X,
  GripVertical,
  Trash2,
  ArrowLeft,
  History,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Link2,
  ArrowRight,
  ShieldAlert,
  Bell,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import type { Workflow, WorkflowNode, WorkflowEdge, TaskTemplate, TaskExecution } from '../types';
import { api } from '../services/api';

interface WorkflowDiagramPageProps {
  workflowId?: string;
  onBack?: () => void;
}

// Helper to get ordinal suffix (1st Step, 2nd Step, 3rd Step, etc.)
const getOrdinalSuffix = (i: number): string => {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return `${i}st Step`;
  if (j === 2 && k !== 12) return `${i}nd Step`;
  if (j === 3 && k !== 13) return `${i}rd Step`;
  return `${i}th Step`;
};

// Topological ordering of nodes according to arrow connections (DAG order)
const getOrderedNodes = (nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] => {
  if (nodes.length <= 1) return nodes;

  const nodeMap = new Map<string, WorkflowNode>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  nodes.forEach((n) => {
    nodeMap.set(n.id, n);
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  });

  edges.forEach((e) => {
    if (nodeMap.has(e.from) && nodeMap.has(e.to)) {
      adj.get(e.from)?.push(e.to);
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const result: WorkflowNode[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currId = queue.shift()!;
    if (visited.has(currId)) continue;
    visited.add(currId);
    const node = nodeMap.get(currId);
    if (node) result.push(node);

    const neighbors = adj.get(currId) || [];
    neighbors.forEach((nextId) => {
      const currentInDegree = (inDegree.get(nextId) || 1) - 1;
      inDegree.set(nextId, currentInDegree);
      if (currentInDegree === 0) {
        queue.push(nextId);
      }
    });
  }

  // Append any disconnected or cycle-trapped nodes in original order
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      result.push(n);
    }
  });

  return result;
};

export const WorkflowDiagramPage: React.FC<WorkflowDiagramPageProps> = ({ workflowId, onBack }) => {
  
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedWf, setSelectedWf] = useState<Workflow | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [selectedNodeForHistory, setSelectedNodeForHistory] = useState<WorkflowNode | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // Connection / Link modal state
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectFromNodeId, setConnectFromNodeId] = useState<string>('');
  const [connectToNodeId, setConnectToNodeId] = useState<string>('');
  const [connectEdgeType, setConnectEdgeType] = useState<'success' | 'always' | 'failure'>('success');

  // Overall Workflow Execution History Modal State
  const [showWorkflowHistoryModal, setShowWorkflowHistoryModal] = useState(false);

  // Mouse dragging state for diagram nodes in all directions (Up, Down, Left, Right)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartRef = React.useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);
  const hasMovedRef = React.useRef<boolean>(false);

  // Zoom Controls State & Actions
  const [zoom, setZoom] = useState<number>(1);
  const handleZoomIn = () => setZoom((prev) => Math.min(2.2, Math.round((prev + 0.15) * 100) / 100));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.4, Math.round((prev - 0.15) * 100) / 100));
  const handleResetZoom = () => setZoom(1);

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };

  // Form for new node
  const [nodeType, setNodeType] = useState<'playbook' | 'approval' | 'notification'>('playbook');
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeTemplateId, setNodeTemplateId] = useState('');
  const [nodeApprovalMessage, setNodeApprovalMessage] = useState('Require operator approval before continuing');
  const [nodeYesTargetId, setNodeYesTargetId] = useState('');
  const [nodeNoTargetId, setNodeNoTargetId] = useState('');

  // Configuration Modal for existing Approval Gate
  const [configuringApprovalNode, setConfiguringApprovalNode] = useState<WorkflowNode | null>(null);
  const [configPromptMessage, setConfigPromptMessage] = useState('');
  const [configYesTargetId, setConfigYesTargetId] = useState('');
  const [configNoTargetId, setConfigNoTargetId] = useState('');

  // Active execution ref for manual approval pauses & resumes
  const executionStateRef = React.useRef<{
    nodes: WorkflowNode[];
    queue: string[];
    processed: Set<string>;
    startTime: number;
    currentApprovalNodeId: string | null;
    resumeWithDecision?: (decision: 'yes' | 'no') => void;
  } | null>(null);

  const loadData = async () => {
    if (!workflowId) return;
    try {
      const [wfs, tmpls] = await Promise.all([
        api.getWorkflows(),
        api.getTemplates()
      ]);
      
      const wf = wfs.find(w => w.id === workflowId);
      if (wf) {
        // Reset visual node runtime statuses to zero/idle on page load/refresh so it can run again
        // And sanitize ghost/deleted target IDs so routing works cleanly
        const validNodeIds = new Set((wf.nodes || []).map(n => n.id));
        const cleanNodes: WorkflowNode[] = (wf.nodes || []).map(n => ({
          ...n,
          status: 'idle',
          approvalDecision: undefined,
          yesTargetNodeId: n.yesTargetNodeId && validNodeIds.has(n.yesTargetNodeId) ? n.yesTargetNodeId : undefined,
          noTargetNodeId: n.noTargetNodeId && (n.noTargetNodeId === 'stop' || validNodeIds.has(n.noTargetNodeId)) ? n.noTargetNodeId : undefined
        }));
        wf.nodes = cleanNodes;

        // Ensure default execution history for initial demonstration if empty
        if (!wf.executionHistory || wf.executionHistory.length === 0) {
          wf.executionHistory = [
            {
              id: `wf-exec-demo-1`,
              workflowId: wf.id,
              workflowName: wf.name,
              status: 'success',
              startedAt: new Date(Date.now() - 3600000).toISOString(),
              finishedAt: new Date(Date.now() - 3585000).toISOString(),
              duration: '15s',
              triggeredBy: 'admin',
              totalStages: wf.nodes.length || 3,
              logs: [
                `[${new Date(Date.now() - 3600000).toLocaleTimeString()}] [WORKFLOW ENGINE] Initializing Multi-Playbook Pipeline: "${wf.name}"`,
                `[${new Date(Date.now() - 3600000).toLocaleTimeString()}] Directed Sequence: 1. Deploy Infrastructure ➔ 2. Install Packages ➔ 3. Health Check`,
                `[${new Date(Date.now() - 3595000).toLocaleTimeString()}] >> Executing 1st Step: Deploy Infrastructure`,
                `[${new Date(Date.now() - 3590000).toLocaleTimeString()}] [OK] 1st Step: Deploy Infrastructure passed successfully.`,
                `[${new Date(Date.now() - 3587000).toLocaleTimeString()}] >> Executing 2nd Step: Install Packages`,
                `[${new Date(Date.now() - 3585000).toLocaleTimeString()}] [WORKFLOW SUCCESS] Pipeline completed all connected stages successfully! ✨`
              ]
            }
          ];
        }
        setSelectedWf(wf);
      }
      setTemplates(tmpls);
      if (tmpls.length > 0 && !nodeTemplateId) {
        setNodeTemplateId(tmpls[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const persistWorkflow = async (workflow: Workflow) => {
    const updated = await api.updateWorkflow(workflow.id, workflow);
    setSelectedWf(updated);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: WorkflowNode) => {
    e.stopPropagation();
    hasMovedRef.current = false;
    setDraggingNodeId(node.id);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
  };

  // Window-level mouse movement for smooth 360° all-directional dragging (Up, Down, Left, Right)
  useEffect(() => {
    if (!draggingNodeId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !selectedWf) return;
      const currentZoom = zoom || 1;
      const deltaX = (e.clientX - dragStartRef.current.mouseX) / currentZoom;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) / currentZoom;

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        hasMovedRef.current = true;
      }

      const newX = Math.max(10, Math.min(2500, Math.round(dragStartRef.current.nodeX + deltaX)));
      const newY = Math.max(10, Math.min(2000, Math.round(dragStartRef.current.nodeY + deltaY)));

      setSelectedWf((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          nodes: prev.nodes.map((n) => n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n)
        };
      });
    };

    const handleMouseUp = () => {
      if (draggingNodeId && selectedWf) {
        if (hasMovedRef.current) {
          persistWorkflow(selectedWf);
        }
      }
      setDraggingNodeId(null);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNodeId, selectedWf, zoom]);

  const handleDropTemplate = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!selectedWf) return;
    const templateId = event.dataTransfer.getData('templateId');
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'playbook',
      label: template.name,
      templateId: template.id,
      playbook: template.playbook,
      x: 80 + (selectedWf.nodes.length % 3) * 250,
      y: 80 + Math.floor(selectedWf.nodes.length / 3) * 160,
      status: 'idle'
    };

    const prevNode = selectedWf.nodes[selectedWf.nodes.length - 1];
    const newEdges = [...selectedWf.edges];
    if (prevNode) {
      newEdges.push({
        id: `e-${Date.now()}`,
        from: prevNode.id,
        to: newNode.id,
        type: 'success'
      });
    }

    await persistWorkflow({
      ...selectedWf,
      nodes: [...selectedWf.nodes, newNode],
      edges: newEdges
    });
  };

  useEffect(() => {
    loadData();
  }, [workflowId]);

  const handleUpdateApprovalRouting = async (
    nodeId: string,
    yesTargetId?: string,
    noTargetId?: string,
    message?: string
  ) => {
    if (!selectedWf) return;

    const updatedNodes = selectedWf.nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          yesTargetNodeId: yesTargetId !== undefined ? (yesTargetId || undefined) : n.yesTargetNodeId,
          noTargetNodeId: noTargetId !== undefined ? (noTargetId || undefined) : n.noTargetNodeId,
          approvalMessage: message !== undefined ? message : n.approvalMessage
        };
      }
      return n;
    });

    const currentNode = updatedNodes.find(n => n.id === nodeId);
    // Remove existing outgoing edges from this approval gate
    let updatedEdges = selectedWf.edges.filter(e => e.from !== nodeId);

    // If YES target configured, add success edge to that target.
    // If not explicitly set (sequential), connect to next sequential node in canvas!
    const currNodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
    const nextSeqNode = updatedNodes[currNodeIndex + 1];
    const resolvedYesTarget = currentNode?.yesTargetNodeId || nextSeqNode?.id;

    if (resolvedYesTarget) {
      updatedEdges.push({
        id: `edge-${nodeId}-yes`,
        from: nodeId,
        to: resolvedYesTarget,
        type: 'success'
      });
    }

    // If NO target configured and not 'stop', add failure edge
    if (currentNode?.noTargetNodeId && currentNode.noTargetNodeId !== 'stop') {
      updatedEdges.push({
        id: `edge-${nodeId}-no`,
        from: nodeId,
        to: currentNode.noTargetNodeId,
        type: 'failure'
      });
    }

    const updated = {
      ...selectedWf,
      nodes: updatedNodes,
      edges: updatedEdges
    };

    setSelectedWf(updated);
    await persistWorkflow(updated);
  };

  const handleAddNode = () => {
    if (!selectedWf) return;
    const tmpl = templates.find((t) => t.id === nodeTemplateId);
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: nodeType,
      label: nodeLabel || (nodeType === 'approval' ? 'Manual Approval Gate' : tmpl ? tmpl.name : 'Pipeline Step'),
      approvalMessage: nodeType === 'approval' ? (nodeApprovalMessage || 'Require operator sign-off before proceeding') : undefined,
      yesTargetNodeId: nodeType === 'approval' && nodeYesTargetId ? nodeYesTargetId : undefined,
      noTargetNodeId: nodeType === 'approval' && nodeNoTargetId ? nodeNoTargetId : undefined,
      templateId: nodeType === 'playbook' ? nodeTemplateId : undefined,
      playbook: nodeType === 'playbook' && tmpl ? tmpl.playbook : undefined,
      x: (selectedWf.nodes.length + 1) * 230,
      y: 120,
      status: 'idle'
    };

    const prevNode = selectedWf.nodes[selectedWf.nodes.length - 1];
    const newEdges = [...selectedWf.edges];
    if (prevNode) {
      newEdges.push({
        id: `e-${Date.now()}`,
        from: prevNode.id,
        to: newNode.id,
        type: 'success'
      });
    }

    if (nodeType === 'approval') {
      if (nodeYesTargetId) {
        newEdges.push({
          id: `e-${newNode.id}-yes`,
          from: newNode.id,
          to: nodeYesTargetId,
          type: 'success'
        });
      }
      if (nodeNoTargetId && nodeNoTargetId !== 'stop') {
        newEdges.push({
          id: `e-${newNode.id}-no`,
          from: newNode.id,
          to: nodeNoTargetId,
          type: 'failure'
        });
      }
    }

    const updated = {
      ...selectedWf,
      nodes: [...selectedWf.nodes, newNode],
      edges: newEdges
    };

    setSelectedWf(updated);
    api.updateWorkflow(updated.id, updated).catch((error) => console.error('Failed to save workflow node:', error));
    setShowAddNodeModal(false);
    setNodeLabel('');
    setNodeYesTargetId('');
    setNodeNoTargetId('');
  };

  const handleOpenConnectModal = (fromNodeId?: string, defaultType: 'success' | 'always' | 'failure' = 'success') => {
    if (!selectedWf || selectedWf.nodes.length === 0) {
      alert('Add a node to your canvas first before creating AWX branch connections.');
      return;
    }
    const sourceId = fromNodeId || selectedWf.nodes[0].id;
    const availableTargets = selectedWf.nodes.filter(n => n.id !== sourceId);
    setConnectFromNodeId(sourceId);
    setConnectToNodeId(availableTargets.length > 0 ? availableTargets[0].id : '');
    setConnectEdgeType(defaultType);
    setShowConnectModal(true);
  };

  const handleCreateAndConnectNewNode = async (templateId: string, edgeType: 'success' | 'failure' | 'always') => {
    if (!selectedWf || !connectFromNodeId) return;
    const sourceNode = selectedWf.nodes.find(n => n.id === connectFromNodeId);
    const template = templates.find(t => t.id === templateId);
    if (!sourceNode || !template) return;

    // Determine vertical offset based on edge type for visual layout
    const yOffset = edgeType === 'failure' ? 140 : edgeType === 'success' ? -40 : 50;
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'playbook',
      label: template.name,
      templateId: template.id,
      playbook: template.playbook,
      x: sourceNode.x + 280,
      y: Math.max(50, sourceNode.y + yOffset),
      status: 'idle'
    };

    const newEdge: WorkflowEdge = {
      id: `edge-${Date.now()}`,
      from: sourceNode.id,
      to: newNode.id,
      type: edgeType
    };

    const updatedWorkflow = {
      ...selectedWf,
      nodes: [...selectedWf.nodes, newNode],
      edges: [...selectedWf.edges, newEdge]
    };

    await persistWorkflow(updatedWorkflow);
    setShowConnectModal(false);
  };

  const handleCreateAndConnectApprovalNode = async (fromNodeId: string, edgeType: 'success' | 'failure' | 'always') => {
    if (!selectedWf) return;
    const sourceNode = selectedWf.nodes.find(n => n.id === fromNodeId);
    if (!sourceNode) return;

    const yOffset = edgeType === 'failure' ? 140 : edgeType === 'success' ? -40 : 50;
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'approval',
      label: 'Manual Approval Gate',
      approvalMessage: 'Require operator approval to proceed with deployment',
      x: sourceNode.x + 280,
      y: Math.max(50, sourceNode.y + yOffset),
      status: 'idle'
    };

    const newEdge: WorkflowEdge = {
      id: `edge-${Date.now()}`,
      from: sourceNode.id,
      to: newNode.id,
      type: edgeType
    };

    const updatedWorkflow = {
      ...selectedWf,
      nodes: [...selectedWf.nodes, newNode],
      edges: [...selectedWf.edges, newEdge]
    };

    await persistWorkflow(updatedWorkflow);
    setShowConnectModal(false);
  };

  const handleCreateAndConnectWebhookNode = async (fromNodeId: string, edgeType: 'success' | 'failure' | 'always') => {
    if (!selectedWf) return;
    const sourceNode = selectedWf.nodes.find(n => n.id === fromNodeId);
    if (!sourceNode) return;

    const yOffset = edgeType === 'failure' ? 140 : edgeType === 'success' ? -40 : 50;
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'notification',
      label: 'Webhook / Slack Alert',
      hookUrl: 'https://hooks.slack.com/services/workflow-notify',
      x: sourceNode.x + 280,
      y: Math.max(50, sourceNode.y + yOffset),
      status: 'idle'
    };

    const newEdge: WorkflowEdge = {
      id: `edge-${Date.now()}`,
      from: sourceNode.id,
      to: newNode.id,
      type: edgeType
    };

    const updatedWorkflow = {
      ...selectedWf,
      nodes: [...selectedWf.nodes, newNode],
      edges: [...selectedWf.edges, newEdge]
    };

    await persistWorkflow(updatedWorkflow);
    setShowConnectModal(false);
  };

  const runDownstreamExecution = (
    startNodeId: string,
    initialNodes: WorkflowNode[],
    edges: WorkflowEdge[],
    decision: 'yes' | 'no',
    approvalLabel: string
  ) => {
    if (!selectedWf) return;
    const currentWf = selectedWf;
    const startTime = Date.now();
    let accumulatedLogs: string[] = [
      ...(executionLogs.length > 0 ? executionLogs : []),
      `[${new Date().toLocaleTimeString()}] ${decision === 'yes' ? '✅ [APPROVAL GRANTED]' : '❌ [APPROVAL REJECTED]'} Operator submitted ${decision.toUpperCase()} for "${approvalLabel}".`,
      `[${new Date().toLocaleTimeString()}] 🟢 Resuming pipeline execution at next stage...`
    ];

    const appendLogs = (lines: string[]) => {
      accumulatedLogs = [...accumulatedLogs, ...lines];
      setExecutionLogs((prev) => [...prev, ...lines]);
    };

    setIsRunning(true);
    setExecutionLogs(accumulatedLogs);

    let nodes = initialNodes.map((n) => n.id === startNodeId ? { ...n, status: 'idle' as const } : n);
    let queue: string[] = [startNodeId];
    const processed = new Set<string>();

    function processDownstreamQueue() {
      if (queue.length === 0) {
        const endTime = Date.now();
        const elapsedSec = Math.max(1, Math.round((endTime - startTime) / 1000));
        const durationStr = elapsedSec > 60 ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s` : `${elapsedSec}s`;
        const hasFailedNode = nodes.some((n) => n.status === 'failed');
        const overallStatus = hasFailedNode ? ('failed' as const) : ('success' as const);
        const completionLog = overallStatus === 'success'
          ? `[${new Date().toLocaleTimeString()}] [WORKFLOW SUCCESS] Pipeline completed all active branch stages successfully! ✨`
          : `[${new Date().toLocaleTimeString()}] [WORKFLOW FINISHED] Pipeline execution ended with branch failures / error handling handled.`;

        appendLogs([completionLog]);
        setIsRunning(false);

        const newExecution = {
          id: `wf-exec-${Date.now()}`,
          workflowId: currentWf.id,
          workflowName: currentWf.name,
          status: overallStatus,
          startedAt: new Date(startTime).toISOString(),
          finishedAt: new Date(endTime).toISOString(),
          duration: durationStr,
          triggeredBy: 'admin',
          totalStages: nodes.filter((n) => n.status !== 'idle' && n.status !== 'skipped').length,
          logs: [...accumulatedLogs]
        };

        const updatedHistory = [newExecution, ...(currentWf.executionHistory || [])];
        const updatedWf: Workflow = {
          ...currentWf,
          nodes: [...nodes],
          executionHistory: updatedHistory,
          totalRuns: (currentWf.totalRuns || 0) + 1,
          lastRunStatus: overallStatus,
          lastRunAt: new Date(endTime).toISOString()
        };

        setSelectedWf(updatedWf);
        persistWorkflow(updatedWf);
        return;
      }

      const currNodeId = queue.shift()!;
      if (processed.has(currNodeId)) {
        setTimeout(processDownstreamQueue, 100);
        return;
      }
      processed.add(currNodeId);

      const currNode = nodes.find((n) => n.id === currNodeId);
      if (!currNode) {
        setTimeout(processDownstreamQueue, 100);
        return;
      }

      if (currNode.type === 'approval') {
        nodes = nodes.map((n) => n.id === currNodeId ? { ...n, status: 'waiting_for_approval' as const } : n);
        setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));
        appendLogs([
          `[${new Date().toLocaleTimeString()}] ⏸️ [MANUAL APPROVAL GATE REACHED] Workflow paused at "${currNode.label}".`,
          `[${new Date().toLocaleTimeString()}] 🛡️ Operator decision required:`
        ]);
        return;
      }

      nodes = nodes.map((n) => n.id === currNodeId ? { ...n, status: 'running' as const } : n);
      setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

      appendLogs([
        `[${new Date().toLocaleTimeString()}] >> Executing Node: ${currNode.label} (${currNode.type.toUpperCase()})`
      ]);

      if (currNode.playbook) {
        appendLogs([
          `[${new Date().toLocaleTimeString()}] [FETCH] Playbook file: ${currNode.playbook}`,
          `[${new Date().toLocaleTimeString()}] [EXECUTE] Running playbook tasks...`
        ]);
      }

      setTimeout(() => {
        const isSimulatedFail = !!currNode.simulateFailure;
        const outcomeStatus: WorkflowNode['status'] = isSimulatedFail ? 'failed' : 'success';

        if (isSimulatedFail) {
          appendLogs([
            `[${new Date().toLocaleTimeString()}] [FATAL ERROR] Task "${currNode.label}" failed! (Simulated Failure Mode active)`,
            `[${new Date().toLocaleTimeString()}] [BRANCH ENGINE] Triggering ON FAILURE & ALWAYS branches...`
          ]);
        } else {
          appendLogs([
            `[${new Date().toLocaleTimeString()}] [OK] Task "${currNode.label}" passed successfully!`,
            `[${new Date().toLocaleTimeString()}] [BRANCH ENGINE] Triggering ON SUCCESS & ALWAYS branches...`
          ]);
        }

        nodes = nodes.map((n) => n.id === currNodeId ? { ...n, status: outcomeStatus } : n);
        setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

        const outgoingEdges = edges.filter((e) => e.from === currNodeId);
        outgoingEdges.forEach((edge) => {
          const targetNode = nodes.find((n) => n.id === edge.to);
          if (!targetNode) return;

          const shouldFollow =
            (outcomeStatus === 'success' && (edge.type === 'success' || edge.type === 'always')) ||
            (outcomeStatus === 'failed' && (edge.type === 'failure' || edge.type === 'always'));

          if (shouldFollow) {
            if (!processed.has(edge.to) && !queue.includes(edge.to)) {
              queue.push(edge.to);
              appendLogs([
                `[${new Date().toLocaleTimeString()}] ➔ Following branch [${edge.type.toUpperCase()}] to next step: "${targetNode.label}"`
              ]);
            }
          } else {
            if (!processed.has(edge.to)) {
              nodes = nodes.map((n) => n.id === edge.to ? { ...n, status: 'skipped' as const } : n);
              appendLogs([
                `[${new Date().toLocaleTimeString()}] 🚫 [BRANCH BYPASS] Skipping step "${targetNode.label}"`
              ]);
            }
          }
        });

        setTimeout(processDownstreamQueue, 1200);
      }, 1500);
    }

    setTimeout(processDownstreamQueue, 200);
  };

  const handleApprovalDecision = (nodeId: string, decision: 'yes' | 'no') => {
    // 1. Immediately resume execution engine without any latency or blocking if active in ref
    if (executionStateRef.current && executionStateRef.current.currentApprovalNodeId === nodeId) {
      const resumeFn = executionStateRef.current.resumeWithDecision;
      if (resumeFn) {
        resumeFn(decision);
        if (workflowId) {
          api.submitWorkflowApproval(workflowId, nodeId, decision).catch((e) => {
            console.warn('Background approval sync notice:', e);
          });
        }
        return;
      }
    }

    // 2. Fallback / Standalone execution: advance and execute downstream tasks directly
    if (selectedWf) {
      const outcomeStatus: WorkflowNode['status'] = decision === 'yes' ? 'success' : 'failed';
      const updatedNodes = selectedWf.nodes.map((n) =>
        n.id === nodeId ? { ...n, status: outcomeStatus, approvalDecision: decision } : n
      );
      const updated = { ...selectedWf, nodes: updatedNodes };
      setSelectedWf(updated);
      persistWorkflow(updated);

      const currNode = selectedWf.nodes.find((n) => n.id === nodeId);
      const ordered = getOrderedNodes(selectedWf.nodes, selectedWf.edges);
      let targetNodeId: string | undefined;

      if (decision === 'yes') {
        const liveTarget = currNode?.yesTargetNodeId;
        if (liveTarget && selectedWf.nodes.some((n) => n.id === liveTarget)) {
          targetNodeId = liveTarget;
        } else {
          const outEdge = selectedWf.edges.find((e) => e.from === nodeId && (e.type === 'success' || e.type === 'always'));
          if (outEdge) {
            targetNodeId = outEdge.to;
          } else {
            const currIdx = ordered.findIndex((n) => n.id === nodeId);
            const nextNode = ordered[currIdx + 1];
            if (nextNode) targetNodeId = nextNode.id;
          }
        }
      } else {
        const liveTarget = currNode?.noTargetNodeId;
        if (liveTarget && liveTarget !== 'stop' && selectedWf.nodes.some((n) => n.id === liveTarget)) {
          targetNodeId = liveTarget;
        } else {
          const outEdge = selectedWf.edges.find((e) => e.from === nodeId && (e.type === 'failure' || e.type === 'always'));
          if (outEdge) targetNodeId = outEdge.to;
        }
      }

      if (targetNodeId) {
        runDownstreamExecution(targetNodeId, updatedNodes, selectedWf.edges, decision, currNode?.label || 'Approval Gate');
      } else if (decision === 'no') {
        const finishedNodes = updatedNodes.map((n) => n.id !== nodeId && n.status === 'idle' ? { ...n, status: 'skipped' as const } : n);
        const finishedWf = { ...selectedWf, nodes: finishedNodes };
        setSelectedWf(finishedWf);
        persistWorkflow(finishedWf);
      }
    }

    // Sync to backend asynchronously in background
    if (workflowId) {
      api.submitWorkflowApproval(workflowId, nodeId, decision).catch((e) => {
        console.warn('Background approval sync notice:', e);
      });
    }
  };

  const handleSaveConnection = async () => {
    if (!selectedWf || !connectFromNodeId || !connectToNodeId) return;
    if (connectFromNodeId === connectToNodeId) {
      alert('Cannot connect a task node to itself.');
      return;
    }

    // Check if edge already exists
    const existingIndex = selectedWf.edges.findIndex(
      (e) => e.from === connectFromNodeId && e.to === connectToNodeId
    );

    let updatedEdges = [...selectedWf.edges];
    if (existingIndex >= 0) {
      updatedEdges[existingIndex] = {
        ...updatedEdges[existingIndex],
        type: connectEdgeType
      };
    } else {
      updatedEdges.push({
        id: `edge-${Date.now()}`,
        from: connectFromNodeId,
        to: connectToNodeId,
        type: connectEdgeType
      });
    }

    const updatedWorkflow = { ...selectedWf, edges: updatedEdges };
    await persistWorkflow(updatedWorkflow);
    setShowConnectModal(false);
  };

  const handleDeleteEdge = async (edgeId: string) => {
    if (!selectedWf) return;
    const updated = {
      ...selectedWf,
      edges: selectedWf.edges.filter((e) => e.id !== edgeId)
    };
    await persistWorkflow(updated);
  };

  const handleResetWorkflow = async () => {
    if (!selectedWf) return;
    executionStateRef.current = null;
    setIsRunning(false);
    setExecutionLogs([]);
    const resetNodes: WorkflowNode[] = selectedWf.nodes.map((n) => ({
      ...n,
      status: 'idle',
      approvalDecision: undefined
    }));
    const updated = { ...selectedWf, nodes: resetNodes };
    setSelectedWf(updated);
    await persistWorkflow(updated);
  };

  const toggleSimulateFailure = (nodeId: string) => {
    if (!selectedWf) return;
    const updated = {
      ...selectedWf,
      nodes: selectedWf.nodes.map(n => n.id === nodeId ? { ...n, simulateFailure: !n.simulateFailure } : n)
    };
    persistWorkflow(updated);
  };

  const handleRunWorkflow = () => {
    if (!selectedWf || isRunning) return;
    const currentWf = selectedWf;
    
    if (currentWf.nodes.length === 0) {
      setExecutionLogs([
        `[${new Date().toLocaleTimeString()}] [ERROR] No nodes to execute in workflow. Add playbook nodes first.`
      ]);
      return;
    }

    const orderedNodes = getOrderedNodes(currentWf.nodes, currentWf.edges);
    const startTime = Date.now();
    let accumulatedLogs: string[] = [];

    const appendLogs = (lines: string[]) => {
      accumulatedLogs = [...accumulatedLogs, ...lines];
      setExecutionLogs((prev) => [...prev, ...lines]);
    };

    setIsRunning(true);
    const initialLines = [
      `[${new Date().toLocaleTimeString()}] [WORKFLOW ENGINE] Initializing Multi-Playbook Pipeline: "${currentWf.name}"`,
      `[${new Date().toLocaleTimeString()}] Evaluating Branch Conditions: [ON SUCCESS ✓], [ON FAILURE ✕], [ALWAYS]`,
      `[${new Date().toLocaleTimeString()}] Total DAG nodes in canvas: ${orderedNodes.length} nodes`,
      `[${new Date().toLocaleTimeString()}] Starting conditional execution graph...`
    ];
    accumulatedLogs = [...initialLines];
    setExecutionLogs(initialLines);

    // Initial state: reset all node statuses and clear prior decisions
    let nodes: WorkflowNode[] = currentWf.nodes.map(n => ({
      ...n,
      status: 'idle',
      approvalDecision: undefined
    }));
    setSelectedWf(prev => prev ? { ...prev, nodes: [...nodes] } : null);

    // Find starting nodes (nodes with no incoming edges or dependencies)
    const hasIncoming = new Set(currentWf.edges.map((e) => e.to));
    currentWf.nodes.forEach((n) => {
      if (n.yesTargetNodeId) hasIncoming.add(n.yesTargetNodeId);
      if (n.noTargetNodeId && n.noTargetNodeId !== 'stop') hasIncoming.add(n.noTargetNodeId);
    });
    let queue = orderedNodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
    if (queue.length === 0 && orderedNodes.length > 0) {
      queue = [orderedNodes[0].id];
    }

    const processed = new Set<string>();

    function processQueue() {
      if (queue.length === 0) {
        const endTime = Date.now();
        const elapsedSec = Math.max(1, Math.round((endTime - startTime) / 1000));
        const durationStr = elapsedSec > 60 ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s` : `${elapsedSec}s`;
        const hasFailedNode = nodes.some(n => n.status === 'failed');
        const overallStatus = hasFailedNode ? ('failed' as const) : ('success' as const);
        const completionLog = overallStatus === 'success'
          ? `[${new Date().toLocaleTimeString()}] [WORKFLOW SUCCESS] Pipeline completed all active branch stages successfully! ✨`
          : `[${new Date().toLocaleTimeString()}] [WORKFLOW FINISHED] Pipeline execution ended with branch failures / error handling handled.`;
        
        appendLogs([completionLog]);
        setIsRunning(false);

        const newExecution = {
          id: `wf-exec-${Date.now()}`,
          workflowId: currentWf.id,
          workflowName: currentWf.name,
          status: overallStatus,
          startedAt: new Date(startTime).toISOString(),
          finishedAt: new Date(endTime).toISOString(),
          duration: durationStr,
          triggeredBy: 'admin',
          totalStages: nodes.filter(n => n.status !== 'idle' && n.status !== 'skipped').length,
          logs: [...accumulatedLogs]
        };

        const updatedHistory = [newExecution, ...(currentWf.executionHistory || [])];
        const updatedWf: Workflow = {
          ...currentWf,
          nodes: [...nodes],
          executionHistory: updatedHistory,
          totalRuns: (currentWf.totalRuns || 0) + 1,
          lastRunStatus: overallStatus,
          lastRunAt: new Date(endTime).toISOString()
        };

        setSelectedWf(updatedWf);
        persistWorkflow(updatedWf);
        return;
      }

      const currNodeId = queue.shift()!;
      if (processed.has(currNodeId)) {
        setTimeout(processQueue, 100);
        return;
      }
      processed.add(currNodeId);

      const currNode = nodes.find(n => n.id === currNodeId);
      if (!currNode) {
        setTimeout(processQueue, 100);
        return;
      }

      // If approval gate, pause execution and wait for operator decision
      if (currNode.type === 'approval') {
        nodes = nodes.map(n => n.id === currNodeId ? { ...n, status: 'waiting_for_approval' as WorkflowNode['status'] } : n);
        setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

        const yesTarget = nodes.find(n => n.id === currNode.yesTargetNodeId);
        const noTarget = nodes.find(n => n.id === currNode.noTargetNodeId);
        const yesLabel = yesTarget ? yesTarget.label : 'Étape suivante';
        const noLabel = noTarget ? noTarget.label : (currNode.noTargetNodeId === 'stop' || !currNode.noTargetNodeId ? 'Arrêter le workflow' : 'Étape alternative');

        appendLogs([
          `[${new Date().toLocaleTimeString()}] ⏸️ [MANUAL APPROVAL GATE REACHED] Workflow paused at "${currNode.label}".`,
          `[${new Date().toLocaleTimeString()}] 🛡️ Operator decision required:`,
          `[${new Date().toLocaleTimeString()}]    🟢 [YES] ➔ Passer à : ${yesLabel}`,
          `[${new Date().toLocaleTimeString()}]    🔴 [NO] ➔ Passer à : ${noLabel}`
        ]);

        executionStateRef.current = {
          nodes,
          queue,
          processed,
          startTime,
          currentApprovalNodeId: currNodeId,
          resumeWithDecision: (decision: 'yes' | 'no') => {
            const outcomeStatus: WorkflowNode['status'] = decision === 'yes' ? 'success' : 'failed';
            nodes = nodes.map(n => n.id === currNodeId ? { ...n, status: outcomeStatus, approvalDecision: decision } : n);
            setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

            let branchFollowed = false;

            if (decision === 'yes') {
              appendLogs([
                `[${new Date().toLocaleTimeString()}] ✅ [APPROVAL GRANTED] Operator submitted YES/APPROVED for "${currNode.label}".`,
                `[${new Date().toLocaleTimeString()}] 🟢 Branching to configured step: "${yesLabel}"...`
              ]);

              // Read yesTargetNodeId from the live nodes array (not stale currNode)
              const liveApprovalNode = nodes.find(n => n.id === currNodeId);
              const resolvedYesTarget = liveApprovalNode?.yesTargetNodeId || currNode.yesTargetNodeId;

              // 1. If explicit YES target configured, enqueue it
              if (resolvedYesTarget && nodes.some(n => n.id === resolvedYesTarget)) {
                processed.delete(resolvedYesTarget);
                nodes = nodes.map(n => n.id === resolvedYesTarget ? { ...n, status: 'idle' } : n);
                if (!queue.includes(resolvedYesTarget)) {
                  queue.push(resolvedYesTarget);
                  branchFollowed = true;
                }
              }

              // 2. Outgoing success/always edges from the approval node (use currentWf.edges — never stale)
              if (!branchFollowed) {
                const outgoingEdges = currentWf.edges.filter(
                  e => e.from === currNodeId && (e.type === 'success' || e.type === 'always')
                );
                outgoingEdges.forEach(edge => {
                  processed.delete(edge.to);
                  nodes = nodes.map(n => n.id === edge.to ? { ...n, status: 'idle' } : n);
                  if (!queue.includes(edge.to)) {
                    queue.push(edge.to);
                    branchFollowed = true;
                  }
                });
              }

              // 3. Fallback: find the very next node in topological order
              if (!branchFollowed) {
                const currIdx = orderedNodes.findIndex(n => n.id === currNodeId);
                const nextSeqNode = orderedNodes.slice(currIdx + 1).find(n => n.id !== currNodeId);
                if (nextSeqNode) {
                  processed.delete(nextSeqNode.id);
                  nodes = nodes.map(n => n.id === nextSeqNode.id ? { ...n, status: 'idle' } : n);
                  if (!queue.includes(nextSeqNode.id)) {
                    queue.push(nextSeqNode.id);
                    branchFollowed = true;
                  }
                }
              }
            } else {
              // Decision is 'no'
              appendLogs([
                `[${new Date().toLocaleTimeString()}] ❌ [APPROVAL REJECTED] Operator submitted NO/REJECTED for "${currNode.label}".`,
                `[${new Date().toLocaleTimeString()}] 🔴 Branching to configured alternate step: "${noLabel}"...`
              ]);

              // 1. If noTargetNodeId configured and not 'stop', enqueue it
              if (currNode.noTargetNodeId && currNode.noTargetNodeId !== 'stop' && nodes.some(n => n.id === currNode.noTargetNodeId)) {
                if (!processed.has(currNode.noTargetNodeId) && !queue.includes(currNode.noTargetNodeId)) {
                  queue.push(currNode.noTargetNodeId);
                  branchFollowed = true;
                }
              }

              // 2. Outgoing failure/always edges (use currentWf.edges — never stale)
              if (!branchFollowed) {
                const outgoingEdges = currentWf.edges.filter(
                  e => e.from === currNodeId && (e.type === 'failure' || e.type === 'always')
                );
                outgoingEdges.forEach(edge => {
                  if (!processed.has(edge.to) && !queue.includes(edge.to)) {
                    queue.push(edge.to);
                    branchFollowed = true;
                  }
                });
              }

              // If NO branch was taken or set to stop, mark unreached downstream nodes as skipped
              if (!branchFollowed) {
                nodes = nodes.map(n => (!processed.has(n.id) && n.id !== currNodeId && n.status === 'idle') ? { ...n, status: 'skipped' as WorkflowNode['status'] } : n);
                setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));
              }
            }

            executionStateRef.current = null;
            setTimeout(processQueue, 400);
          }
        };
        return;
      }

      // Mark running
      nodes = nodes.map(n => n.id === currNodeId ? { ...n, status: 'running' as WorkflowNode['status'] } : n);
      setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

      appendLogs([
        `[${new Date().toLocaleTimeString()}] >> Executing Node: ${currNode.label} (${currNode.type.toUpperCase()})`
      ]);

      if (currNode.playbook) {
        appendLogs([
          `[${new Date().toLocaleTimeString()}] [FETCH] Playbook file: ${currNode.playbook}`,
          `[${new Date().toLocaleTimeString()}] [EXECUTE] Running playbook tasks...`
        ]);
      }

      setTimeout(() => {
        const isSimulatedFail = !!currNode.simulateFailure;
        const outcomeStatus: WorkflowNode['status'] = isSimulatedFail ? 'failed' : 'success';

        if (isSimulatedFail) {
          appendLogs([
            `[${new Date().toLocaleTimeString()}] [FATAL ERROR] Task "${currNode.label}" failed! (Simulated Failure Mode active)`,
            `[${new Date().toLocaleTimeString()}] [BRANCH ENGINE] Triggering ON FAILURE (🔴 Red Arrow) & ALWAYS branches...`
          ]);
        } else {
          appendLogs([
            `[${new Date().toLocaleTimeString()}] [OK] Task "${currNode.label}" passed successfully!`,
            `[${new Date().toLocaleTimeString()}] [BRANCH ENGINE] Triggering ON SUCCESS (🟢 Green Arrow) & ALWAYS branches...`
          ]);
        }

        nodes = nodes.map(n => n.id === currNodeId ? { ...n, status: outcomeStatus } : n);
        setSelectedWf((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

        // Evaluate outgoing edges
        const outgoingEdges = currentWf.edges.filter(e => e.from === currNodeId);
        
        outgoingEdges.forEach(edge => {
          const targetNode = nodes.find(n => n.id === edge.to);
          if (!targetNode) return;

          const shouldFollow =
            (outcomeStatus === 'success' && (edge.type === 'success' || edge.type === 'always')) ||
            (outcomeStatus === 'failed' && (edge.type === 'failure' || edge.type === 'always'));

          if (shouldFollow) {
            if (!processed.has(edge.to) && !queue.includes(edge.to)) {
              queue.push(edge.to);
              appendLogs([
                `[${new Date().toLocaleTimeString()}] ➔ Following branch [${edge.type.toUpperCase()}] to next step: "${targetNode.label}"`
              ]);
            }
          } else {
            // Mark skipped if not processed
            if (!processed.has(edge.to)) {
              nodes = nodes.map(n => n.id === edge.to ? { ...n, status: 'skipped' as WorkflowNode['status'] } : n);
              appendLogs([
                `[${new Date().toLocaleTimeString()}] 🚫 [BRANCH BYPASS] Skipping step "${targetNode.label}" (Condition: ${edge.type.toUpperCase()} not satisfied by outcome: ${outcomeStatus.toUpperCase()})`
              ]);
            }
          }
        });

        setTimeout(processQueue, 1200);
      }, 1800);
    }

    setTimeout(processQueue, 400);
  };

  const getNodeColor = (node: WorkflowNode) => {
    if (node.status === 'running') return '#a855f7';
    if (node.status === 'waiting_for_approval') return '#f59e0b';
    if (node.status === 'success') return '#10b981';
    if (node.status === 'failed') return '#ef4444';
    if (node.status === 'skipped') return '#64748b';
    if (node.type === 'start') return '#3b82f6';
    if (node.type === 'approval') return '#f59e0b';
    if (node.type === 'notification') return '#64748b';
    return 'var(--accent-primary)';
  };

  const handleNodeClick = (node: WorkflowNode) => {
    const mockHistory: TaskExecution[] = [
      {
        id: `exec-${Date.now()}-1`,
        templateId: node.templateId || '',
        templateName: node.label,
        status: 'success',
        startedAt: new Date(Date.now() - 86400000).toISOString(),
        finishedAt: new Date(Date.now() - 86300000).toISOString(),
        duration: '2m 34s',
        triggeredBy: 'admin',
        inventoryName: 'Production Servers',
        playbook: node.playbook || 'unknown.yml',
        hostsStats: { ok: 12, changed: 8, unreachable: 0, failed: 0, skipped: 2 },
        logs: ['PLAY [all] ***', 'TASK [Gathering Facts] ***', 'ok: [web-01]', 'ok: [web-02]']
      },
      {
        id: `exec-${Date.now()}-2`,
        templateId: node.templateId || '',
        templateName: node.label,
        status: 'failed',
        startedAt: new Date(Date.now() - 172800000).toISOString(),
        finishedAt: new Date(Date.now() - 172700000).toISOString(),
        duration: '1m 12s',
        triggeredBy: 'admin',
        inventoryName: 'Production Servers',
        playbook: node.playbook || 'unknown.yml',
        hostsStats: { ok: 5, changed: 2, unreachable: 1, failed: 2, skipped: 0 },
        logs: ['PLAY [all] ***', 'TASK [Install Package] ***', 'fatal: [web-03]: FAILED!']
      }
    ];

    setSelectedNodeForHistory({ ...node, executionHistory: mockHistory });
    setShowHistoryPanel(true);
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!selectedWf) return;
    const updated = {
      ...selectedWf,
      nodes: selectedWf.nodes
        .filter((n) => n.id !== nodeId)
        .map((n) => ({
          ...n,
          yesTargetNodeId: n.yesTargetNodeId === nodeId ? undefined : n.yesTargetNodeId,
          noTargetNodeId: n.noTargetNodeId === nodeId ? undefined : n.noTargetNodeId
        })),
      edges: selectedWf.edges.filter((e) => e.from !== nodeId && e.to !== nodeId)
    };
    await persistWorkflow(updated);
  };

  if (!selectedWf) {
    return (
      <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading workflow...
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => onBack?.()}
            style={{ padding: '8px 12px' }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {selectedWf.name}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {selectedWf.description || 'No description'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
            onClick={async () => {
              if (!confirm('Are you sure you want to delete this entire workflow?')) return;
              try {
                await api.deleteWorkflow(selectedWf.id);
                onBack?.();
              } catch (err) {
                alert(`Failed to delete workflow: ${err}`);
              }
            }}
            title="Delete Entire Workflow"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
          <button className="btn btn-secondary" onClick={() => handleOpenConnectModal()}>
            <Link2 size={14} />
            <span>Connect Steps</span>
          </button>
          <button className="btn btn-secondary" onClick={() => setShowWorkflowHistoryModal(true)}>
            <History size={14} />
            <span>Pipeline History ({selectedWf.executionHistory?.length || 0})</span>
          </button>
          <button className="btn btn-secondary" onClick={handleResetWorkflow} disabled={isRunning}>
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddNodeModal(true)}>
            <Plus size={14} />
            <span>Add Node</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={handleRunWorkflow}
            disabled={isRunning}
            style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
          >
            <Play size={14} fill="white" />
            <span>{isRunning ? 'Pipeline Running...' : 'Execute Workflow'}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="glass-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <GripVertical size={16} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Playbook Palette</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Drag into the canvas</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {templates.map((template) => (
              <div
                key={template.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('templateId', template.id)}
                style={{ padding: '9px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-tertiary)', cursor: 'grab', fontSize: '0.75rem', color: 'var(--text-primary)' }}
                title={`Drag ${template.name} to the workflow canvas`}
              >
                <GripVertical size={12} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                {template.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Workflow Canvas / Diagram Box */}
      <div
        className="glass-panel"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDropTemplate}
        onWheel={handleCanvasWheel}
        style={{
          padding: '30px',
          minHeight: '520px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-secondary)',
          position: 'relative',
          overflow: 'auto',
          userSelect: draggingNodeId ? 'none' : 'auto'
        }}
      >
        {/* Floating Zoom Controls Toolbar */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 45,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            borderRadius: 8,
            padding: '4px 6px'
          }}
        >
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleZoomOut}
            title="Zoom Out (or Ctrl + Wheel Down)"
            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleResetZoom}
            title="Reset Zoom to 100%"
            style={{
              padding: '4px 8px',
              fontSize: '0.72rem',
              fontWeight: 700,
              minWidth: '52px',
              textAlign: 'center'
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleZoomIn}
            title="Zoom In (or Ctrl + Wheel Up)"
            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleResetZoom}
            title="Reset to 100%"
            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
          >
            <Maximize2 size={13} />
          </button>
        </div>

        <div style={{ position: 'relative', minWidth: '1200px', minHeight: '500px' }}>
          {/* Sticky Floating Manual Approval Action Banner */}
          {(() => {
            const waitingNode = selectedWf.nodes.find((n) => n.status === 'waiting_for_approval');
            if (!waitingNode) return null;
            return (
              <div
                style={{
                  position: 'sticky',
                  top: 10,
                  zIndex: 40,
                  margin: '0 auto 16px auto',
                  maxWidth: 680,
                  backgroundColor: '#0f172a',
                  border: '2px solid #f59e0b',
                  boxShadow: '0 0 25px rgba(245, 158, 11, 0.45)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldAlert size={24} color="#f59e0b" className="pulse-running" />
                  <div>
                    <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.875rem' }}>
                      PAUSED: Manual Approval Required for "{waitingNode.label}"
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {waitingNode.approvalMessage || 'Click Yes to approve or No to reject and advance the workflow.'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprovalDecision(waitingNode.id, 'yes');
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="btn btn-sm btn-success"
                    style={{ padding: '6px 14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve (Yes)</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprovalDecision(waitingNode.id, 'no');
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="btn btn-sm btn-danger"
                    style={{ padding: '6px 14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <XCircle size={14} />
                    <span>Reject (No)</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Zoomable Canvas Surface for Diagram Nodes & Arrows */}
          <div
            style={{
              position: 'relative',
              minWidth: `${Math.max(1400, Math.round(1400 * zoom))}px`,
              minHeight: `${Math.max(650, Math.round(650 * zoom))}px`,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              transition: draggingNodeId ? 'none' : 'transform 0.12s ease-out'
            }}
          >
            {/* SVG Overlay for Connecting Arrows (Flèches) */}
          {(() => {
            const orderedNodes = getOrderedNodes(selectedWf.nodes, selectedWf.edges);
            void orderedNodes;

            return (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              >
                <defs>
                  {/* Arrowhead Markers (Flèches) */}
                  <marker
                    id="arrowhead-success"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                  </marker>
                  <marker
                    id="arrowhead-always"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                  </marker>
                  <marker
                    id="arrowhead-failure"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                  </marker>
                  <marker
                    id="arrowhead-running"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
                  </marker>
                </defs>

                {selectedWf.edges.map((edge) => {
                  const fromNode = selectedWf.nodes.find((n) => n.id === edge.from);
                  const toNode = selectedWf.nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;

                  const isRunningEdge = fromNode.status === 'running' || toNode.status === 'running';

                  // Calculate connection coordinates (Node width = 210px, approx height = 130px)
                  let startX = fromNode.x + 210;
                  let startY = fromNode.y + 60;
                  let endX = toNode.x;
                  let endY = toNode.y + 60;
                  let pathD = '';
                  let midX = (startX + endX) / 2;
                  let midY = (startY + endY) / 2;

                  if (toNode.x > fromNode.x + 40) {
                    // Standard left-to-right connection curve
                    const dx = Math.abs(endX - startX) / 2;
                    pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
                    midX = (startX + endX) / 2;
                    midY = (startY + endY) / 2;
                  } else {
                    // Loop-around vertical curve when target is to the left or directly above/below
                    startX = fromNode.x + 105;
                    startY = fromNode.y + 120;
                    endX = toNode.x + 105;
                    endY = toNode.y;
                    const dy = Math.max(50, Math.abs(endY - startY) / 2);
                    pathD = `M ${startX} ${startY} C ${startX} ${startY + dy}, ${endX} ${endY - dy}, ${endX} ${endY}`;
                    midX = (startX + endX) / 2;
                    midY = (startY + endY) / 2;
                  }

                  const edgeColor = isRunningEdge
                    ? '#a855f7'
                    : edge.type === 'failure'
                    ? '#ef4444'
                    : edge.type === 'always'
                    ? '#38bdf8'
                    : '#10b981';

                  const markerId = isRunningEdge
                    ? 'url(#arrowhead-running)'
                    : edge.type === 'failure'
                    ? 'url(#arrowhead-failure)'
                    : edge.type === 'always'
                    ? 'url(#arrowhead-always)'
                    : 'url(#arrowhead-success)';

                  return (
                    <g key={edge.id}>
                      {/* Glow background line */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={edgeColor}
                        strokeWidth={isRunningEdge ? 5 : 3}
                        strokeOpacity={0.8}
                        markerEnd={markerId}
                      />
                      {/* Interactive Condition Badge & Delete Edge on Midpoint */}
                      <g
                        pointerEvents="all"
                        transform={`translate(${midX}, ${midY})`}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Condition Badge Pill */}
                        {(() => {
                          const isApproval = fromNode.type === 'approval';
                          const badgeW = isApproval ? 100 : 84;
                          const labelText = isApproval
                            ? edge.type === 'failure'
                              ? 'REJECT (NO) ✕'
                              : 'APPROVE (YES) ✓'
                            : edge.type === 'failure'
                            ? 'ON FAIL ✕'
                            : edge.type === 'always'
                            ? 'ALWAYS'
                            : 'ON SUCCESS ✓';

                          return (
                            <>
                              <rect
                                x={-badgeW / 2}
                                y="-11"
                                width={badgeW}
                                height="22"
                                rx="11"
                                fill="var(--bg-secondary)"
                                stroke={edgeColor}
                                strokeWidth="1.5"
                              />
                              <text
                                x="-10"
                                y="4"
                                textAnchor="middle"
                                fill={edgeColor}
                                fontSize="9"
                                fontWeight="800"
                                letterSpacing="0.02em"
                              >
                                {labelText}
                              </text>
                            </>
                          );
                        })()}

                        {/* Delete Edge Button */}
                        <g
                          transform="translate(30, 0)"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEdge(edge.id);
                          }}
                        >
                          <circle r="8" fill="#ef4444" />
                          <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                            ✕
                          </text>
                        </g>
                      </g>
                    </g>
                  );
                })}
              </svg>
            );
          })()}

          {/* Node Cards */}
          {(() => {
            const orderedNodes = getOrderedNodes(selectedWf.nodes, selectedWf.edges);

            return selectedWf.nodes.map((node) => {
              const nodeColor = getNodeColor(node);
              const isDraggingThis = draggingNodeId === node.id;
              const stepIndex = orderedNodes.findIndex((n) => n.id === node.id);
              const stepOrdinal = stepIndex >= 0 ? getOrdinalSuffix(stepIndex + 1) : '';
              const otherNodes = selectedWf.nodes.filter(n => n.id !== node.id);
              const yesTargetNode = selectedWf.nodes.find(n => n.id === node.yesTargetNodeId);
              const noTargetNode = selectedWf.nodes.find(n => n.id === node.noTargetNodeId);
              const targetYesName = yesTargetNode ? yesTargetNode.label : 'Étape suivante';
              const targetNoName = noTargetNode ? noTargetNode.label : (node.noTargetNodeId === 'stop' || !node.noTargetNodeId ? 'Arrêter le workflow' : 'Étape alternative');

              return (
                <div
                  key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  style={{
                    width: '220px',
                    padding: '14px 16px',
                    borderRadius: 14,
                    backgroundColor: 'var(--bg-tertiary)',
                    border: `2px solid ${nodeColor}`,
                    boxShadow: isDraggingThis
                      ? `0 0 25px ${nodeColor}`
                      : node.status === 'running'
                      ? `0 0 20px ${nodeColor}`
                      : 'var(--card-shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    transition: isDraggingThis ? 'none' : 'left 0.15s ease, top 0.15s ease',
                    cursor: isDraggingThis ? 'grabbing' : 'grab',
                    zIndex: isDraggingThis ? 20 : 3
                  }}
                  className={node.status === 'running' ? 'pulse-running' : ''}
                  onClick={() => {
                    if (!hasMovedRef.current) {
                      handleNodeClick(node);
                    }
                    hasMovedRef.current = false;
                  }}
                >
                  {/* Node Header Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <GripVertical size={13} style={{ color: 'var(--text-muted)', cursor: 'grab' }} />
                      {node.type === 'approval' ? (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            backgroundColor: '#f59e0b',
                            color: '#000',
                            padding: '2px 7px',
                            borderRadius: 6,
                            letterSpacing: '0.03em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <ShieldAlert size={11} />
                          APPROVAL
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            backgroundColor: nodeColor,
                            color: '#fff',
                            padding: '2px 7px',
                            borderRadius: 6,
                            letterSpacing: '0.03em'
                          }}
                        >
                          {stepOrdinal}
                        </span>
                      )}
                      {node.type === 'approval' && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                          {stepOrdinal}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {node.type === 'approval' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfiguringApprovalNode(node);
                            setConfigPromptMessage(node.approvalMessage || '');
                            setConfigYesTargetId(node.yesTargetNodeId || '');
                            setConfigNoTargetId(node.noTargetNodeId || '');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#f59e0b',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Paramétrer les branchements YES / NO"
                        >
                          <Settings size={13} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                        title="Delete this stage node"
                      >
                        <Trash2 size={12} />
                      </button>
                      {node.status === 'success' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#10b981', fontSize: '0.65rem', fontWeight: 800 }}>
                          <CheckCircle2 size={15} />
                          {node.type === 'approval' ? 'YES' : null}
                        </span>
                      ) : node.status === 'failed' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#ef4444', fontSize: '0.65rem', fontWeight: 800 }}>
                          <XCircle size={15} />
                          {node.type === 'approval' ? 'NO' : null}
                        </span>
                      ) : node.status === 'waiting_for_approval' ? (
                        <span className="badge badge-warning pulse-running" style={{ fontSize: '0.6rem', backgroundColor: '#f59e0b', color: '#000', fontWeight: 800 }}>
                          WAITING
                        </span>
                      ) : node.status === 'skipped' ? (
                        <AlertCircle size={16} color="#64748b" />
                      ) : node.status === 'running' ? (
                        <Activity size={16} color="#a855f7" className="spin-slow" />
                      ) : null}
                    </div>
                  </div>

                  {/* Node Title & Description */}
                  <div style={{ fontWeight: 800, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                    {node.label}
                  </div>

                  {node.type === 'approval' ? (
                    /* Approval Message / Instructions */
                    <div
                      style={{
                        fontSize: '0.725rem',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        lineHeight: 1.3
                      }}
                    >
                      {node.approvalMessage || 'Require operator approval to proceed with workflow.'}
                    </div>
                  ) : node.playbook ? (
                    <div
                      style={{
                        fontSize: '0.725rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {node.playbook}
                    </div>
                  ) : null}

                  {/* APPROVAL GATE CARD BODY */}
                  {node.type === 'approval' ? (
                    <>
                      {/* Active Decision Prompt When Waiting For Operator Decision */}
                      {node.status === 'waiting_for_approval' ? (
                        <div
                          style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            border: '2px solid #f59e0b',
                            boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)',
                            borderRadius: 8,
                            padding: '10px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <ShieldAlert size={13} className="pulse-running" />
                            <span>VALIDATION REQUISE :</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApprovalDecision(node.id, 'yes');
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: 'none',
                                backgroundColor: '#10b981',
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                              }}
                              title={`Approve & Pass to ${targetYesName}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle2 size={13} />
                                <span>OUI (YES)</span>
                              </div>
                              <span style={{ fontSize: '0.65rem', opacity: 0.95, fontWeight: 700 }}>
                                ➔ {targetYesName}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApprovalDecision(node.id, 'no');
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: 'none',
                                backgroundColor: '#ef4444',
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
                              }}
                              title={`Reject & Pass to ${targetNoName}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <XCircle size={13} />
                                <span>NON (NO)</span>
                              </div>
                              <span style={{ fontSize: '0.65rem', opacity: 0.95, fontWeight: 700 }}>
                                ➔ {targetNoName}
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : node.approvalDecision === 'yes' ? (
                        /* DECISION RECORDED - APPROVED (YES) */
                        <div
                          style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid #10b981',
                            borderRadius: 8,
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <CheckCircle2 size={15} color="#10b981" />
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981' }}>
                                APPROUVÉ (YES)
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.6rem',
                                fontWeight: 800,
                                color: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                                padding: '2px 6px',
                                borderRadius: 4
                              }}
                            >
                              Validé ✓
                            </span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>
                            ➔ Étape exécutée : {targetYesName}
                          </div>
                        </div>
                      ) : node.approvalDecision === 'no' ? (
                        /* DECISION RECORDED - REJECTED (NO) */
                        <div
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            borderRadius: 8,
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <XCircle size={15} color="#ef4444" />
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444' }}>
                                REJETÉ (NO)
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.6rem',
                                fontWeight: 800,
                                color: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                                padding: '2px 6px',
                                borderRadius: 4
                              }}
                            >
                              Rejeté ✕
                            </span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 700 }}>
                            ➔ Étape exécutée : {targetNoName}
                          </div>
                        </div>
                      ) : (
                        /* IDLE STATE: 1ère Configuration des branchements YES / NO */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                          {/* YES Configuration Box */}
                          <div
                            style={{
                              padding: '6px 8px',
                              borderRadius: 7,
                              backgroundColor: 'rgba(16, 185, 129, 0.08)',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
                                SI OUI (YES) ➔
                              </span>
                              <span style={{ fontSize: '0.58rem', color: '#10b981', fontWeight: 700 }}>Pass to next</span>
                            </div>
                            <select
                              value={node.yesTargetNodeId || ''}
                              onChange={(e) => handleUpdateApprovalRouting(node.id, e.target.value, node.noTargetNodeId)}
                              disabled={isRunning}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                borderRadius: 4,
                                fontSize: '0.68rem',
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">-- Étape suivante séquentielle --</option>
                              {otherNodes.map((target, idx) => (
                                <option key={target.id} value={target.id}>
                                  {idx + 1}. {target.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* NO Configuration Box */}
                          <div
                            style={{
                              padding: '6px 8px',
                              borderRadius: 7,
                              backgroundColor: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
                                SI NON (NO) ➔
                              </span>
                              <span style={{ fontSize: '0.58rem', color: '#ef4444', fontWeight: 700 }}>Pass to another</span>
                            </div>
                            <select
                              value={node.noTargetNodeId || ''}
                              onChange={(e) => handleUpdateApprovalRouting(node.id, node.yesTargetNodeId, e.target.value)}
                              disabled={isRunning}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                borderRadius: 4,
                                fontSize: '0.68rem',
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">-- Arrêter le workflow (Stop) --</option>
                              {otherNodes.map((target, idx) => (
                                <option key={target.id} value={target.id}>
                                  {idx + 1}. {target.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* PLAYBOOK TASK CARD BODY */
                    <>
                      {/* Branch Simulator Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                        <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>
                          {node.status.toUpperCase()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSimulateFailure(node.id);
                          }}
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: 4,
                            border: '1px solid',
                            borderColor: node.simulateFailure ? '#ef4444' : '#10b981',
                            backgroundColor: node.simulateFailure ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                            color: node.simulateFailure ? '#ef4444' : '#10b981',
                            cursor: 'pointer'
                          }}
                          title={node.simulateFailure ? 'Node set to FAIL mode (will test ON FAILURE branch)' : 'Node set to PASS mode (will test ON SUCCESS branch)'}
                        >
                          {node.simulateFailure ? '🔴 Sim FAIL' : '🟢 Sim PASS'}
                        </button>
                      </div>

                      {/* AWX Style Branch Link Action Bar */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }}>
                        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          AWX Link Next Task:
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {/* On Success Link */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenConnectModal(node.id, 'success');
                            }}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2,
                              padding: '3px 4px',
                              borderRadius: 6,
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              backgroundColor: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: 700
                            }}
                            title="AWX Style: Link a task to run when THIS task SUCCEEDS (Green Arrow)"
                          >
                            <Plus size={10} />
                            <span>Success</span>
                          </button>

                          {/* On Failure Link */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenConnectModal(node.id, 'failure');
                            }}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2,
                              padding: '3px 4px',
                              borderRadius: 6,
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: 700
                            }}
                            title="AWX Style: Link a task to run when THIS task FAILS (Red Arrow)"
                          >
                            <Plus size={10} />
                            <span>Failure</span>
                          </button>

                          {/* Always Link */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenConnectModal(node.id, 'always');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2,
                              padding: '3px 4px',
                              borderRadius: 6,
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                              backgroundColor: 'rgba(56, 189, 248, 0.12)',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: 700
                            }}
                            title="AWX Style: Link a task to ALWAYS run (Blue Arrow)"
                          >
                            <Plus size={10} />
                            <span>Always</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            });
          })()}
          </div>
        </div>
      </div>

      {/* Live Pipeline Execution Output Console */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={17} style={{ color: '#38bdf8' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Live Pipeline Orchestration Console</h3>
          </div>
          {isRunning && (
            <span className="badge badge-running pulse-running">
              PIPELINE IN PROGRESS
            </span>
          )}
        </div>

        <div
          style={{
            backgroundColor: 'var(--terminal-bg)',
            color: 'var(--terminal-text)',
            borderRadius: 8,
            padding: '16px 20px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            lineHeight: '1.6',
            minHeight: '160px',
            maxHeight: '260px',
            overflowY: 'auto'
          }}
        >
          {executionLogs.length === 0 ? (
            <span style={{ color: '#64748b', fontStyle: 'italic' }}>
              Click "Execute Workflow" to launch and watch real-time DAG node orchestration...
            </span>
          ) : (
            executionLogs.map((l, i) => (
              <div key={i} style={{ color: l.includes('SUCCESS') ? '#34d399' : '#cbd5e1' }}>
                {l}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Node Modal */}
      {showAddNodeModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Add Stage Node</h3>
              <button
                onClick={() => setShowAddNodeModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Node Type</label>
                <select
                  value={nodeType}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setNodeType(val);
                    if (val === 'approval') {
                      setNodeLabel('Manual Approval Gate');
                    } else if (val === 'notification') {
                      setNodeLabel('Webhook / Notification Alert');
                    }
                  }}
                  className="form-control"
                >
                  <option value="playbook">Playbook Template Execution</option>
                  <option value="approval">Manual Approval Gate</option>
                  <option value="notification">Notification / Webhook Alert</option>
                </select>
              </div>

              <div>
                <label className="form-label">Node Display Label</label>
                <input
                  type="text"
                  placeholder={nodeType === 'approval' ? 'e.g. Production Deployment Approval Gate' : 'e.g. 4. Run Smoke Tests'}
                  value={nodeLabel}
                  onChange={(e) => setNodeLabel(e.target.value)}
                  className="form-control"
                />
              </div>

              {nodeType === 'approval' && (
                <>
                  <div>
                    <label className="form-label">Approval Gate Prompt / Message</label>
                    <input
                      type="text"
                      placeholder="e.g. Require operator sign-off before proceeding"
                      value={nodeApprovalMessage}
                      onChange={(e) => setNodeApprovalMessage(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ color: '#10b981', fontWeight: 700 }}>
                      🟢 Si OUI (YES) ➔ Passer à l'étape (Pass to next)
                    </label>
                    <select
                      value={nodeYesTargetId}
                      onChange={(e) => setNodeYesTargetId(e.target.value)}
                      className="form-control"
                    >
                      <option value="">-- Étape suivante séquentielle (défaut) --</option>
                      {selectedWf?.nodes.map((n, idx) => (
                        <option key={n.id} value={n.id}>
                          {idx + 1}. {n.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ color: '#ef4444', fontWeight: 700 }}>
                      🔴 Si NON (NO) ➔ Passer à l'étape (Pass to another)
                    </label>
                    <select
                      value={nodeNoTargetId}
                      onChange={(e) => setNodeNoTargetId(e.target.value)}
                      className="form-control"
                    >
                      <option value="stop">-- Arrêter le workflow (Stop) --</option>
                      {selectedWf?.nodes.map((n, idx) => (
                        <option key={n.id} value={n.id}>
                          {idx + 1}. {n.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {nodeType === 'playbook' && (
                <div>
                  <label className="form-label">Attached Task Template</label>
                  <select
                    value={nodeTemplateId}
                    onChange={(e) => setNodeTemplateId(e.target.value)}
                    className="form-control"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.playbook})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddNodeModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAddNode}>
                  Append Node
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Paramétrer la porte d'approbation (YES / NO) */}
      {configuringApprovalNode && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldAlert size={20} style={{ color: '#f59e0b' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                  Paramétrer Décisions YES / NO
                </h3>
              </div>
              <button
                onClick={() => setConfiguringApprovalNode(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Message / Consigne du validateur</label>
                <input
                  type="text"
                  value={configPromptMessage}
                  onChange={(e) => setConfigPromptMessage(e.target.value)}
                  className="form-control"
                  placeholder="e.g. Require operator sign-off before proceeding"
                />
              </div>

              <div>
                <label className="form-label" style={{ color: '#10b981', fontWeight: 700 }}>
                  🟢 Si OUI (YES) ➔ Passer à l'étape (Pass to next)
                </label>
                <select
                  value={configYesTargetId}
                  onChange={(e) => setConfigYesTargetId(e.target.value)}
                  className="form-control"
                >
                  <option value="">-- Étape suivante séquentielle --</option>
                  {selectedWf?.nodes
                    .filter(n => n.id !== configuringApprovalNode.id)
                    .map((n, idx) => (
                      <option key={n.id} value={n.id}>
                        {idx + 1}. {n.label}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Si le validateur clique sur YES pendant l'exécution, le workflow passera directement à cette étape.
                </div>
              </div>

              <div>
                <label className="form-label" style={{ color: '#ef4444', fontWeight: 700 }}>
                  🔴 Si NON (NO) ➔ Passer à l'étape (Pass to another)
                </label>
                <select
                  value={configNoTargetId}
                  onChange={(e) => setConfigNoTargetId(e.target.value)}
                  className="form-control"
                >
                  <option value="stop">-- Arrêter le workflow (Stop) --</option>
                  {selectedWf?.nodes
                    .filter(n => n.id !== configuringApprovalNode.id)
                    .map((n, idx) => (
                      <option key={n.id} value={n.id}>
                        {idx + 1}. {n.label}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Si le validateur clique sur NO pendant l'exécution, le workflow passera à cette étape alternative (ex: Rollback) ou s'arrêtera.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setConfiguringApprovalNode(null)}
                >
                  Annuler
                </button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await handleUpdateApprovalRouting(
                      configuringApprovalNode.id,
                      configYesTargetId,
                      configNoTargetId,
                      configPromptMessage
                    );
                    setConfiguringApprovalNode(null);
                  }}
                >
                  Enregistrer la configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connect Steps / Link Tasks Modal (Arrow / Flèche creation) */}
      {showConnectModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link2 size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Link Tasks with Arrow (Flèche)</h3>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">First Task (Source)</label>
                <select
                  value={connectFromNodeId}
                  onChange={(e) => {
                    const fromId = e.target.value;
                    setConnectFromNodeId(fromId);
                    if (selectedWf) {
                      const targets = selectedWf.nodes.filter(n => n.id !== fromId);
                      if (targets.length > 0 && !targets.some(n => n.id === connectToNodeId)) {
                        setConnectToNodeId(targets[0].id);
                      }
                    }
                  }}
                  className="form-control"
                >
                  {selectedWf?.nodes.map((n, idx) => (
                    <option key={n.id} value={n.id}>
                      {idx + 1}. {n.label} ({n.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                <ArrowRight size={22} style={{ color: 'var(--accent-primary)' }} />
              </div>

              <div>
                <label className="form-label">Next Task (Target Node)</label>
                {selectedWf?.nodes.filter((n) => n.id !== connectFromNodeId).length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px 0' }}>
                    No other existing nodes on canvas. Pick a transition option below to auto-create and link a new node!
                  </div>
                ) : (
                  <select
                    value={connectToNodeId}
                    onChange={(e) => setConnectToNodeId(e.target.value)}
                    className="form-control"
                  >
                    {selectedWf?.nodes
                      .filter((n) => n.id !== connectFromNodeId)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          Existing Node: {n.label} ({n.type.toUpperCase()})
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div>
                <label className="form-label">AWX Branch Condition</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setConnectEdgeType('success')}
                    style={{
                      padding: '8px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: connectEdgeType === 'success' ? '#10b981' : 'var(--border-color)',
                      backgroundColor: connectEdgeType === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-tertiary)',
                      color: connectEdgeType === 'success' ? '#10b981' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    🟢 On Success
                  </button>

                  <button
                    type="button"
                    onClick={() => setConnectEdgeType('failure')}
                    style={{
                      padding: '8px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: connectEdgeType === 'failure' ? '#ef4444' : 'var(--border-color)',
                      backgroundColor: connectEdgeType === 'failure' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                      color: connectEdgeType === 'failure' ? '#ef4444' : '#10b981',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔴 On Failure
                  </button>

                  <button
                    type="button"
                    onClick={() => setConnectEdgeType('always')}
                    style={{
                      padding: '8px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: connectEdgeType === 'always' ? '#38bdf8' : 'var(--border-color)',
                      backgroundColor: connectEdgeType === 'always' ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-tertiary)',
                      color: connectEdgeType === 'always' ? '#38bdf8' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔵 Always
                  </button>
                </div>
              </div>

              {/* Choose Transition Destination Type */}
              <div style={{ paddingTop: 10, borderTop: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label className="form-label" style={{ fontSize: '0.78rem', margin: 0 }}>
                  OR Create & Link New Transition Node ({connectEdgeType.toUpperCase()} Branch):
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* Manual Approval Gate Quick Add */}
                  <button
                    type="button"
                    onClick={() => {
                      if (connectFromNodeId) {
                        handleCreateAndConnectApprovalNode(connectFromNodeId, connectEdgeType);
                      }
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      color: '#f59e0b',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                    title="Insert a Manual Approval Gate that pauses execution for Yes/No decision"
                  >
                    <ShieldAlert size={14} />
                    <span>+ Approval Gate</span>
                  </button>

                  {/* Webhook / Notification Quick Add */}
                  <button
                    type="button"
                    onClick={() => {
                      if (connectFromNodeId) {
                        handleCreateAndConnectWebhookNode(connectFromNodeId, connectEdgeType);
                      }
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      backgroundColor: 'rgba(148, 163, 184, 0.12)',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                    title="Insert a Webhook or Notification action"
                  >
                    <Bell size={14} />
                    <span>+ Webhook Node</span>
                  </button>
                </div>

                {/* Playbook template dropdown */}
                <div>
                  <select
                    className="form-control"
                    style={{ fontSize: '0.8rem' }}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleCreateAndConnectNewNode(e.target.value, connectEdgeType);
                      }
                    }}
                  >
                    <option value="" disabled>-- Or Add & Link Playbook Template --</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        + Add "{t.name}" ({t.playbook})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowConnectModal(false)}>
                  Cancel
                </button>
                {selectedWf?.nodes.filter((n) => n.id !== connectFromNodeId).length ? (
                  <button className="btn btn-primary" onClick={handleSaveConnection}>
                    <Link2 size={14} />
                    <span>Link Existing Task</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Execution History Panel */}
      {showHistoryPanel && selectedNodeForHistory && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 800, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <History size={20} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                    Task Execution History
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    {selectedNodeForHistory.label}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryPanel(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {selectedNodeForHistory.executionHistory && selectedNodeForHistory.executionHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {selectedNodeForHistory.executionHistory.map((execution) => (
                  <div
                    key={execution.id}
                    style={{
                      padding: '16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      backgroundColor: 'var(--bg-tertiary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {execution.status === 'success' ? (
                          <CheckCircle size={18} color="#10b981" />
                        ) : execution.status === 'failed' ? (
                          <XCircle size={18} color="#ef4444" />
                        ) : execution.status === 'running' ? (
                          <Activity size={18} color="#a855f7" />
                        ) : (
                          <AlertCircle size={18} color="#f59e0b" />
                        )}
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {execution.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <Clock size={14} />
                        <span>{execution.duration}</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Started</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          {new Date(execution.startedAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Triggered by</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{execution.triggeredBy}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Inventory</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{execution.inventoryName}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Playbook</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {execution.playbook}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                        Host Statistics
                      </span>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span className="badge badge-success">{execution.hostsStats.ok} OK</span>
                        <span className="badge badge-info">{execution.hostsStats.changed} Changed</span>
                        <span className="badge badge-running">{execution.hostsStats.unreachable} Unreachable</span>
                        <span className="badge badge-failed">{execution.hostsStats.failed} Failed</span>
                        <span className="badge badge-secondary">{execution.hostsStats.skipped} Skipped</span>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                        Execution Logs
                      </span>
                      <div
                        style={{
                          backgroundColor: 'var(--terminal-bg)',
                          color: 'var(--terminal-text)',
                          borderRadius: 6,
                          padding: '12px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          maxHeight: '120px',
                          overflowY: 'auto'
                        }}
                      >
                        {execution.logs.map((log, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <History size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                <p>No execution history available for this task.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overall Workflow Diagram Execution History Modal */}
      {showWorkflowHistoryModal && selectedWf && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 840, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <History size={22} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                    Workflow Execution History
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    Pipeline: {selectedWf.name} ({selectedWf.executionHistory?.length || 0} runs recorded)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWorkflowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {selectedWf.executionHistory && selectedWf.executionHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {selectedWf.executionHistory.map((run) => (
                  <div
                    key={run.id}
                    style={{
                      padding: '16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 10,
                      backgroundColor: 'var(--bg-tertiary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {run.status === 'success' ? (
                          <CheckCircle size={20} color="#10b981" />
                        ) : run.status === 'failed' ? (
                          <XCircle size={20} color="#ef4444" />
                        ) : (
                          <Activity size={20} color="#a855f7" className="spin-slow" />
                        )}
                        <div>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', marginRight: 8 }}>
                            {run.status.toUpperCase()} PIPELINE RUN
                          </span>
                          <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                            {run.totalStages} Stages Executed
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <Clock size={14} />
                        <span>Duration: {run.duration}</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12, fontSize: '0.82rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Started At</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          {new Date(run.startedAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Triggered By</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{run.triggeredBy}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Execution ID</span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{run.id}</span>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                        Recorded Execution Console Logs ({run.logs?.length || 0} lines)
                      </span>
                      <div
                        style={{
                          backgroundColor: 'var(--terminal-bg)',
                          color: 'var(--terminal-text)',
                          borderRadius: 6,
                          padding: '12px 14px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          lineHeight: '1.5',
                          maxHeight: '160px',
                          overflowY: 'auto'
                        }}
                      >
                        {run.logs && run.logs.length > 0 ? (
                          run.logs.map((logLine, idx) => (
                            <div key={idx} style={{ color: logLine.includes('SUCCESS') ? '#34d399' : '#cbd5e1' }}>
                              {logLine}
                            </div>
                          ))
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>No console logs captured.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <History size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                <p>No workflow execution history recorded yet. Click "Execute Workflow" to run your pipeline.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
