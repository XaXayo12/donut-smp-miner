// 📦 Ce fichier = le "tunnel" (proxy).
//    Un proxy fait passer la connexion du bot par un autre ordinateur,
//    pour que le serveur voie l'IP du proxy et pas la tienne.
//    On gère 2 types: SOCKS5 (le plus courant) et HTTP CONNECT.
//
//    On fournit à minecraft-protocol une fonction "connect" qui pose un
//    socket déjà branché. (Comportement vérifié dans le code de la lib.)

import net from 'node:net'
import { SocksClient } from 'socks'

/**
 * Comprend une adresse de proxy écrite de plusieurs façons:
 *   socks5://user:pass@1.2.3.4:1080
 *   http://1.2.3.4:8080
 *   1.2.3.4:1080                 (socks5 par défaut)
 *   1.2.3.4:1080:user:pass       (format "ip:port:user:pass")
 * @returns {null | { type:'socks5'|'http', host, port, userId?, password? }}
 */
export function parseProxy (input) {
  if (!input) return null
  let str = String(input).trim()
  if (!str) return null

  let type = 'socks5'
  const schemeMatch = str.match(/^(socks5?|http)(?:\:\/\/)/i)
  if (schemeMatch) {
    type = schemeMatch[1].toLowerCase().startsWith('socks') ? 'socks5' : 'http'
    str = str.replace(/^[a-z0-9]+:\/\//i, '')
  }

  let userId, password
  // forme user:pass@host:port
  if (str.includes('@')) {
    const [creds, rest] = str.split('@')
    ;[userId, password] = creds.split(':')
    str = rest
  }

  const parts = str.split(':')
  // forme host:port:user:pass
  if (parts.length === 4 && userId === undefined) {
    return { type, host: parts[0], port: Number(parts[1]), userId: parts[2], password: parts[3] }
  }
  if (parts.length < 2) return null
  return { type, host: parts[0], port: Number(parts[1]), userId, password }
}

// Ouvre un socket SOCKS5 déjà connecté jusqu'à host:port.
async function socks5Connect (proxy, host, port) {
  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: proxy.host,
      port: proxy.port,
      type: 5,
      userId: proxy.userId,
      password: proxy.password
    },
    command: 'connect',
    destination: { host, port }
  })
  return socket // déjà branché
}

// Ouvre un tunnel HTTP CONNECT déjà connecté jusqu'à host:port.
function httpConnect (proxy, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host)
    socket.once('error', reject)
    socket.once('connect', () => {
      let req = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n`
      if (proxy.userId) {
        const auth = Buffer.from(`${proxy.userId}:${proxy.password || ''}`).toString('base64')
        req += `Proxy-Authorization: Basic ${auth}\r\n`
      }
      req += '\r\n'
      socket.write(req)
    })
    socket.once('data', (chunk) => {
      const head = chunk.toString('utf8')
      if (/^HTTP\/1\.[01] 200/.test(head)) {
        socket.removeListener('error', reject)
        resolve(socket)
      } else {
        socket.destroy()
        reject(new Error('Proxy HTTP a refusé le CONNECT: ' + head.split('\r\n')[0]))
      }
    })
  })
}

/**
 * Fabrique la fonction "connect" attendue par minecraft-protocol.
 * @param {object} opts { host, port, proxy }  proxy = objet parseProxy() ou null
 * @returns {function} (client) => void
 */
export function makeConnect ({ host, port, proxy }) {
  return function connect (client) {
    // Pas de proxy: connexion directe normale.
    if (!proxy) {
      client.setSocket(net.connect(port, host))
      return // le socket émettra 'connect' tout seul
    }

    const open = proxy.type === 'http'
      ? httpConnect(proxy, host, port)
      : socks5Connect(proxy, host, port)

    open
      .then((socket) => {
        client.setSocket(socket)
        // Le socket est DÉJÀ branché -> on prévient le client nous-mêmes.
        client.emit('connect')
      })
      .catch((err) => {
        client.emit('error', new Error('Échec du proxy: ' + err.message))
      })
  }
}

export default { parseProxy, makeConnect }
