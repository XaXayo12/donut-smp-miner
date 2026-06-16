// 📦 index.js — the START button.
//    This runs when you double-click start.bat (or `npm start`). It:
//      1) asks for the vault master password (or creates it the first time)
//      2) shows a simple menu
//      3) starts the bots and the live dashboard

import fs from 'node:fs'
import { select, password as askPassword, input, confirm } from '@inquirer/prompts'

import { loadConfig, paths } from './config/config.js'
import { Vault } from './vault/vault.js'
import { importFromPath } from './accounts/importer.js'
import { inspectMcToken } from './auth/decodeToken.js'
import { refreshFullChain } from './auth/refresh.js'
import { BotManager } from './manager/botManager.js'
import { liveDashboard } from './ui/dashboard.js'
import { banner, c, hr, dim } from './ui/theme.js'

const config = loadConfig()
const vault = new Vault(paths.vault)

// ---------- Vault unlock / create ----------

async function unlockOrCreateVault () {
  if (!vault.exists()) {
    console.log(c.yellow('\n  First run: let\'s create your vault 🔐'))
    console.log(dim('  This password protects YOUR accounts. Write it down: if you lose it,'))
    console.log(dim('  nobody (not even this program) can recover the accounts.\n'))
    let pw, pw2
    do {
      pw = await askPassword({ message: 'Choose a master password:', mask: '*' })
      pw2 = await askPassword({ message: 'Repeat the password:', mask: '*' })
      if (pw !== pw2) console.log(c.red('  The two passwords differ, try again.'))
      else if (pw.length < 4) { console.log(c.red('  Too short (min 4).')); pw2 = null }
    } while (pw !== pw2 || !pw)
    await vault.create(pw)
    console.log(c.green('  Vault created ✓\n'))
    return
  }

  for (let tries = 0; tries < 3; tries++) {
    const pw = await askPassword({ message: 'Vault password:', mask: '*' })
    try {
      await vault.open(pw)
      console.log(c.green('  Vault unlocked ✓\n'))
      return
    } catch (e) {
      console.log(c.red('  ' + e.message))
    }
  }
  console.log(c.red('  Too many attempts. Bye.'))
  process.exit(1)
}

// ---------- Import ----------

async function importFlow (presetPath) {
  const p = presetPath || await input({
    message: 'Path to the .zip OR folder to import:',
    validate: (v) => fs.existsSync(v.trim()) ? true : 'That path does not exist.'
  })
  let imported
  try {
    imported = importFromPath(p.trim())
  } catch (e) {
    console.log(c.red('  Import failed: ' + e.message))
    return
  }
  if (!imported.length) {
    console.log(c.yellow('  No accounts found in that file.'))
    return
  }
  for (const acc of imported) vault.upsertAccount(acc)
  await vault.save()
  console.log(c.green(`  Imported & saved ${imported.length} account(s) ✓`))
  for (const a of imported) {
    const info = a.tokenInfo
    const exp = info ? (info.isExpired ? c.red('token EXPIRED') : c.green('token valid')) : c.gray('token unreadable')
    const rt = a.refreshToken ? c.green('refresh ✓') : c.red('no refresh')
    console.log(`   • ${c.bold(a.name || '?')}  ${exp}  ${rt}`)
  }
  console.log('')
}

// ---------- Accounts list ----------

function describeAccount (a) {
  let tokenState = c.gray('unreadable')
  let detail = ''
  try {
    const info = a.tokenInfo || inspectMcToken(a.mctoken)
    if (info.isExpired) {
      tokenState = c.red('expired')
    } else {
      tokenState = c.green('valid')
      const h = Math.max(0, Math.floor(info.secondsUntilExpiry / 3600))
      detail = dim(` (expires in ~${h}h)`)
    }
  } catch { /* unreadable */ }
  const rt = a.refreshToken ? c.green('refresh ✓') : c.red('refresh ✗')
  const proxy = a.proxy ? c.cyan('proxy') : dim('no-proxy')
  const enabled = a.enabled === false ? c.gray('disabled') : c.green('enabled')
  return `${c.bold((a.name || '?').padEnd(16))} token:${tokenState}${detail}  ${rt}  ${proxy}  ${enabled}`
}

