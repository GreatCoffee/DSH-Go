/** DSH-Go permanent Session deletion dictionaries. */

export const NS = 'go-session-delete'

/** Simplified Chinese copy for the delete entry and its confirmation. */
export const zh = {
  'menu.deleteSession': '删除会话',
  'confirm.title': '永久删除会话',
  'confirm.description': '会话“{title}”将被永久删除，聊天记录无法恢复，此操作无法撤销。',
  'confirm.cancel': '取消',
  'confirm.action': '永久删除',
  'confirm.pending': '正在删除…',
  'confirm.error': '删除失败：{message}',
  'confirm.error.active': '该会话仍在运行，请先停止其任务后再删除。',
  'confirm.error.missing': '该会话已不存在，可能已被删除。',
} satisfies Record<string, string>

/** Translation keys owned by the go-session-delete namespace. */
export type GoSessionDeleteKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** DSH-Go permanent Session deletion copy. */
    'go-session-delete': GoSessionDeleteKey
  }
}

/** English copy for the same keys. */
export const en = {
  'menu.deleteSession': 'Delete session',
  'confirm.title': 'Delete session permanently',
  'confirm.description': 'The session "{title}" will be permanently deleted. Its chat history cannot be recovered and this action cannot be undone.',
  'confirm.cancel': 'Cancel',
  'confirm.action': 'Delete permanently',
  'confirm.pending': 'Deleting…',
  'confirm.error': 'Delete failed: {message}',
  'confirm.error.active': 'This session is still running. Stop its work before deleting it.',
  'confirm.error.missing': 'This session no longer exists; it may have already been deleted.',
} satisfies Record<keyof typeof zh, string>
