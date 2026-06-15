# 🧠 Comment ça marche (sans magie, sans suppositions)

Ce document explique, simplement mais honnêtement, ce que fait chaque morceau.
Tout ce qui est écrit ici a été **vérifié dans le vrai code** des librairies
utilisées (lues dans `node_modules`), pas deviné.

---

## 1) La connexion par jeton ("token login")

Un compte Minecraft moderne se connecte avec un **jeton** (`mctoken`), pas un mot
de passe. Ce jeton est un long texte (un "JWT") qui contient, en clair (lisible
sans secret) : ton **pseudo**, ton **UUID**, et une **date d'expiration**.

- 📄 `src/auth/decodeToken.js` lit ces infos.
- ⏳ Durée de vie d'un jeton : **~24 heures**.

mineflayer se connecte via la librairie **`prismarine-auth`**. Cette librairie
lit des petits fichiers de "cache". Donc, avant de lancer le bot, on **écrit
nous-mêmes** ces fichiers de cache avec notre jeton :

- 📄 `src/auth/seedCache.js` écrit `…_mca-cache.json` (le jeton) et
  `…_live-cache.json` (le refresh token).
- Résultat : mineflayer utilise **notre** jeton immédiatement, **sans page de
  connexion**.

> ✅ **Vérifié :** on a appelé `getMinecraftJavaToken()` (la fonction exacte que
> mineflayer utilise) avec notre cache pré-rempli, et elle a renvoyé un profil
> Minecraft valide pour les 2 comptes.

---

## 2) Le rafraîchissement automatique ("auto-refresh")

Un jeton meurt après ~24h. Pour ne **jamais** se reconnecter à la main, on utilise
le **refresh token** Microsoft (rangé dans le fichier de cookies, ligne
`# RefreshToken: …`). Avec lui, on refait un jeton tout neuf en passant par :

```
Microsoft  →  Xbox Live  →  XSTS  →  Minecraft
```

- 📄 `src/auth/refresh.js` fait cette chaîne (mêmes adresses et même format que
  `prismarine-auth`).
- L'identifiant client utilisé est `00000000402b5328` (= "Minecraft Java"). On le
  sait parce qu'il est **écrit dans tes jetons** (champ `aid` = `…402b5328`).
- Microsoft **fait tourner** le refresh token à chaque fois : on sauvegarde donc
  le nouveau dans le coffre (sinon il serait perdu).

Quand mineflayer voit que le jeton est périmé, `prismarine-auth` fait cette même
chaîne **tout seul** grâce au refresh token qu'on a mis dans le cache.

> ✅ **Vérifié en vrai :** la chaîne complète a refait un jeton neuf pour les 2
> comptes (valide ~24h). C'est ça qui évite de se reconnecter.

> ⚠️ **Si un compte n'a pas (ou plus) de refresh token valide :** il ne peut pas
> se rafraîchir tout seul. Le bot l'affiche en rouge "needs login".

---

## 3) Le coffre-fort ("vault")

Tous les comptes (pseudos, jetons, refresh tokens, cookies) sont **chiffrés** dans
un seul fichier `data/vault.enc`.

- 🔐 `src/vault/crypto.js` : ton mot de passe → une clé (via **scrypt**), puis
  chiffrement **AES‑256‑GCM**.
- 📦 `src/vault/vault.js` : ouvre/sauvegarde ce fichier.
- Sans le mot de passe, le fichier est **illisible**.

---

## 4) Les proxys

Un proxy fait passer la connexion par un autre ordinateur (le serveur voit l'IP du
proxy, pas la tienne).

- 📄 `src/proxy/proxy.js` gère **SOCKS5** et **HTTP CONNECT**.
- Il fournit à mineflayer une fonction `connect` qui pose un socket déjà branché.
  (Comportement vérifié dans le code de `minecraft-protocol`.)
- Réglage par compte (`account.proxy`) ou par rotation (`config.proxy.list`).

---

## 5) Le minage de terre

- 📄 `src/bot/miner.js` :
  1. cherche les blocs de terre autour du bot (`bot.findBlocks`),
  2. marche jusqu'au bloc avec **`mineflayer-pathfinder`**,
  3. prend une **pelle** si disponible, puis **casse** le bloc,
  4. recommence.
- Sécurités : pas de trou plus profond que `maxFallDistance`, abandon d'un bloc
  s'il prend trop de temps, petite pause "humaine" entre deux blocs.
- La **physique du fork** (plugin `@nxg-org/mineflayer-physics-util`) est activée
  via `bot.loadPlugin(...)`. (Vérifié : ce paquet exporte bien un `loader(bot)`.)

---

## 6) Plusieurs comptes en même temps

- 📄 `src/bot/createBot.js` : un "bot géré" par compte (connexion + refresh +
  proxy + minage + reconnexion).
- 📄 `src/manager/botManager.js` : lance tous les comptes (avec un petit décalage),
  distribue les proxys, et **sauvegarde les jetons rafraîchis** dans le coffre.
- 📄 `src/ui/dashboard.js` : le tableau en direct.

---

## 7) Reconnexion automatique

Si un bot tombe (kick, coupure), il **attend** puis **se reconnecte** tout seul
(`behavior.reconnectDelayMs`). À la reconnexion, si le jeton est périmé, il est
rafraîchi automatiquement. Tu n'as **rien** à faire.
