// 📦 dashboard.js — the live status board.
//    Clears the screen and redraws, every second, a colored table with each
//    account's state: online? blocks mined? health? position?
//    Press 'q' to go back to the menu, Ctrl+C to quit everything.

import Table from 'cli-table3'
import { c, banner, colorState, dim } from './theme.js'

/**
 * Start the live display.
 * @param {object} manager - the BotManager
 * @param {object} config
 * @param {function} onExit - called with (quitEverything: boolean)
 * @returns {{ stop: function }}
 */
export function liveDashboard (manager, config, onExit) {
  const logs = []
  manager.on('log', (msg) => pushLog(dim(msg)))
  manager.on('bot', ({ name, event, args }) => {
    if (event === 'log') pushLog(`${c.cyan('[' + name + ']')} ${args[0]}`)
    if (event === 'needs-login') pushLog(`${c.red('[' + name + '] needs manual re-login')}`)
    if (event === 'token-updated') pushLog(`${c.green('[' + name + '] token refreshed ✓')}`)
    if (event === 'done') pushLog(`${c.greenBright('[' + name + '] DONE — inventory full of dirt')}`)
  })

  function pushLog (line) {
    logs.push(`${dim(new Date().toLocaleTimeString())} ${line}`)
    while (logs.length > 8) logs.shift()
  }

  function render () {
    const rows = manager.snapshot()
    const table = new Table({
      head: ['#', 'Account', 'State', 'Dirt', 'HP', 'Position', 'Last action'].map(h => c.bold(h)),
      style: { head: [], border: [] },
      colWidths: [4, 16, 18, 7, 5, 16, 31],
      wordWrap: true
    })
    rows.forEach((r, i) => {
      table.push([
        i + 1,
        r.name || '?',
        colorState(r.state),
        String(r.mined ?? 0),
        r.health != null ? Math.round(r.health) : '-',
        r.position ? `${r.position.x} ${r.position.y} ${r.position.z}` : '-',
        (r.lastEvent || '').slice(0, 29)
      ])
    })

    const online = rows.filter(r => r.state === 'mining' || r.state === 'online').length
    const done = rows.filter(r => r.state === 'done').length
    const totalMined = rows.reduce((s, r) => s + (r.mined || 0), 0)

    console.clear()
    console.log(banner())
    console.log(dim(`  Server: ${config.server.host}:${config.server.port}   ` +
      `Online: ${c.green(online)}/${rows.length}   ` +
      `Done: ${c.greenBright(done)}   ` +
      `Total dirt: ${c.green(totalMined)}`))
    console.log('')
    console.log(table.toString())
    console.log('')
    console.log(c.bold('  Log:'))
    for (const l of logs) console.log('  ' + l)
    console.log('')
    console.log(dim('  [q] back to menu   [Ctrl+C] quit'))
  }

  render()
  const interval = setInterval(render, config.console.refreshMs)

  // Keyboard: 'q' = menu, Ctrl+C (code 3) = quit everything.
  const onKey = (chunk) => {
    const code = chunk[0]
    const isCtrlC = code === 3
    const isQ = chunk.toString() === 'q'
    if (isQ || isCtrlC) {
      stop()
      onExit?.(isCtrlC)
    }
  }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onKey)
  }

  function stop () {
    clearInterval(interval)
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false) } catch { /* ignore */ }
      process.stdin.removeListener('data', onKey)
      process.stdin.pause()
    }
  }

  return { stop }
}

export default { liveDashboard }
