/** DSH-Go maintenance Settings page dictionaries. */

export const NS = 'go-maintenance'

/** Simplified Chinese copy for the maintenance page. */
export const zh = {
  'nav': '维护',
  'title': '清理残留文件',
  'description': '删除会话后可能留下不再被引用的记录、目录与附件。这里的清理只处理已无主的数据，不会动仍然在用的会话。',
  'scan': '扫描',
  'scanning': '扫描中…',
  'cleanAll': '全部清理',
  'cleaning': '清理中…',
  'clean': '清理',
  'projections.title': '投影缓存记录',
  'projections.description': '已被删除的会话留下的检查点记录。',
  'sessions.title': '孤立会话目录',
  'sessions.description': '没有任何工作区记录的会话目录。',
  'attachments.title': '未引用附件',
  'attachments.description': '没有任何会话日志引用的图片对象。',
  'count.records': '{count} 个',
  'bytes': '{size}',
  'nothing': '没有需要清理的残留。',
  'freed': '已释放 {size}。',
  'scanError': '扫描失败：{message}',
  'cleanError': '清理失败：{message}',
} satisfies Record<string, string>

/** Translation keys owned by the go-maintenance namespace. */
export type GoMaintenanceKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** DSH-Go maintenance copy. */
    'go-maintenance': GoMaintenanceKey
  }
}

/** English copy for the same keys. */
export const en = {
  'nav': 'Maintenance',
  'title': 'Clear leftover files',
  'description': 'Deleting a session can leave records, directories, and attachments behind that nothing refers to any more. This page clears only data with no owner; sessions still in use are never touched.',
  'scan': 'Scan',
  'scanning': 'Scanning…',
  'cleanAll': 'Clear all',
  'cleaning': 'Clearing…',
  'clean': 'Clear',
  'projections.title': 'Checkpoint records',
  'projections.description': 'Checkpoints left by sessions that no longer exist.',
  'sessions.title': 'Orphan session directories',
  'sessions.description': 'Session directories no workspace record names.',
  'attachments.title': 'Unreferenced attachments',
  'attachments.description': 'Image objects no session log refers to.',
  'count.records': '{count}',
  'bytes': '{size}',
  'nothing': 'Nothing left to clear.',
  'freed': 'Freed {size}.',
  'scanError': 'Scan failed: {message}',
  'cleanError': 'Clear failed: {message}',
} satisfies Record<keyof typeof zh, string>