function listAccounts () {
  const accounts = vault.getAccounts()
  console.log('\n' + hr())
  if (!accounts.length) console.log(c.yellow('  (no accounts — use "Import accounts")'))
  accounts.forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describeAccount(a)}`))
  console.log(hr() + '\n')
}

// ---------- Test / refresh a token (for real) ----------

async function refreshFlow () {
  const accounts = vault.getAccounts()
  if (!accounts.length) { console.log(c.yellow('  No accounts.')); return }
  const choice = await select({
    message: 'Which account do you want to test/refresh?',
    choices: accounts.map(a => ({ name: describeAccountPlain(a), value: a.id }))
  })
  const account = vault.findAccount(choice)
  if (!account.refreshToken) {
    console.log(c.red('  This account has NO refresh token: it cannot refresh on its own.'))
    console.log(dim('  Re-export it with a refresh token to automate it.'))
    return
  }
  console.log(dim('  Contacting Microsoft → Xbox → Minecraft…'))
  try {
    const res = await refreshFullChain(account.refreshToken)
    account.mctoken = res.mcToken
    account.refreshToken = res.newRefreshToken
    account.tokenInfo = inspectMcToken(res.mcToken)
    account.lastRefreshedAt = new Date().toISOString()
    vault.upsertAccount(account)
    await vault.save()
    const info = account.tokenInfo
    console.log(c.green('  ✓ New token obtained and saved!'))
    console.log(`     name  : ${c.bold(res.profile?.name || info.name || '?')}`)
    console.log(`     valid ~${Math.floor(info.secondsUntilExpiry / 3600)}h (until ${new Date(info.expiresAt * 1000).toLocaleString()})`)
  } catch (e) {
    console.log(c.red('  ✖ Refresh failed: ' + e.message))
    console.log(dim('  Likely cause: refresh token expired/revoked, or an Xbox issue on this account.'))
  }
}

function describeAccountPlain (a) {
  let state = 'unreadable'
  try { state = (a.tokenInfo || inspectMcToken(a.mctoken)).isExpired ? 'expired' : 'valid' } catch {}
  return `${a.name || '?'}  [token ${state}]  [${a.refreshToken ? 'refresh ✓' : 'refresh ✗'}]`
}

// ---------- Run bots + dashboard ----------

async function runBots () {
  const accounts = vault.getAccounts().filter(a => a.enabled !== false)
  if (!accounts.length) { console.log(c.yellow('  No enabled accounts to run.')); return }

  const manager = new BotManager(vault, config, paths)
  await manager.startAll()

  await new Promise((resolve) => {
    const dash = liveDashboard(manager, config, (quitEverything) => {
      dash.stop()
      manager.stopAll()
      if (quitEverything) { manager.wipeAll(); process.exit(0) }
      resolve()
    })
  })
}

// ---------- Main menu ----------

async function mainMenu () {
  for (;;) {
    const action = await select({
      message: 'What do you want to do?',
      choices: [
        { name: '▶  Run the bots (live dashboard)', value: 'run' },
        { name: '📥  Import accounts (.zip or folder)', value: 'import' },
        { name: '📋  List my accounts', value: 'list' },
        { name: '🔄  Test / refresh a token now', value: 'refresh' },
        { name: '🚪  Quit', value: 'quit' }
      ]
    })
    if (action === 'run') await runBots()
    else if (action === 'import') await importFlow()
    else if (action === 'list') listAccounts()
    else if (action === 'refresh') await refreshFlow()
    else if (action === 'quit') { console.log(dim('\n  See you 👋\n')); process.exit(0) }
  }
}

// ---------- Boot ----------

async function main () {
  console.clear()
  console.log(banner())
  console.log(dim(`\n  Multi-account dirt miner for DonutSMP — server ${config.server.host}\n`))

  await unlockOrCreateVault()

  const importArgIndex = process.argv.indexOf('--import')
  if (importArgIndex !== -1) {
    await importFlow(process.argv[importArgIndex + 1])
  } else if (vault.getAccounts().length === 0) {
    const yes = await confirm({ message: 'Your vault is empty. Import accounts now?', default: true })
    if (yes) await importFlow()
  }

  await mainMenu()
}

main().catch((e) => {
  console.error(c.red('\nFatal error: ' + e.message))
  process.exit(1)
})
