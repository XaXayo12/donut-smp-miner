// 📦 Ce fichier = "le tableau de bord en direct".
//    Il efface l'écran et réaffiche, chaque seconde, un joli tableau avec
//    l'état de chaque compte: en ligne ? combien de blocs minés ? vie ? etc.
//    Appuie sur 'q' pour revenir au menu, Ctrl+C pour tout quitter.
//
//    (English: live auto-refreshing table of all bots using cli-table3.)

import Table from 'cli-table3'
import { c, banner, colorState, dim } from './theme.js'

/**
 * Lance l'affichage en direct.
 * @param {object} manager - le BotManager
 * @param {object} config
 * @param {function} onExit - appelé avec (quitterTout:boolean)
 * @returns {{ stop: function }}
 */
export function liveDashboard (manager, config, onExit) {
  const logs = []
  manager.on('log', (msg) => pushLog(dim(msg)))
  manager.on('bot', ({ name, event, args }) => {
    if (event === 'log') pushLog(`${c.cyan('[' + name + ']')} ${args[0]}`)
    if (event === 'needs-login') pushLog(`${c.red('[' + name + '] reconnexion manuelle nécessaire')}`)
    if (event === 'token-updated') pushLog(`${c.green('[' + name + '] jeton rafraîchi ✓')}`)
  })

  function pushLog (line) {
    logs.push(`${dim(new Date().toLocaleTimeString())} ${line}`)
    while (logs.length > 8) logs.shift()
  }

  function render () {
    const rows = manager.snapshot()
    const table = new Table({
      head: ['#', 'Compte', 'État', 'Minés', 'Vie', 'Position', 'Dernière action'].map(h => c.bold(h)),
      style: { head: [], border: [] },
      colWidths: [4, 16, 18, 8, 6, 16, 30],
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
        (r.lastEvent || '').slice(0, 28)
      ])
    })

    const online = rows.filter(r => r.state === 'mining' || r.state === 'online').length
    const totalMined = rows.reduce((s, r) => s + (r.mined || 0), 0)

    console.clear()
    console.log(banner())
    console.log(dim(`  Serveur: ${config.server.host}:${config.server.port}   ` +
      `Comptes en ligne: ${c.green(online)}/${rows.length}   ` +
      `Total minés: ${c.green(totalMined)}`))
    console.log('')
    console.log(table.toString())
    console.log('')
    console.log(c.bold('  Journal:'))
    for (const l of logs) console.log('  ' + l)
    console.log('')
    console.log(dim('  [q] retour au menu   [Ctrl+C] quitter'))
  }

  render()
  const interval = setInterval(render, config.console.refreshMs)

  // Lecture clavier : 'q' = menu, Ctrl+C (code 3) = quitter tout.
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
