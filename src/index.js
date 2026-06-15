// 📦 Ce fichier = "le bouton START".
//    C'est ce qui se lance quand tu double-cliques sur start.bat (ou `npm start`).
//    Il:
//       1) demande le MOT DE PASSE du coffre (ou le crée la 1re fois)
//       2) affiche un MENU simple
//       3) lance les bots et le tableau de bord
//
//    (English: interactive entry point — unlock vault, menu, run bots.)

import fs from 'node:fs'
import path from 'node:path'
import { select, password as askPassword, input, confirm } from '@inquirer/prompts'

import { loadConfig, paths } from './config/config.js'
import { Vault } from './vault/vault.js'
import { importFromPath } from './accounts/importer.js'
import { inspectMcToken } from './auth/decodeToken.js'
import { refreshFullChain } from './auth/refresh.js'
import { BotManager } from './manager/botManager.js'
import { liveDashboard } from './ui/dashboard.js'
import { banner, c, hr, dim, colorState } from './ui/theme.js'

const config = loadConfig()
const vault = new Vault(paths.vault)

// ---------- Étape coffre ----------

async function unlockOrCreateVault () {
  if (!vault.exists()) {
    console.log(c.yellow('\n  Première utilisation : créons ton coffre-fort 🔐'))
    console.log(dim('  Le mot de passe protège TES comptes. Note-le bien : si tu le perds,'))
    console.log(dim('  personne (même pas ce programme) ne peut récupérer les comptes.\n'))
    let pw, pw2
    do {
      pw = await askPassword({ message: 'Choisis un mot de passe maître :', mask: '*' })
      pw2 = await askPassword({ message: 'Répète le mot de passe :', mask: '*' })
      if (pw !== pw2) console.log(c.red('  Les deux mots de passe sont différents, recommence.'))
      else if (pw.length < 4) { console.log(c.red('  Trop court (min 4).')); pw2 = null }
    } while (pw !== pw2 || !pw)
    await vault.create(pw)
    console.log(c.green('  Coffre créé ✓\n'))
    return
  }

  // Coffre existant : on demande le mot de passe (3 essais).
  for (let tries = 0; tries < 3; tries++) {
    const pw = await askPassword({ message: 'Mot de passe du coffre :', mask: '*' })
    try {
      await vault.open(pw)
      console.log(c.green('  Coffre ouvert ✓\n'))
      return
    } catch (e) {
      console.log(c.red('  ' + e.message))
    }
  }
  console.log(c.red('  Trop d\'essais. Au revoir.'))
  process.exit(1)
}

// ---------- Import ----------

async function importFlow (presetPath) {
  const p = presetPath || await input({
    message: 'Chemin du .zip OU du dossier à importer :',
    validate: (v) => fs.existsSync(v.trim()) ? true : 'Ce chemin n\'existe pas.'
  })
  let imported
  try {
    imported = importFromPath(p.trim())
  } catch (e) {
    console.log(c.red('  Import impossible : ' + e.message))
    return
  }
  if (!imported.length) {
    console.log(c.yellow('  Aucun compte trouvé dans ce fichier.'))
    return
  }
  for (const acc of imported) vault.upsertAccount(acc)
  await vault.save()
  console.log(c.green(`  ${imported.length} compte(s) importé(s) et sauvegardé(s) ✓`))
  for (const a of imported) {
    const info = a.tokenInfo
    const exp = info ? (info.isExpired ? c.red('jeton PÉRIMÉ') : c.green('jeton valide')) : c.gray('jeton illisible')
    const rt = a.refreshToken ? c.green('refresh ✓') : c.red('pas de refresh')
    console.log(`   • ${c.bold(a.name || '?')}  ${exp}  ${rt}`)
  }
  console.log('')
}

// ---------- Liste des comptes ----------

function describeAccount (a) {
  let tokenState = c.gray('illisible')
  let detail = ''
  try {
    const info = a.tokenInfo || inspectMcToken(a.mctoken)
    if (info.isExpired) {
      tokenState = c.red('périmé')
    } else {
      tokenState = c.green('valide')
      const h = Math.max(0, Math.floor(info.secondsUntilExpiry / 3600))
      detail = dim(` (expire dans ~${h}h)`)
    }
  } catch { /* illisible */ }
  const rt = a.refreshToken ? c.green('refresh ✓') : c.red('refresh ✗')
  const proxy = a.proxy ? c.cyan('proxy') : dim('no-proxy')
  const enabled = a.enabled === false ? c.gray('désactivé') : c.green('activé')
  return `${c.bold((a.name || '?').padEnd(16))} jeton:${tokenState}${detail}  ${rt}  ${proxy}  ${enabled}`
}

