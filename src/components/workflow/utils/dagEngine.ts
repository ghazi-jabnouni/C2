import type { WorkflowNode, WorkflowEdge } from '../../../types';

export const getOrdinalSuffix = (i: number): string => {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return `${i}st Step`;
  if (j === 2 && k !== 12) return `${i}nd Step`;
  if (j === 3 && k !== 13) return `${i}rd Step`;
  return `${i}th Step`;
};

export const getOrderedNodes = (nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] => {
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

  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      result.push(n);
    }
  });

  return result;
};

export const getNodeColor = (node: WorkflowNode): string => {
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
