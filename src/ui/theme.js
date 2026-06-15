// 📦 Ce fichier = "la déco de la console".
//    Couleurs, bannière et petites aides d'affichage. Juste du visuel.

import chalk from 'chalk'

export const c = chalk

// La grande bannière affichée au lancement.
export function banner () {
  const art = [
    '  ____   ___  _   _ _   _ _____   __  __ ___ _   _ _____ ____  ',
    ' |  _ \\ / _ \\| \\ | | | | |_   _| |  \\/  |_ _| \\ | | ____|  _ \\ ',
    " | | | | | | |  \\| | | | | | |   | |\\/| || ||  \\| |  _| | |_) |",
    ' | |_| | |_| | |\\  | |_| | | |   | |  | || || |\\  | |___|  _ < ',
    ' |____/ \\___/|_| \\_|\\___/  |_|   |_|  |_|___|_| \\_|_____|_| \\_\\'
  ].join('\n')
  return chalk.hex('#f4a261').bold(art)
}

// Une couleur par état, pour lire le tableau d'un coup d'œil.
export function colorState (state) {
  switch (state) {
    case 'mining': return chalk.green('⛏ mining')
    case 'online': return chalk.greenBright('● online')
    case 'connecting': return chalk.cyan('… connecting')
    case 'reconnecting': return chalk.yellow('↻ reconnecting')
    case 'needs-login': return chalk.red('✖ needs login')
    case 'error': return chalk.red('✖ error')
    case 'stopped': return chalk.gray('■ stopped')
    default: return chalk.gray(state || 'idle')
  }
}

export function dim (s) { return chalk.gray(s) }
export function hr () { return chalk.gray('─'.repeat(64)) }

export default { c, banner, colorState, dim, hr }
