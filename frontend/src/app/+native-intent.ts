const MAX_NATIVE_PATH_LENGTH = 2048;
const allowedPaths = new Set(['/', '/login', '/subscriptions']);

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (typeof path !== 'string' || path.length > MAX_NATIVE_PATH_LENGTH ||
      /[\u0000-\u0020\u007f]/.test(path)) return '/';

  try {
    // Reject malformed UTF-8 and nested escaping before Router's legacy decoder sees a link.
    if (decodeURIComponent(path).includes('%')) return '/';
    const url = new URL(path, 'germ://app/');
    if (!['germ:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol) ||
        url.username || url.password) return '/';
    let pathname = decodeURIComponent(url.pathname) || '/';
    if (url.protocol === 'germ:' && url.hostname && url.hostname !== 'app' &&
        pathname === '/') {
      pathname = `/${url.hostname}`;
    }
    if (pathname.startsWith('/--/')) pathname = pathname.slice(3);
    if (!allowedPaths.has(pathname)) return '/';
    if (pathname !== '/') return pathname;

    const values = url.searchParams.getAll('alarmId');
    if (values.length !== 1 || !/^\d{1,16}$/.test(values[0])) return '/';
    const alarmId = Number(values[0]);
    return Number.isSafeInteger(alarmId) && alarmId > 0 ? `/?alarmId=${alarmId}` : '/';
  } catch {
    return '/';
  }
}