function listAccounts () {
  const accounts = vault.getAccounts()
  console.log('\n' + hr())
  if (!accounts.length) console.log(c.yellow('  (aucun compte — fais "Importer des comptes")'))
  accounts.forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describeAccount(a)}`))
  console.log(hr() + '\n')
}

// ---------- Test / rafraîchissement d'un jeton (en VRAI) ----------

async function refreshFlow () {
  const accounts = vault.getAccounts()
  if (!accounts.length) { console.log(c.yellow('  Aucun compte.')); return }
  const choice = await select({
    message: 'Quel compte veux-tu tester/rafraîchir ?',
    choices: accounts.map(a => ({ name: describeAccountPlain(a), value: a.id }))
  })
  const account = vault.findAccount(choice)
  if (!account.refreshToken) {
    console.log(c.red('  Ce compte n\'a PAS de refresh token : impossible de le rafraîchir tout seul.'))
    console.log(dim('  Il faudra réexporter ce compte avec un refresh token pour l\'automatiser.'))
    return
  }
  console.log(dim('  Contact de Microsoft → Xbox → Minecraft…'))
  try {
    const res = await refreshFullChain(account.refreshToken)
    account.mctoken = res.mcToken
    account.refreshToken = res.newRefreshToken
    account.tokenInfo = inspectMcToken(res.mcToken)
    account.lastRefreshedAt = new Date().toISOString()
    vault.upsertAccount(account)
    await vault.save()
    const info = account.tokenInfo
    console.log(c.green('  ✓ Nouveau jeton obtenu et sauvegardé !'))
    console.log(`     pseudo : ${c.bold(res.profile?.name || info.name || '?')}`)
    console.log(`     valide ~${Math.floor(info.secondsUntilExpiry / 3600)}h (jusqu'au ${new Date(info.expiresAt * 1000).toLocaleString()})`)
  } catch (e) {
    console.log(c.red('  ✖ Échec du rafraîchissement : ' + e.message))
    console.log(dim('  Cause probable : refresh token expiré/révoqué, ou souci Xbox sur ce compte.'))
  }
}

function describeAccountPlain (a) {
  let state = 'illisible'
  try { state = (a.tokenInfo || inspectMcToken(a.mctoken)).isExpired ? 'périmé' : 'valide' } catch {}
  return `${a.name || '?'}  [jeton ${state}]  [${a.refreshToken ? 'refresh ✓' : 'refresh ✗'}]`
}

// ---------- Lancer les bots + tableau de bord ----------

async function runBots () {
  const accounts = vault.getAccounts().filter(a => a.enabled !== false)
  if (!accounts.length) { console.log(c.yellow('  Aucun compte activé à lancer.')); return }

  const manager = new BotManager(vault, config, paths)
  await manager.startAll()

  await new Promise((resolve) => {
    const dash = liveDashboard(manager, config, (isCtrlC) => {
      dash.stop()
      manager.stopAll()
      if (isCtrlC) { manager.wipeAll(); process.exit(0) }
      resolve()
    })
  })
}

// ---------- Menu principal ----------

async function mainMenu () {
  for (;;) {
    const action = await select({
      message: 'Que veux-tu faire ?',
      choices: [
        { name: '▶  Lancer les bots (tableau de bord en direct)', value: 'run' },
        { name: '📥  Importer des comptes (.zip ou dossier)', value: 'import' },
        { name: '📋  Voir mes comptes', value: 'list' },
        { name: '🔄  Tester / rafraîchir un jeton maintenant', value: 'refresh' },
        { name: '🚪  Quitter', value: 'quit' }
      ]
    })
    if (action === 'run') await runBots()
    else if (action === 'import') await importFlow()
    else if (action === 'list') listAccounts()
    else if (action === 'refresh') await refreshFlow()
    else if (action === 'quit') { console.log(dim('\n  À bientôt 👋\n')); process.exit(0) }
  }
}

// ---------- Démarrage ----------

async function main () {
  console.clear()
  console.log(banner())
  console.log(dim(`\n  Mineur de terre multi-comptes pour DonutSMP — serveur ${config.server.host}\n`))

  await unlockOrCreateVault()

  // Support de la ligne de commande : `npm run import -- <chemin>`
  const importArgIndex = process.argv.indexOf('--import')
  if (importArgIndex !== -1) {
    await importFlow(process.argv[importArgIndex + 1])
  } else if (vault.getAccounts().length === 0) {
    // Coffre vide : on propose tout de suite d'importer.
    const yes = await confirm({ message: 'Ton coffre est vide. Importer des comptes maintenant ?', default: true })
    if (yes) await importFlow()
  }

  await mainMenu()
}

main().catch((e) => {
  console.error(c.red('\nErreur fatale : ' + e.message))
  process.exit(1)
})
