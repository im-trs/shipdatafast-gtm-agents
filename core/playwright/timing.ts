/**
 * Timing utility for Playwright action verbosity
 * Tracks duration of async operations and logs them
 */

export interface TimingContext {
  label: string
  start: number
}

/**
 * Start a timing session
 */
export function startTiming(label: string): TimingContext {
  return {
    label,
    start: Date.now(),
  }
}

/**
 * End timing session and log duration
 */
export function endTiming(context: TimingContext, extra?: string): void {
  const duration = Date.now() - context.start
  const extraText = extra ? ` - ${extra}` : ""
  console.log(`⏱️  [${context.label}] ${duration}ms${extraText}`)
}

/**
 * Wrap an async operation with timing
 */
export async function timed<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start
    console.log(`⏱️  [${label}] ${duration}ms`)
    return result
  } catch (error) {
    const duration = Date.now() - start
    console.log(`⏱️  [${label}] ${duration}ms - FAILED`)
    throw error
  }
}

/**
 * Log a step without timing (for general progress)
 */
export function logStep(message: string): void {
  console.log(`📍 ${message}`)
}

/**
 * Log a selector match with timing
 */
export function logSelectorMatch(
  selector: string,
  duration: number
): void {
  console.log(`✅ [selector] "${selector}" - ${duration}ms`)
}

/**
 * Log a navigation event with timing
 */
export function logNavigation(
  url: string,
  duration: number,
  status: 'success' | 'failed' = 'success'
): void {
  const icon = status === 'success' ? '✅' : '❌'
  const shortUrl = url.length > 60 ? url.slice(0, 60) + '...' : url
  console.log(`${icon} [navigate] ${shortUrl} - ${duration}ms`)
}

/**
 * Log a page interaction with timing
 */
export function logInteraction(
  action: 'fill' | 'click' | 'press' | 'wait',
  target: string,
  duration: number
): void {
  const icons: Record<string, string> = {
    fill: '✏️',
    click: '🖱️',
    press: '⌨️',
    wait: '⏳',
  }
  console.log(`${icons[action] || '📍'} [${action}] ${target} - ${duration}ms`)
}
