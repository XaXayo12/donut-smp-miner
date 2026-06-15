// 📦 Ce fichier = la "voix" du programme.
//    Il sert juste à écrire de jolis messages colorés dans la console.
//    (English: tiny colored logger used everywhere in the project.)

import chalk from 'chalk'

// On met une petite heure devant chaque message, ex: [14:05:09]
function stamp () {
  return chalk.gray(new Date().toLocaleTimeString())
}

// `tag` = le nom du bot ou du module, pour savoir QUI parle.
function prefix (tag) {
  return tag ? chalk.cyan(`[${tag}] `) : ''
}

export const log = {
  info (msg, tag) {
    console.log(`${stamp()} ${prefix(tag)}${msg}`)
  },
  ok (msg, tag) {
    console.log(`${stamp()} ${prefix(tag)}${chalk.green('✔ ' + msg)}`)
  },
  warn (msg, tag) {
    console.log(`${stamp()} ${prefix(tag)}${chalk.yellow('⚠ ' + msg)}`)
  },
  error (msg, tag) {
    console.log(`${stamp()} ${prefix(tag)}${chalk.red('✖ ' + msg)}`)
  },
  // Une grosse barre de titre, juste pour faire joli.
  title (msg) {
    const line = chalk.magenta('─'.repeat(Math.min(60, msg.length + 4)))
    console.log('\n' + line)
    console.log(chalk.magenta.bold('  ' + msg))
    console.log(line + '\n')
  }
}

export default log
